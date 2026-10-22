// Matcherino integration: pulls the registered-team count for a tournament
// straight from Matcherino's own bracket API, so the Discord announcement's
// "Slots" counter can track sign-ups happening over there instead of (or in
// addition to) the bot's own Join button.

// Matches e.g. https://matcherino.com/supercell/tournaments/221694/overview
const BOUNTY_ID_RE = /matcherino\.com\/(?:[^/?#]+\/)?tournaments\/(\d+)/i;

function extractBountyId(url) {
    if (!url) return null;
    const match = BOUNTY_ID_RE.exec(url);
    return match ? match[1] : null;
}

// Neither Matcherino API response shape is officially documented (observed:
// { status, body: [ { ..., entrants: [...] } ] } for brackets, and
// { status, body: { amount: "12.00" } } for totalSpent) — this walks the
// parsed JSON breadth-first (descending into arrays too) for the first
// occurrence of the given key, so small shape changes (an extra wrapper
// object, body being a single object instead of a one-item array) don't
// break either call.
function findField(payload, key) {
    const queue = [payload];
    const seen = new Set();
    while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object" || seen.has(node)) continue;
        seen.add(node);

        if (!Array.isArray(node) && key in node) return node[key];

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") queue.push(value);
        }
    }
    return undefined;
}

// Same idea as findField(), but only matches a string value — the bracket
// response has a "status" key at two different levels ({status: 200, body:
// [{..., status: "in-progress"}]}), and a plain findField() would return the
// outer HTTP-style status code first since it's found on the very first node.
function findStringField(payload, key) {
    const queue = [payload];
    const seen = new Set();
    while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object" || seen.has(node)) continue;
        seen.add(node);

        if (!Array.isArray(node) && key in node && typeof node[key] === "string") return node[key];

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") queue.push(value);
        }
    }
    return undefined;
}

// One call gets both the team count and the bracket's own lifecycle status
// (e.g. "scheduled", "in-progress", "completed") — the dashboard uses the
// latter to show more than just "registration open/closed".
async function fetchBracketInfo(bountyId) {
    const url = `https://api.matcherino.com/__api/brackets?bountyId=${encodeURIComponent(bountyId)}&id=0&isAdmin=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Matcherino API returned ${res.status}`);
    const data = await res.json();

    const entrants = findField(data, "entrants");
    const count = Array.isArray(entrants) ? entrants.length : typeof entrants === "number" ? entrants : null;
    if (count === null) throw new Error('Could not find an "entrants" list in the Matcherino API response');

    return { count, status: findStringField(data, "status") || null };
}

// The prize pool an organizer has funded for a bounty — shown alongside the
// team count so the announcement doesn't need it typed into the title by hand.
async function fetchPrizePool(bountyId) {
    const url = `https://api.matcherino.com/__api/bounties/totalSpent?bountyId=${encodeURIComponent(bountyId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Matcherino API returned ${res.status}`);
    const data = await res.json();
    const amount = findField(data, "amount");
    const parsed = parseFloat(amount);
    if (amount === undefined || Number.isNaN(parsed)) {
        throw new Error('Could not find an "amount" field in the Matcherino prize pool API response');
    }
    return parsed;
}

// Fetches the full bracket payload (same endpoint fetchBracketInfo uses) and
// returns its "matches" and "entrants" lists, so callers can locate a
// specific match and resolve team names for it.
async function fetchBracketMatches(bountyId) {
    const url = `https://api.matcherino.com/__api/brackets?bountyId=${encodeURIComponent(bountyId)}&id=0&isAdmin=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Matcherino API returned ${res.status}`);
    const data = await res.json();
    const matches = findField(data, "matches");
    if (!Array.isArray(matches)) throw new Error('Could not find a "matches" list in the Matcherino API response');
    const entrants = findField(data, "entrants");
    return { matches, entrants: Array.isArray(entrants) ? entrants : [] };
}

// The grand final is the match that actually decides 1st place. A bracket
// with a third-place decider has two matches tied for the last round, so
// round number alone isn't enough — winnerPlacement breaks the tie.
function findFinalMatch(matches) {
    if (!Array.isArray(matches) || !matches.length) return null;
    const finalRound = matches.reduce((max, m) => Math.max(max, m.totalRounds ?? 0), 0);
    const finalists = matches.filter((m) => m.roundNum === finalRound && (m.totalRounds ?? 0) === finalRound);
    if (!finalists.length) return matches[matches.length - 1];
    finalists.sort((a, b) => (a.winnerPlacement ?? 99) - (b.winnerPlacement ?? 99));
    return finalists[0];
}

// Narrow, poll-friendly endpoint: full detail for one match only, instead of
// re-fetching the whole bracket on every ~30s refresh. teamNamesById maps an
// entrant id (from the bracket's "entrants" list) to that team's name, so
// the match's two sides can be labeled — the match/stats response itself
// only carries entrant ids, not names.
async function fetchMatchStats(bountyId, matchId, teamNamesById = {}) {
    const url = `https://api.matcherino.com/__api/games/brawlstars/match/stats?bountyId=${encodeURIComponent(bountyId)}&matchIds=${encodeURIComponent(matchId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Matcherino API returned ${res.status}`);
    const data = await res.json();
    const matches = findField(data, "matches");
    const match = Array.isArray(matches) ? matches[0] : null;
    if (!match) throw new Error("Could not find match data in the Matcherino API response");
    return normalizeMatchStats(match, teamNamesById);
}

// Flattens a match payload down to what the live scoreboard needs: the match
// score, each side's team name, each individual game's score, and the
// nicknames of whoever played each game — resolved from populateBrawlerNames,
// which is keyed by an internal id rather than by the player tag the game
// results use.
function normalizeMatchStats(match, teamNamesById = {}) {
    const nameByTag = {};
    for (const info of Object.values(match.populateBrawlerNames || {})) {
        if (info && info.playerTag) nameByTag[info.playerTag] = info.name;
    }
    const games = (match.reports || []).map((report) => ({
        gameNumber: report.gameNumber,
        setNumber: report.setNumber,
        scoreA: report.scoreA,
        scoreB: report.scoreB,
        teams: (report.properties?.teams || []).map((team) => ({
            isWinner: Boolean(team?.isWinner),
            players: (team?.players || []).map((p) => nameByTag[p.tag] || p.tag),
        })),
    }));

    return {
        matchId: match.id,
        status: match.status,
        scoreA: match.entrantA?.score ?? 0,
        scoreB: match.entrantB?.score ?? 0,
        teamAName: teamNamesById[match.entrantA?.entrantId] || null,
        teamBName: teamNamesById[match.entrantB?.entrantId] || null,
        games,
    };
}

module.exports = {
    extractBountyId,
    fetchBracketInfo,
    fetchPrizePool,
    fetchBracketMatches,
    findFinalMatch,
    fetchMatchStats,
};
