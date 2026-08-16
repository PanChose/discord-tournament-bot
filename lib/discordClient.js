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
    AttachmentBuilder,
} = require("discord.js");
// AI functionality is temporarily disabled, see NOTES.md for how to re-enable it.
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

// The /ask slash command (AI helper) is temporarily commented out, see NOTES.md
const commands = [
    // new SlashCommandBuilder()
    //   .setName("ask")
    //   .setDescription("Ask the AI about Matcherino / Brawl Stars tournaments")
    //   .addStringOption((opt) =>
    //     opt.setName("question").setDescription("Your question").setRequired(true)
    //   )
    //   .addStringOption((opt) =>
    //     opt
    //       .setName("tournament_url")
    //       .setDescription("Link to the tournament page on matcherino.com (optional)")
    //       .setRequired(false)
    //   ),
].map((c) => c.toJSON());

async function registerSlashCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
        body: commands,
    });
    console.log("[discord] Slash commands registered");
}

/**
 * Checks all guilds the bot is currently on and leaves any whose owner is not OWNER_DISCORD_ID.
 * Called once on startup (in case the bot was added to a guild while the panel server was offline).
 */
async function enforceOwnerOnlyGuilds() {
    const ownerId = process.env.OWNER_DISCORD_ID;
    if (!ownerId) return;

    for (const guild of client.guilds.cache.values()) {
        if (guild.ownerId !== ownerId) {
            console.log(
                `[discord] Found a foreign guild "${guild.name}" (owner ${guild.ownerId}) on startup, leaving it.`
            );
            await guild.leave().catch(() => {});
        }
    }
}

function attachHandlers() {
    client.once("ready", async () => {
        console.log(`[discord] Logged in as ${client.user.tag}`);
        await enforceOwnerOnlyGuilds();
    });

    // --- Restriction: only the owner may add the bot to a guild ---
    client.on("guildCreate", async (guild) => {
        const ownerId = process.env.OWNER_DISCORD_ID;

        if (!ownerId) {
            console.warn(
                "[discord] OWNER_DISCORD_ID is not set in .env — owner check skipped, the bot stays on all guilds."
            );
            return;
        }

        if (guild.ownerId !== ownerId) {
            console.log(
                `[discord] The bot was added to a foreign guild "${guild.name}" (owner ${guild.ownerId}), leaving it.`
            );
            try {
                // Optional notice in the first available text channel before leaving
                const channel = guild.channels.cache.find(
                    (c) => c.isTextBased() && !c.isThread()
                );
                if (channel) {
                    const me = await guild.members.fetchMe();
                    const perms = channel.permissionsFor(me);
                    if (perms && perms.has(PermissionsBitField.Flags.SendMessages)) {
                        await channel.send(
                            "Only this bot's owner is allowed to add it to a server. Leaving now."
                        );
                    }
                }
            } catch (err) {
                // not critical if the notice couldn't be sent — leave anyway
            }
            await guild.leave();
        } else {
            console.log(`[discord] Bot added to the owner's guild: "${guild.name}"`);
        }
    });

    // The /ask handler is temporarily disabled along with the command itself, see NOTES.md
    // client.on("interactionCreate", async (interaction) => {
    //   if (!interaction.isChatInputCommand()) return;
    //   if (interaction.commandName !== "ask") return;
    //   ...
    // });

    // --- Clicks on buttons sent from the panel ---
    // Buttons without a link (custom_id) have no logic of their own — just acknowledge the click.
    // If you need a specific action per button, route it here based on customId.
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        try {
            await interaction.reply({
                content: `Button "${interaction.component.label}" was clicked.`,
                ephemeral: true,
            });
        } catch (err) {
            console.error("[discord] Error replying to a button click:", err.message);
        }
    });
}

/**
 * Turns a data URL ("data:image/png;base64,....") into { buffer, filename }.
 * Used to send local images as Discord attachments instead of external links.
 */
let attachmentCounter = 0;
function dataUrlToAttachment(dataUrl, fallbackName) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error("Invalid file format");
    const mime = match[1];
    const buffer = Buffer.from(match[2], "base64");

    const extFromMime = (mime.split("/")[1] || "png").split("+")[0];
    attachmentCounter += 1;
    const safeBase = (fallbackName || `image_${attachmentCounter}`)
        .replace(/[^a-zA-Z0-9_.-]/g, "_")
        .slice(0, 60);
    const filename = safeBase.includes(".") ? safeBase : `${safeBase}.${extFromMime}`;

    return { buffer, filename };
}

/**
 * Returns the list of custom emoji from every guild the bot is a member of
 * (including guilds other than the currently selected one) — used for sending
 * messages with any emoji available to the bot.
 */
function listAllEmojis() {
    const emojis = [];
    for (const guild of client.guilds.cache.values()) {
        for (const emoji of guild.emojis.cache.values()) {
            emojis.push({
                id: emoji.id,
                name: emoji.name,
                animated: emoji.animated,
                guildName: guild.name,
                url: emoji.imageURL ? emoji.imageURL({ size: 32 }) : null,
            });
        }
    }
    return emojis;
}

/**
 * Returns the list of roles for the given guild (excluding @everyone),
 * sorted top-to-bottom the same way Discord's own role list is — used by
 * the role picker in the panel (inserting a <@&id> mention into the text).
 */
