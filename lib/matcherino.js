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

// The bracket API's response shape isn't officially documented. Observed shape
// is { status, body: [ { ..., entrants: [...] } ] } — this walks the parsed
// JSON breadth-first (descending into arrays too) for the first "entrants"
// list/count instead of hard-coding that one path, so small shape changes
// (e.g. body being a single object instead of a one-item array) don't break it.
function findEntrantsCount(payload) {
    const queue = [payload];
    const seen = new Set();
    while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object" || seen.has(node)) continue;
        seen.add(node);

        if (!Array.isArray(node) && "entrants" in node) {
            const value = node.entrants;
            if (Array.isArray(value)) return value.length;
            if (typeof value === "number") return value;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") queue.push(value);
        }
    }
    return null;
}

async function fetchEntrantsCount(bountyId) {
    const url = `https://api.matcherino.com/__api/brackets?bountyId=${encodeURIComponent(bountyId)}&id=0&isAdmin=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Matcherino API returned ${res.status}`);
    const data = await res.json();
    const count = findEntrantsCount(data);
    if (count === null) throw new Error('Could not find an "entrants" list in the Matcherino API response');
    return count;
}

module.exports = { extractBountyId, fetchEntrantsCount };
