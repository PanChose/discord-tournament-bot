require("dotenv").config();
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const {
    client,
    registerSlashCommands,
    attachHandlers,
    listGuildsAndChannels,
    listGuildRoles,
    listGuildEmojis,
    getBotInviteUrl,
    publishTournament,
    closeTournamentAnnouncement,
    refreshAnnouncementMessage,
} = require("./lib/discordClient");
const tournamentsLib = require("./lib/tournaments");
const matcherinoSync = require("./lib/matcherinoSync");
const oauth = require("./lib/oauth");
const { generateDescription } = require("./lib/ai");

const app = express();
app.use(express.json({ limit: "10mb" })); // banner images can be sent as base64 data URLs
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const SESSION_COOKIE = "session_id";
const STATE_COOKIE = "oauth_state";

// Discord's /users/@me/guilds is rate-limited; a logged-in organizer's guild
// list rarely changes mid-session, so we cache it for a short window instead
// of re-fetching it from Discord on every single API call the panel makes.
const guildsCache = new Map(); // sessionId -> { guilds, expiresAt }
const GUILDS_CACHE_TTL_MS = 30_000;

async function getOrganizerGuilds(session) {
    const cached = guildsCache.get(session.session_id);
    if (cached && cached.expiresAt > Date.now()) return cached.guilds;

    const accessToken = await oauth.getValidAccessToken(session);
    const allGuilds = await oauth.fetchUserGuilds(accessToken);
    const botGuildIds = new Set(listGuildsAndChannels().map((g) => g.id));

    const guilds = allGuilds
        .filter((g) => oauth.hasOrganizerPermission(g.permissions) && botGuildIds.has(g.id))
        .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

    guildsCache.set(session.session_id, { guilds, expiresAt: Date.now() + GUILDS_CACHE_TTL_MS });
    return guilds;
}

// --- Auth middleware ---
async function requireAuth(req, res, next) {
    const session = oauth.getSession(req.cookies[SESSION_COOKIE]);
    if (!session) return res.status(401).json({ error: "Not logged in" });
    req.session = session;
    next();
}

// Verifies the logged-in user is an organizer (Manage Server) of the guild
// the request targets, and that the bot is actually present there.
async function requireOrganizerOf(req, res, guildId) {
    const guilds = await getOrganizerGuilds(req.session);
    if (!guilds.some((g) => g.id === guildId)) {
        res.status(403).json({ error: "You don't have organizer access to this server" });
        return false;
    }
    return true;
}

// =========================================================================
// OAuth2 login
// =========================================================================

app.get("/auth/discord", (req, res) => {
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, { httpOnly: true, maxAge: 5 * 60 * 1000, sameSite: "lax" });
    res.redirect(oauth.getAuthorizeUrl(state));
});

app.get("/auth/discord/callback", async (req, res) => {
    const { code, state } = req.query;
    const expectedState = req.cookies[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);

    if (!code || !state || state !== expectedState) {
        return res.status(400).send("Login failed: invalid state. Please try again.");
    }

    try {
        const tokenResponse = await oauth.exchangeCode(code);
        const discordUser = await oauth.fetchDiscordUser(tokenResponse.access_token);
        const sessionId = oauth.createSession(discordUser, tokenResponse);
        res.cookie(SESSION_COOKIE, sessionId, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        res.redirect("/");
    } catch (err) {
        console.error("[oauth] login failed:", err);
        res.status(500).send("Login failed. Check server logs.");
    }
});

app.post("/api/logout", requireAuth, (req, res) => {
    oauth.destroySession(req.session.session_id);
    guildsCache.delete(req.session.session_id);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
    try {
        const guilds = await getOrganizerGuilds(req.session);
        res.json({
            user: { id: req.session.discord_user_id, username: req.session.username, avatar: req.session.avatar },
            guilds,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/status", (req, res) => {
    res.json({ ready: client.isReady(), tag: client.user ? client.user.tag : null });
});

// Public on purpose — a server admin needs this link before they've logged in at all.
app.get("/api/bot-invite-url", (req, res) => {
    res.json({ url: getBotInviteUrl() });
});

// =========================================================================
// Guild info (channels / roles for the tournament form dropdowns)
// =========================================================================

app.get("/api/guilds/:guildId", requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!(await requireOrganizerOf(req, res, guildId))) return;
    const guild = listGuildsAndChannels().find((g) => g.id === guildId);
    if (!guild) return res.status(404).json({ error: "Bot is not in this server" });
    res.json({ channels: guild.channels, roles: listGuildRoles(guildId) });
});

// Custom server emojis for the description editor's emoji picker.
app.get("/api/guilds/:guildId/emojis", requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!(await requireOrganizerOf(req, res, guildId))) return;
    res.json({ emojis: listGuildEmojis(guildId) });
});

// =========================================================================
// Tournaments CRUD
// =========================================================================