function listGuildRoles(guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];

    return guild.roles.cache
        .filter((role) => role.id !== guild.id) // exclude @everyone
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
            id: role.id,
            name: role.name,
            color: role.hexColor && role.hexColor !== "#000000" ? role.hexColor : null,
            mentionable: role.mentionable,
        }));
}

/**
 * Parses an emoji for a reaction: accepts either a plain unicode emoji (✅)
 * or a custom one like <:name:id> / <a:name:id> — a reaction only needs the ID.
 */
function parseReactionEmoji(input) {
    const custom = /^<a?:\w+:(\d+)>$/.exec(input.trim());
    return custom ? custom[1] : input.trim();
}

/**
 * Builds an EmbedBuilder from the data sent by the panel.
 */
function buildEmbed(e) {
    const embed = new EmbedBuilder();
    if (e.title) embed.setTitle(String(e.title).slice(0, 256));
    if (e.description) embed.setDescription(String(e.description).slice(0, 4096));
    if (e.url) embed.setURL(e.url);
    if (e.authorName) {
        embed.setAuthor({
            name: String(e.authorName).slice(0, 256),
            iconURL: e.authorIconUrl || undefined,
        });
    }
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
 * Builds a ButtonBuilder from the data sent by the panel.
 */
function buildButton(b) {
    const style = BUTTON_STYLE_MAP[b.style] || ButtonStyle.Secondary;
    const btn = new ButtonBuilder()
        .setLabel(String(b.label || "Button").slice(0, 80))
        .setStyle(style);

    if (style === ButtonStyle.Link) {
        btn.setURL(b.url);
    } else {
        btn.setCustomId(b.customId || `panel_${Math.random().toString(36).slice(2, 10)}`);
    }

    return btn;
}

/**
 * Sends a message to the given channel on behalf of a request from the web panel.
 * payload: { content?: string, embed?: object, buttonRows?: object[][], reactionEmoji?: string }
 */
async function sendMessageToChannel(guildId, channelId, payload) {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
    }

    const me = await guild.members.fetchMe();
    const perms = channel.permissionsFor(me);
    if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
        throw new Error("The bot doesn't have permission to send messages in this channel");
    }

    const messageOptions = {};
    const attachments = []; // AttachmentBuilder[] for files sent alongside the message

    if (payload.content) {
        messageOptions.content = String(payload.content).slice(0, 2000);
    }

    // --- Local images for the embed (uploaded files rather than links) ---
    const embedData = payload.embed ? { ...payload.embed } : null;
    if (embedData) {
        if (embedData.imageFile && embedData.imageFile.dataUrl) {
            const { buffer, filename } = dataUrlToAttachment(embedData.imageFile.dataUrl, embedData.imageFile.name || "banner");
            attachments.push(new AttachmentBuilder(buffer, { name: filename }));
            embedData.imageUrl = `attachment://${filename}`;
        }
        if (embedData.thumbnailFile && embedData.thumbnailFile.dataUrl) {
            const { buffer, filename } = dataUrlToAttachment(embedData.thumbnailFile.dataUrl, embedData.thumbnailFile.name || "thumbnail");
            attachments.push(new AttachmentBuilder(buffer, { name: filename }));
            embedData.thumbnailUrl = `attachment://${filename}`;
        }
        if (embedData.authorIconFile && embedData.authorIconFile.dataUrl) {
            const { buffer, filename } = dataUrlToAttachment(embedData.authorIconFile.dataUrl, embedData.authorIconFile.name || "icon");
            attachments.push(new AttachmentBuilder(buffer, { name: filename }));
            embedData.authorIconUrl = `attachment://${filename}`;
        }
        messageOptions.embeds = [buildEmbed(embedData)];
    }

    // --- Plain local images dragged into the message (not part of the embed) ---
    if (Array.isArray(payload.files) && payload.files.length) {
        for (const file of payload.files.slice(0, 10)) {
            if (!file || !file.dataUrl) continue;
            const { buffer, filename } = dataUrlToAttachment(file.dataUrl, file.name);
            attachments.push(new AttachmentBuilder(buffer, { name: filename }));
        }
    }

    if (attachments.length) {
        messageOptions.files = attachments;
    }

    if (Array.isArray(payload.buttonRows) && payload.buttonRows.length) {
        messageOptions.components = payload.buttonRows
            .filter((row) => Array.isArray(row) && row.length)
            .slice(0, 5)
            .map((row) =>
                new ActionRowBuilder().addComponents(row.slice(0, 5).map(buildButton))
            );
    }

    if (
        !messageOptions.content &&
        !messageOptions.embeds &&
        !messageOptions.components &&
        !messageOptions.files
    ) {
        throw new Error("The message is empty — add text, an image, an embed, or buttons");
    }

    const sentMessage = await channel.send(messageOptions);

    let reactionWarning = null;
    if (payload.reactionEmoji) {
        try {
            await sentMessage.react(parseReactionEmoji(payload.reactionEmoji));
        } catch (err) {
            reactionWarning = `Message sent, but the reaction couldn't be added: ${err.message}`;
        }
    }

    return { message: sentMessage, reactionWarning };
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
    listAllEmojis,
    listGuildRoles,
    enforceOwnerOnlyGuilds,
};