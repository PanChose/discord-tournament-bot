const tournamentsLib = require("./tournaments");
const matcherino = require("./matcherino");

// Comfortably inside the "every 3-5 minutes" the organizer asked for.
const CHECK_INTERVAL_MS = 4 * 60 * 1000;
let started = false;

// Fetches the current entrants count for one tournament, stores it, refreshes
// the live announcement, and — if the count actually changed since the last
// check — posts a "+N teams" / "-N slots" update. Exported so the web panel
// can also trigger it on demand (see /api/tournaments/:id/matcherino-sync).
async function syncOne(tournament) {
    if (!tournament.matcherino_bounty_id) return tournament;
    const discordClient = require("./discordClient");

    const count = await matcherino.fetchEntrantsCount(tournament.matcherino_bounty_id);
    const previous = tournament.matcherino_entrants;
    const updated = tournamentsLib.updateMatcherinoCount(tournament.id, count);

    if (updated.status === "published") {
        await discordClient.refreshAnnouncementMessage(updated).catch(() => {});
    }

    // A null/undefined previous reading means this is the first check ever —
    // that just establishes the baseline, nothing "changed" yet, so stay quiet.
    if (previous !== null && previous !== undefined && count !== previous && updated.status === "published") {
        await discordClient.postMatcherinoDelta(updated, count - previous).catch(() => {});
    }

    return updated;
}

async function tick() {
    for (const tournament of tournamentsLib.listPublishedWithMatcherino()) {
        try {
            await syncOne(tournament);
        } catch (err) {
            console.error(`[matcherino] Failed to sync tournament "${tournament.name}":`, err.message);
        }
    }
}

function start() {
    if (started) return;
    started = true;
    setInterval(() => {
        tick().catch((err) => console.error("[matcherino] sync tick failed:", err.message));
    }, CHECK_INTERVAL_MS);
    console.log(`[matcherino] Sync loop started (checking every ${CHECK_INTERVAL_MS / 60_000} min)`);
}

module.exports = { start, syncOne, tick };
