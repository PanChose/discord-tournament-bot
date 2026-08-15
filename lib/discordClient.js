const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
// ИИ-функционал временно отключён, см. NOTES.md — как включить обратно.
// const { askAI } = require("./ai");
// const { fetchMatcherinoContext } = require("./matcherino");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

// Слэш-команда /ask (ИИ-помощник) временно закомментирована, см. NOTES.md
const commands = [
    // new SlashCommandBuilder()
    //   .setName("ask")
    //   .setDescription("Спросить ИИ про турниры Matcherino / Brawl Stars")
    //   .addStringOption((opt) =>
    //     opt.setName("question").setDescription("Твой вопрос").setRequired(true)
    //   )
    //   .addStringOption((opt) =>
    //     opt
    //       .setName("tournament_url")
    //       .setDescription("Ссылка на страницу турнира на matcherino.com (необязательно)")
    //       .setRequired(false)
    //   ),
].map((c) => c.toJSON());

async function registerSlashCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
        body: commands,
    });
    console.log("[discord] Слэш-команды зарегистрированы");
}

/**
 * Проверяет все текущие серверы бота и покидает те, чей владелец — не OWNER_DISCORD_ID.
 * Вызывается один раз при старте (на случай если бота добавили, пока сервер-панель был выключен).
 */
async function enforceOwnerOnlyGuilds() {
    const ownerId = process.env.OWNER_DISCORD_ID;
    if (!ownerId) return;

    for (const guild of client.guilds.cache.values()) {
        if (guild.ownerId !== ownerId) {
            console.log(
                `[discord] На старте обнаружен чужой сервер "${guild.name}" (owner ${guild.ownerId}), покидаю его.`
            );
            await guild.leave().catch(() => {});
        }
    }
}

function attachHandlers() {
    client.once("ready", async () => {
        console.log(`[discord] Бот вошёл как ${client.user.tag}`);
        await enforceOwnerOnlyGuilds();
    });

    // --- Ограничение: бота может добавлять только владелец ---
    client.on("guildCreate", async (guild) => {
        const ownerId = process.env.OWNER_DISCORD_ID;

        if (!ownerId) {
            console.warn(
                "[discord] OWNER_DISCORD_ID не задан в .env — проверка владельца пропущена, бот остаётся на всех серверах."
            );
            return;
        }

        if (guild.ownerId !== ownerId) {
            console.log(
                `[discord] Бота добавили на чужой сервер "${guild.name}" (owner ${guild.ownerId}), покидаю его.`
            );
            try {
                // Необязательное уведомление в первый доступный текстовый канал перед выходом
                const channel = guild.channels.cache.find(
                    (c) => c.isTextBased() && !c.isThread()
                );
                if (channel) {
                    const me = await guild.members.fetchMe();
                    const perms = channel.permissionsFor(me);
                    if (perms && perms.has(PermissionsBitField.Flags.SendMessages)) {
                        await channel.send(
                            "Этого бота может добавлять только его владелец. Покидаю сервер."
                        );
                    }
                }
            } catch (err) {
                // не критично, если не получилось написать — всё равно выходим
            }
            await guild.leave();
        } else {
            console.log(`[discord] Бот добавлен на сервер владельца: "${guild.name}"`);
        }
    });

    // Обработчик /ask временно отключён вместе с самой командой, см. NOTES.md
    // client.on("interactionCreate", async (interaction) => {
    //   if (!interaction.isChatInputCommand()) return;
    //   if (interaction.commandName !== "ask") return;
    //   ...
    // });

    // --- Клики по кнопкам, отправленным через панель ---
    // У кнопок без ссылки (custom_id) нет своей логики — просто подтверждаем нажатие.
    // Если понадобится конкретное действие на кнопку, здесь можно роутить по customId.
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        try {
            await interaction.reply({
                content: `Кнопка «${interaction.component.label}» нажата.`,
                ephemeral: true,
            });
        } catch (err) {
            console.error("[discord] Ошибка ответа на нажатие кнопки:", err.message);
        }
    });
}

/**
 * Собирает EmbedBuilder из данных, присланных с панели.
 */
function buildEmbed(e) {
    const embed = new EmbedBuilder();
    if (e.title) embed.setTitle(String(e.title).slice(0, 256));
    if (e.description) embed.setDescription(String(e.description).slice(0, 4096));
    if (e.url) embed.setURL(e.url);
    if (e.authorName) embed.setAuthor({ name: String(e.authorName).slice(0, 256) });
    if (e.imageUrl) embed.setImage(e.imageUrl);
    if (e.thumbnailUrl) embed.setThumbnail(e.thumbnailUrl);
    if (e.footer) embed.setFooter({ text: String(e.footer).slice(0, 2048) });
    if (e.timestamp) embed.setTimestamp();
    if (e.color) {
        const hex = String(e.color).replace("#", "");
        const parsed = parseInt(hex, 16);
        if (!Number.isNaN(parsed)) embed.setColor(parsed);
    }
    if (Array.isArray(e.fields) && e.fields.length) {
        embed.addFields(
            e.fields
                .filter((f) => f.name && f.value)
                .slice(0, 25)
                .map((f) => ({
                    name: String(f.name).slice(0, 256),
                    value: String(f.value).slice(0, 1024),
                    inline: !!f.inline,
                }))
        );
    }
    return embed;
}

const BUTTON_STYLE_MAP = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
    link: ButtonStyle.Link,
};

/**
 * Собирает ButtonBuilder из данных с панели.
 */
function buildButton(b) {
    const style = BUTTON_STYLE_MAP[b.style] || ButtonStyle.Secondary;
    const btn = new ButtonBuilder()
        .setLabel(String(b.label || "Кнопка").slice(0, 80))
        .setStyle(style);

    if (style === ButtonStyle.Link) {
        btn.setURL(b.url);
    } else {
        btn.setCustomId(b.customId || `panel_${Math.random().toString(36).slice(2, 10)}`);
    }

    return btn;
}

/**
 * Отправляет сообщение в указанный канал по запросу с веб-панели.
 * payload: { content?: string, embed?: object, buttonRows?: object[][] }
 */
async function sendMessageToChannel(guildId, channelId, payload) {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
        throw new Error("Канал не найден или не текстовый");
    }

    const me = await guild.members.fetchMe();
    const perms = channel.permissionsFor(me);
    if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
        throw new Error("У бота нет прав отправлять сообщения в этот канал");
    }

    const messageOptions = {};

    if (payload.content) {
        messageOptions.content = String(payload.content).slice(0, 2000);
    }

    if (payload.embed) {
        messageOptions.embeds = [buildEmbed(payload.embed)];
    }

    if (Array.isArray(payload.buttonRows) && payload.buttonRows.length) {
        messageOptions.components = payload.buttonRows
            .filter((row) => Array.isArray(row) && row.length)
            .slice(0, 5)
            .map((row) =>
                new ActionRowBuilder().addComponents(row.slice(0, 5).map(buildButton))
            );
    }

    if (!messageOptions.content && !messageOptions.embeds && !messageOptions.components) {
        throw new Error("Сообщение пустое — добавь текст, embed или кнопки");
    }

    return channel.send(messageOptions);
}

function listGuildsAndChannels() {
    return client.guilds.cache.map((guild) => ({
        id: guild.id,
        name: guild.name,
        channels: guild.channels.cache
            .filter((c) => c.isTextBased() && !c.isThread())
            .map((c) => ({ id: c.id, name: c.name })),
    }));
}

module.exports = {
    client,
    registerSlashCommands,
    attachHandlers,
    sendMessageToChannel,
    listGuildsAndChannels,
    enforceOwnerOnlyGuilds,
};