const tournamentsLib = require("./tournaments");
const matcherino = require("./matcherino");

// Comfortably inside the "every 3-5 minutes" the organizer asked for.
const CHECK_INTERVAL_MS = 4 * 60 * 1000;
let started = false;

// Fetches the current entrants count for one tournament, stores it, and
// silently refreshes the live announcement's fields — no per-change channel
// message, so registrations trickling in don't spam the channel. Exported so
// the web panel can also trigger it on demand (see /api/tournaments/:id/matcherino-sync).
async function syncOne(tournament) {
    if (!tournament.matcherino_bounty_id) return tournament;
    const discordClient = require("./discordClient");

    const count = await matcherino.fetchEntrantsCount(tournament.matcherino_bounty_id);

    // The prize pool is a separate endpoint and a "nice to have" — a failure
    // here shouldn't block updating the (more important) team count.
    let prizePool = null;
    try {
        prizePool = await matcherino.fetchPrizePool(tournament.matcherino_bounty_id);
    } catch (err) {
        console.error(`[matcherino] Failed to fetch prize pool for bounty ${tournament.matcherino_bounty_id}:`, err.message);
    }

    const updated = tournamentsLib.updateMatcherinoStats(tournament.id, { entrants: count, prizePool });

    if (updated.status === "published") {
        await discordClient.refreshAnnouncementMessage(updated).catch(() => {});
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
