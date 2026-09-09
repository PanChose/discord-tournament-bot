const crypto = require("crypto");
const { db } = require("./db");
const { encrypt, decrypt } = require("./crypto");

const DISCORD_API = "https://discord.com/api/v10";
const SCOPES = "identify guilds";

function getRedirectUri() {
    return process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/auth/discord/callback";
}

function getAuthorizeUrl(state) {
    const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: getRedirectUri(),
        response_type: "code",
        scope: SCOPES,
        state,
        prompt: "consent",
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
    const body = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(),
    });
    const res = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status} ${await res.text()}`);
    return res.json(); // { access_token, refresh_token, expires_in, ... }
}

async function refreshToken(refresh_token) {
    const body = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token,
    });
    const res = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) throw new Error(`Discord token refresh failed: ${res.status} ${await res.text()}`);
    return res.json();
}

async function fetchDiscordUser(accessToken) {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch Discord user: ${res.status}`);
    return res.json();
}

// Every guild the user is in, plus their permission bitfield for it — used to
// filter down to guilds where the logged-in user actually has Manage Server rights.
async function fetchUserGuilds(accessToken) {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
        headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch user guilds: ${res.status}`);
    return res.json();
}

const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;
function hasOrganizerPermission(permissionsBitfield) {
    const perms = BigInt(permissionsBitfield);
    return (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;
}

// --- Session storage (DB-backed, tokens encrypted at rest) ---

function createSession(discordUser, tokenResponse) {
    const sessionId = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
    db.prepare(
        `INSERT INTO oauth_sessions (session_id, discord_user_id, username, avatar, access_token_enc, refresh_token_enc, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        sessionId,
        discordUser.id,
        discordUser.username,
        discordUser.avatar,
        encrypt(tokenResponse.access_token),
        encrypt(tokenResponse.refresh_token),
        expiresAt,
        Date.now()
    );
    return sessionId;
}

function getSession(sessionId) {
    if (!sessionId) return null;
    return db.prepare(`SELECT * FROM oauth_sessions WHERE session_id = ?`).get(sessionId) || null;
}

function destroySession(sessionId) {
    db.prepare(`DELETE FROM oauth_sessions WHERE session_id = ?`).run(sessionId);
}

// Returns a valid access token for this session, transparently refreshing
// (and re-encrypting the new pair) if the stored one has expired.
async function getValidAccessToken(session) {
    if (session.expires_at > Date.now() + 10_000) {
        return decrypt(session.access_token_enc);
    }
    const refreshed = await refreshToken(decrypt(session.refresh_token_enc));
    const expiresAt = Date.now() + refreshed.expires_in * 1000;
    db.prepare(
        `UPDATE oauth_sessions SET access_token_enc = ?, refresh_token_enc = ?, expires_at = ? WHERE session_id = ?`
    ).run(encrypt(refreshed.access_token), encrypt(refreshed.refresh_token), expiresAt, session.session_id);
    return refreshed.access_token;
}

module.exports = {
    getAuthorizeUrl,
    exchangeCode,
    fetchDiscordUser,
    fetchUserGuilds,
    hasOrganizerPermission,
    createSession,
    getSession,
    destroySession,
    getValidAccessToken,
};
