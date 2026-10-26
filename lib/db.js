const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "bot.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT,
    name TEXT NOT NULL,
    game TEXT,
    format TEXT,
    starts_at INTEGER,
    max_participants INTEGER NOT NULL DEFAULT 32,
    description TEXT,
    banner TEXT,
    external_url TEXT,
    color TEXT DEFAULT '#8b5cf6',
    status TEXT NOT NULL DEFAULT 'draft',
    reminder_hours INTEGER,
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    start_ping_sent INTEGER NOT NULL DEFAULT 0,
    ping_role_id TEXT,
    organizer_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    registered_at INTEGER NOT NULL,
    UNIQUE(tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS oauth_sessions (
    session_id TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    username TEXT,
    avatar TEXT,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments(guild_id);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON registrations(tournament_id);
`);

// Lightweight migration for databases created before external_url existed —
// CREATE TABLE IF NOT EXISTS above only helps on a brand-new database file.
const tournamentColumns = db.prepare("PRAGMA table_info(tournaments)").all().map((c) => c.name);
if (!tournamentColumns.includes("external_url")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN external_url TEXT");
}
// Matcherino team-count sync: bounty id parsed from external_url, plus the last
// entrants count read from their API and when that read happened.
if (!tournamentColumns.includes("matcherino_bounty_id")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN matcherino_bounty_id TEXT");
    db.exec("ALTER TABLE tournaments ADD COLUMN matcherino_entrants INTEGER");
    db.exec("ALTER TABLE tournaments ADD COLUMN matcherino_checked_at INTEGER");
}
// Reminder DMs are now scheduled for an exact time instead of "N hours before
// start" — reminder_hours is left in place (unused) rather than dropped, since
// SQLite can't cheaply drop a column and nothing reads it anymore.
if (!tournamentColumns.includes("reminder_at")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN reminder_at INTEGER");
}
if (!tournamentColumns.includes("matcherino_prize_pool")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN matcherino_prize_pool REAL");
}
// Auto-react emoji: reaction_emoji_id is set only for a custom server emoji
// (its snowflake); reaction_emoji_name holds either that emoji's name or, for
// a standard unicode emoji, the character itself.
if (!tournamentColumns.includes("reaction_emoji_name")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN reaction_emoji_id TEXT");
    db.exec("ALTER TABLE tournaments ADD COLUMN reaction_emoji_name TEXT");
}
// Real role ping in the message content when the announcement is first
// published (embeds never trigger a notification, even with a mention inside
// them) — separate from ping_role_id's existing "ping when it starts" use.
if (!tournamentColumns.includes("ping_on_publish")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN ping_on_publish INTEGER NOT NULL DEFAULT 0");
}
// Embed author line (small icon + name shown above the title) and a
// thumbnail (small image in the embed's top-right corner) — independent of
// the big banner image at the bottom.
if (!tournamentColumns.includes("author_name")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN author_name TEXT");
    db.exec("ALTER TABLE tournaments ADD COLUMN author_icon TEXT");
    db.exec("ALTER TABLE tournaments ADD COLUMN thumbnail TEXT");
}
// The bracket's own lifecycle status ("scheduled", "in-progress",
// "completed", ...) — lets the dashboard show more than just registration
// open/closed once a linked Matcherino tournament actually starts/finishes.
if (!tournamentColumns.includes("matcherino_status")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN matcherino_status TEXT");
}
// Lets an organizer override the reminder DM's default "⏰ Reminder: ..." text
// with their own message, sent verbatim instead.
if (!tournamentColumns.includes("reminder_message")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN reminder_message TEXT");
}
// The start-time channel ping (announceStart) used to fire unconditionally
// whenever ping_role_id was set — start_ping_enabled makes it an explicit,
// separate opt-in, and start_ping_message lets it be customized the same
// way reminder_message already overrides the reminder DM's default text.
if (!tournamentColumns.includes("start_ping_enabled")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN start_ping_enabled INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE tournaments ADD COLUMN start_ping_message TEXT");
}
// The start message's own role to ping — independent of ping_role_id, which
// is only ever used for the publish-time ping.
if (!tournamentColumns.includes("start_ping_role_id")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN start_ping_role_id TEXT");
}
// The Winners tab's "winner announcement" message — a template with
// {tournament}/{game}/{winner}/{winnerPlayers}/{loser}/{loserPlayers}/{score}
// placeholders, resolved against the live Matcherino match data and sent
// manually (no auto-trigger, no separate enable flag).
if (!tournamentColumns.includes("winner_message_text")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN winner_message_text TEXT");
}
// "Full edit" overrides for the winner message — each blank/null by default,
// falling back to the tournament's own title/color/thumbnail.
if (!tournamentColumns.includes("winner_message_title")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN winner_message_title TEXT");
    db.exec("ALTER TABLE tournaments ADD COLUMN winner_message_color TEXT");
    db.exec("ALTER TABLE tournaments ADD COLUMN winner_message_thumbnail TEXT");
}

module.exports = { db };
