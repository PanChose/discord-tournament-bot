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

module.exports = { db };
