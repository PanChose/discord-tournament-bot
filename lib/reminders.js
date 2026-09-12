const tournamentsLib = require("./tournaments");

const CHECK_INTERVAL_MS = 60 * 1000;
let started = false;

async function tick() {
    const discordClient = require("./discordClient");
    const now = Date.now();

    for (const tournament of tournamentsLib.listPublishedNeedingAttention()) {
        if (!tournament.reminder_sent && tournament.reminder_at && tournament.reminder_at <= now) {
            const participants = tournamentsLib.listParticipants(tournament.id);
            for (const p of participants) {
                discordClient.sendReminderDM(p.user_id, tournament).catch(() => {});
            }
            tournamentsLib.markReminderSent(tournament.id);
        }

        if (!tournament.start_ping_sent && tournament.starts_at && tournament.starts_at <= now) {
            discordClient.announceStart(tournament).catch(() => {});
            tournamentsLib.markStartPingSent(tournament.id);
        }
    }
}

function start() {
    if (started) return;
    started = true;
    setInterval(() => {
        tick().catch((err) => console.error("[reminders] tick failed:", err.message));
    }, CHECK_INTERVAL_MS);
    console.log("[reminders] Reminder loop started (checking every 60s)");
}

module.exports = { start };
