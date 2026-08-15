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
} = require("./lib/discordClient");
// ИИ-функционал временно отключён, см. NOTES.md
// const { askAI } = require("./lib/ai");
// const { fetchMatcherinoContext } = require("./lib/matcherino");

const app = express();
app.use(cors());
// Увеличенный лимит — в запросе передаются base64-картинки, загруженные локально
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- простая авторизация панели через пароль из .env ---
function checkAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");
    if (!process.env.PANEL_PASSWORD) {
        return res.status(500).json({ error: "PANEL_PASSWORD не задан на сервере" });
    }
    if (token !== process.env.PANEL_PASSWORD) {
        return res.status(401).json({ error: "Неверный пароль" });
    }
    next();
}

app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (password === process.env.PANEL_PASSWORD) {
        return res.json({ token: password });
    }
    res.status(401).json({ error: "Неверный пароль" });
});

app.get("/api/status", checkAuth, (req, res) => {
    res.json({
        ready: client.isReady(),
        tag: client.user ? client.user.tag : null,
    });
});

app.get("/api/guilds", checkAuth, (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: "Бот ещё не подключился к Discord" });
    }
    res.json({ guilds: listGuildsAndChannels() });
});

app.get("/api/emojis", checkAuth, (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: "Бот ещё не подключился к Discord" });
    }
    res.json({ emojis: listAllEmojis() });
});

app.post("/api/send", checkAuth, async (req, res) => {
    const { guildId, channelId, content, embed, buttonRows, reactionEmoji } = req.body;
    if (!guildId || !channelId) {
        return res.status(400).json({ error: "guildId и channelId обязательны" });
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

// Роут /api/ask (ИИ-помощник) временно отключён, см. NOTES.md — как включить обратно.

const PORT = process.env.PORT || 3000;

async function main() {
    if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
        console.error(
            "❌ Заполни DISCORD_TOKEN и DISCORD_CLIENT_ID в .env перед запуском"
        );
        process.exit(1);
    }

    attachHandlers();
    await registerSlashCommands();
    await client.login(process.env.DISCORD_TOKEN);

    app.listen(PORT, () => {
        console.log(`[panel] Веб-панель доступна на http://localhost:${PORT}`);
    });
}

main().catch((err) => {
    console.error("Ошибка запуска:", err);
    process.exit(1);
});