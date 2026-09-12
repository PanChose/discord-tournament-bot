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

async function fetchEntrantsCount(bountyId) {
    const url = `https://api.matcherino.com/__api/brackets?bountyId=${encodeURIComponent(bountyId)}&id=0&isAdmin=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Matcherino API returned ${res.status}`);
    const data = await res.json();
    const entrants = findField(data, "entrants");
    if (Array.isArray(entrants)) return entrants.length;
    if (typeof entrants === "number") return entrants;
    throw new Error('Could not find an "entrants" list in the Matcherino API response');
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

module.exports = { extractBountyId, fetchEntrantsCount, fetchPrizePool };
