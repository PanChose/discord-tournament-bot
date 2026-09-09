const crypto = require("crypto");
const { db } = require("./db");

const FORMAT_LABELS = {
    single_elim: "Single Elimination",
    double_elim: "Double Elimination",
    round_robin: "Round Robin",
};

const STATUS_LABELS = {
    draft: "Draft",
    published: "Registration Open",
    closed: "Registration Closed",
};

function createTournament(guildId, organizerId, data) {
    const id = crypto.randomUUID();
    const now = Date.now();
    db.prepare(
        `INSERT INTO tournaments
         (id, guild_id, channel_id, name, game, format, starts_at, max_participants, description, banner, color, status, reminder_hours, ping_role_id, organizer_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
    ).run(
        id,
        guildId,
        data.channelId || null,
        data.name,
        data.game || null,
        data.format || "single_elim",
        data.startsAt || null,
        data.maxParticipants || 32,
        data.description || null,
        data.banner || null,
        data.color || "#8b5cf6",
        data.reminderHours || null,
        data.pingRoleId || null,
        organizerId,
        now,
        now
    );
    return getTournament(id);
}

const EDITABLE_FIELDS = {
    channelId: "channel_id",
    name: "name",
    game: "game",
    format: "format",
    startsAt: "starts_at",
    maxParticipants: "max_participants",
    description: "description",
    banner: "banner",
    color: "color",
    reminderHours: "reminder_hours",
    pingRoleId: "ping_role_id",
};

function updateTournament(id, data) {
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            sets.push(`${column} = ?`);
            values.push(data[key]);
        }
    }
    if (!sets.length) return getTournament(id);
    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);
    db.prepare(`UPDATE tournaments SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return getTournament(id);
}

function setPublished(id, channelId, messageId) {
    db.prepare(
        `UPDATE tournaments SET status = 'published', channel_id = ?, message_id = ?, updated_at = ? WHERE id = ?`
    ).run(channelId, messageId, Date.now(), id);
    return getTournament(id);
}

function setClosed(id) {
    db.prepare(`UPDATE tournaments SET status = 'closed', updated_at = ? WHERE id = ?`).run(Date.now(), id);
    return getTournament(id);
}

function deleteTournament(id) {
    db.prepare(`DELETE FROM tournaments WHERE id = ?`).run(id);
}

function getTournament(id) {
    return db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(id) || null;
}

function listTournaments(guildId) {
    return db
        .prepare(`SELECT * FROM tournaments WHERE guild_id = ? ORDER BY created_at DESC`)
        .all(guildId)
        .map((t) => ({ ...t, activeCount: countActive(t.id) }));
}

function countActive(tournamentId) {
    return db
        .prepare(`SELECT COUNT(*) c FROM registrations WHERE tournament_id = ? AND status = 'active'`)
        .get(tournamentId).c;
}

/**
 * Registers a participant. Runs as a single better-sqlite3 transaction — every
 * statement below executes synchronously on Node's single thread with no `await`
 * in between, so two "register" calls arriving at nearly the same time (e.g. two
 * people clicking the button within the same millisecond) can never both read the
 * same "11/12 slots free" snapshot and both insert: whichever call's transaction
 * commits first is immediately visible to the second one's COUNT(*). That's what
 * prevents overselling slots — no separate locking layer needed.
 */
function registerParticipant(tournamentId, userId, username) {
    const tx = db.transaction(() => {
        const tournament = getTournament(tournamentId);
        if (!tournament) return { ok: false, reason: "not_found" };
        if (tournament.status !== "published") return { ok: false, reason: "not_open" };

        const existing = db
            .prepare(`SELECT * FROM registrations WHERE tournament_id = ? AND user_id = ?`)
            .get(tournamentId, userId);
        if (existing && existing.status === "active") {
            return { ok: false, reason: "already_registered" };
        }

        const activeCount = countActive(tournamentId);
        if (activeCount >= tournament.max_participants) {
            return { ok: false, reason: "full" };
        }

        if (existing) {
            db.prepare(`UPDATE registrations SET status = 'active', registered_at = ?, username = ? WHERE id = ?`).run(
                Date.now(),
                username,
                existing.id
            );
        } else {
            db.prepare(
                `INSERT INTO registrations (tournament_id, user_id, username, status, registered_at) VALUES (?, ?, ?, 'active', ?)`
            ).run(tournamentId, userId, username, Date.now());
        }

        const count = activeCount + 1;
        return { ok: true, count, max: tournament.max_participants, full: count >= tournament.max_participants };
    });
    return tx();
}

function unregisterParticipant(tournamentId, userId) {
    const tx = db.transaction(() => {
        const tournament = getTournament(tournamentId);
        if (!tournament) return { ok: false, reason: "not_found" };

        const existing = db
            .prepare(`SELECT * FROM registrations WHERE tournament_id = ? AND user_id = ?`)
            .get(tournamentId, userId);
        if (!existing || existing.status !== "active") {
            return { ok: false, reason: "not_registered" };
        }

        db.prepare(`UPDATE registrations SET status = 'cancelled' WHERE id = ?`).run(existing.id);
        const count = countActive(tournamentId);
        return { ok: true, count, max: tournament.max_participants };
    });
    return tx();
}

// Published tournaments that still need a reminder DM and/or a start-time role
// ping sent — polled by lib/reminders.js instead of scheduling per-tournament timers.
function listPublishedNeedingAttention() {
    return db
        .prepare(
            `SELECT * FROM tournaments WHERE status = 'published' AND starts_at IS NOT NULL
             AND (reminder_sent = 0 OR start_ping_sent = 0)`
        )
        .all();
}

function markReminderSent(id) {
    db.prepare(`UPDATE tournaments SET reminder_sent = 1 WHERE id = ?`).run(id);
}

function markStartPingSent(id) {
    db.prepare(`UPDATE tournaments SET start_ping_sent = 1 WHERE id = ?`).run(id);
}

function listActiveRegistrationsForUser(guildId, userId) {
    return db
        .prepare(
            `SELECT t.id, t.name FROM registrations r
             JOIN tournaments t ON t.id = r.tournament_id
             WHERE t.guild_id = ? AND r.user_id = ? AND r.status = 'active'`
        )
        .all(guildId, userId);
}

function listParticipants(tournamentId) {
    return db
        .prepare(
            `SELECT user_id, username, status, registered_at FROM registrations
             WHERE tournament_id = ? AND status = 'active' ORDER BY registered_at ASC`
        )
        .all(tournamentId);
}

function exportParticipantsCsv(tournamentId) {
    const rows = listParticipants(tournamentId);
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "username,user_id,registered_at,status";
    const lines = rows.map((r) =>
        [escape(r.username), escape(r.user_id), escape(new Date(r.registered_at).toISOString()), escape(r.status)].join(",")
    );
    return [header, ...lines].join("\n");
}

/**
 * Plain-data shape for a tournament's announcement embed — the single source
 * of truth for what the announcement looks like. The Discord bot converts this
 * into a real discord.js EmbedBuilder before sending/editing a message; the web
 * panel keeps its own lightweight mirror of this shape purely for the local
 * live-preview (see public/panel.js) so it never has to call the Discord API
 * on every keystroke.
 */
function buildEmbedData(tournament, activeCount) {
    const fields = [];
    if (tournament.game) fields.push({ name: "Game", value: tournament.game, inline: true });
    fields.push({ name: "Format", value: FORMAT_LABELS[tournament.format] || tournament.format, inline: true });
    fields.push({
        name: "Slots",
        value: `${activeCount}/${tournament.max_participants}`,
        inline: true,
    });
    if (tournament.starts_at) {
        fields.push({ name: "Starts", value: `<t:${Math.floor(tournament.starts_at / 1000)}:F>`, inline: false });
    }

    return {
        title: tournament.name,
        description: tournament.description || undefined,
        color: tournament.color || "#8b5cf6",
        image: tournament.banner || undefined,
        fields,
        footer: STATUS_LABELS[tournament.status] || tournament.status,
    };
}

module.exports = {
    FORMAT_LABELS,
    STATUS_LABELS,
    createTournament,
    updateTournament,
    setPublished,
    setClosed,
    deleteTournament,
    getTournament,
    listTournaments,
    countActive,
    registerParticipant,
    unregisterParticipant,
    listActiveRegistrationsForUser,
    listPublishedNeedingAttention,
    markReminderSent,
    markStartPingSent,
    listParticipants,
    exportParticipantsCsv,
    buildEmbedData,
};