app.get("/api/tournaments", requireAuth, async (req, res) => {
    const { guildId } = req.query;
    if (!guildId) return res.status(400).json({ error: "guildId is required" });
    if (!(await requireOrganizerOf(req, res, guildId))) return;
    res.json({ tournaments: tournamentsLib.listTournaments(guildId) });
});

app.post("/api/tournaments", requireAuth, async (req, res) => {
    const { guildId, ...data } = req.body;
    if (!guildId || !data.name || !data.channelId) {
        return res.status(400).json({ error: "guildId, name and channelId are required" });
    }
    if (!(await requireOrganizerOf(req, res, guildId))) return;
    const tournament = tournamentsLib.createTournament(guildId, req.session.discord_user_id, data);
    res.json({ tournament });
});

async function loadOwnedTournament(req, res) {
    const tournament = tournamentsLib.getTournament(req.params.id);
    if (!tournament) {
        res.status(404).json({ error: "Tournament not found" });
        return null;
    }
    if (!(await requireOrganizerOf(req, res, tournament.guild_id))) return null;
    return tournament;
}

app.patch("/api/tournaments/:id", requireAuth, async (req, res) => {
    const tournament = await loadOwnedTournament(req, res);
    if (!tournament) return;
    try {
        const updated = tournamentsLib.updateTournament(tournament.id, req.body);
        if (updated.status === "published") await refreshAnnouncementMessage(updated);
        res.json({ tournament: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/tournaments/:id", requireAuth, async (req, res) => {
    const tournament = await loadOwnedTournament(req, res);
    if (!tournament) return;
    tournamentsLib.deleteTournament(tournament.id);
    res.json({ ok: true });
});

app.post("/api/tournaments/:id/publish", requireAuth, async (req, res) => {
    const tournament = await loadOwnedTournament(req, res);
    if (!tournament) return;
    if (tournament.status !== "draft") return res.status(400).json({ error: "Already published" });
    if (!client.isReady()) return res.status(503).json({ error: "The bot hasn't connected to Discord yet" });
    try {
        const published = await publishTournament(tournament);
        res.json({ tournament: published });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/tournaments/:id/close", requireAuth, async (req, res) => {
    const tournament = await loadOwnedTournament(req, res);
    if (!tournament) return;
    if (tournament.status !== "published") return res.status(400).json({ error: "Not open for registration" });
    try {
        const closed = tournamentsLib.setClosed(tournament.id);
        await closeTournamentAnnouncement(closed);
        res.json({ tournament: closed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Manually kick off a Matcherino entrants re-check instead of waiting for the
// next automatic tick (lib/matcherinoSync.js runs this every ~4 minutes anyway).
app.post("/api/tournaments/:id/matcherino-sync", requireAuth, async (req, res) => {
    const tournament = await loadOwnedTournament(req, res);
    if (!tournament) return;
    if (!tournament.matcherino_bounty_id) {
        return res.status(400).json({ error: "This tournament's external link isn't a Matcherino tournament URL" });
    }
    try {
        const updated = await matcherinoSync.syncOne(tournament);
        res.json({ tournament: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/tournaments/:id/participants", requireAuth, async (req, res) => {
    const tournament = await loadOwnedTournament(req, res);
    if (!tournament) return;
    res.json({ participants: tournamentsLib.listParticipants(tournament.id) });
});

app.get("/api/tournaments/:id/participants.csv", requireAuth, async (req, res) => {
    const tournament = await loadOwnedTournament(req, res);
    if (!tournament) return;
    const csv = tournamentsLib.exportParticipantsCsv(tournament.id);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tournament.name.replace(/[^a-z0-9]/gi, "_")}_participants.csv"`);
    res.send(csv);
});

// =========================================================================
// Optional AI helper (Claude) — generates a description from a few keywords
// =========================================================================

app.post("/api/ai/generate-description", requireAuth, async (req, res) => {
    try {
        const description = await generateDescription(req.body || {});
        res.json({ description });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;

async function main() {
    if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
        console.error("❌ Fill in DISCORD_TOKEN and DISCORD_CLIENT_ID in .env before starting");
        process.exit(1);
    }
    if (!process.env.DISCORD_CLIENT_SECRET || !process.env.ENCRYPTION_KEY) {
        console.warn("⚠️  DISCORD_CLIENT_SECRET / ENCRYPTION_KEY not set — the web panel's Discord login will not work.");
    }

    attachHandlers();

    // Start serving the panel immediately — a slow/failed Discord login shouldn't
    // take the whole web service down with it (that's why /api/status exists:
    // the panel can be up while it reports the bot as not-yet-ready).
    app.listen(PORT, () => {
        console.log(`[panel] Web panel available at http://localhost:${PORT}`);
    });

    try {
        await registerSlashCommands();
        await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
        console.error("❌ Discord bot failed to start (web panel is still running):", err.message);
    }
}

main().catch((err) => {
    console.error("Startup error:", err);
    process.exit(1);
});
