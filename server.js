require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const {
    client,
    registerSlashCommands,
    attachHandlers,
    sendMessageToChannel,
    listGuildsAndChannels,
    listAllEmojis,
    listGuildRoles,
    tournamentSystem,
} = require("./lib/discordClient");
const { matcherinoSync, teams: teamsLib, tournaments: tournamentsLib } = tournamentSystem;
// AI functionality is temporarily disabled, see NOTES.md
// const { askAI } = require("./lib/ai");
// const { fetchMatcherinoContext } = require("./lib/matcherino");

const app = express();
app.use(cors());
// Higher limit — the request carries base64-encoded images uploaded locally
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- simple panel auth via a password from .env ---
function checkAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");
    if (!process.env.PANEL_PASSWORD) {
        return res.status(500).json({ error: "PANEL_PASSWORD is not set on the server" });
    }
    if (token !== process.env.PANEL_PASSWORD) {
        return res.status(401).json({ error: "Wrong password" });
    }
    next();
}

app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (password === process.env.PANEL_PASSWORD) {
        return res.json({ token: password });
    }
    res.status(401).json({ error: "Wrong password" });
});

app.get("/api/status", checkAuth, (req, res) => {
    res.json({
        ready: client.isReady(),
        tag: client.user ? client.user.tag : null,
    });
});

app.get("/api/guilds", checkAuth, (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: "The bot hasn't connected to Discord yet" });
    }
    res.json({ guilds: listGuildsAndChannels() });
});

app.get("/api/emojis", checkAuth, (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: "The bot hasn't connected to Discord yet" });
    }
    res.json({ emojis: listAllEmojis() });
});

app.get("/api/roles", checkAuth, (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: "The bot hasn't connected to Discord yet" });
    }
    const { guildId } = req.query;
    if (!guildId) {
        return res.status(400).json({ error: "guildId is required" });
    }
    res.json({ roles: listGuildRoles(guildId) });
});

app.post("/api/send", checkAuth, async (req, res) => {
    const { guildId, channelId, content, embed, buttonRows, reactionEmoji } = req.body;
    if (!guildId || !channelId) {
        return res.status(400).json({ error: "guildId and channelId are required" });
    }
    try {
        const result = await sendMessageToChannel(guildId, channelId, {
            content,
            embed,
            buttonRows,
            reactionEmoji,
        });
        res.json({ ok: true, reactionWarning: result.reactionWarning || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// The /api/ask route (AI helper) is temporarily disabled, see NOTES.md for how to re-enable it.

// =========================================================================
// Tournament system management (verification sync, active tournament, leaderboard)
// =========================================================================

// --- Matcherino sync (drives /verify's automatic Discord-account matching) ---
app.get("/api/tournament/matcherino-status", checkAuth, (req, res) => {
    res.json(matcherinoSync.getStatus());
});

app.post("/api/tournament/matcherino-bounty-id", checkAuth, async (req, res) => {
    const { bountyId } = req.body;
    if (!bountyId) {
        return res.status(400).json({ error: "bountyId is required" });
    }
    const status = await matcherinoSync.setBountyId(bountyId);
    res.json(status);
});

app.post("/api/tournament/matcherino-sync-now", checkAuth, async (req, res) => {
    const status = await matcherinoSync.syncNow();
    res.json(status);
});

// --- Active Discord tournament (view / end from the panel instead of /tournament end) ---
app.get("/api/tournament/active", checkAuth, (req, res) => {
    const { guildId } = req.query;
    if (!guildId) return res.status(400).json({ error: "guildId is required" });
    const tournament = tournamentsLib.getActiveTournament(guildId);
    res.json({ tournament: tournament || null });
});

app.post("/api/tournament/end", checkAuth, async (req, res) => {
    const { guildId } = req.body;
    if (!guildId) return res.status(400).json({ error: "guildId is required" });
    if (!client.isReady()) return res.status(503).json({ error: "The bot hasn't connected to Discord yet" });

    const tournament = tournamentsLib.getActiveTournament(guildId);
    if (!tournament) return res.status(404).json({ error: "No active tournament for this server" });

    try {
        const guild = await client.guilds.fetch(guildId);
        await tournamentsLib.endTournament(guild, tournament);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Leaderboard (read-only view for the panel) ---
app.get("/api/tournament/leaderboard", checkAuth, (req, res) => {
    const { guildId } = req.query;
    if (!guildId) return res.status(400).json({ error: "guildId is required" });
    res.json({ teams: teamsLib.leaderboard(guildId, 20) });
});

const PORT = process.env.PORT || 3000;

async function main() {
    if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
        console.error(
            "❌ Fill in DISCORD_TOKEN and DISCORD_CLIENT_ID in .env before starting"
        );
        process.exit(1);
    }

    attachHandlers();
    await registerSlashCommands();
    await client.login(process.env.DISCORD_TOKEN);

    app.listen(PORT, () => {
        console.log(`[panel] Web panel available at http://localhost:${PORT}`);
    });
}

main().catch((err) => {
    console.error("Startup error:", err);
    process.exit(1);
});