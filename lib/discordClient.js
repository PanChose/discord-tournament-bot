const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
} = require("discord.js");

const tournamentsLib = require("./tournaments");

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

const FORMAT_CHOICES = ["single_elim", "double_elim", "round_robin"];

// =========================================================================
// Slash command definitions
// =========================================================================

const commands = [
    new SlashCommandBuilder()
        .setName("tournament")
        .setDescription("Manage tournaments")
        .addSubcommand((sc) =>
            sc
                .setName("create")
                .setDescription("Quick-create a tournament (opens a form)")
                .addChannelOption((o) =>
                    o
                        .setName("channel")
                        .setDescription("Channel to announce in (defaults to this channel)")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )
        .addSubcommand((sc) =>
            sc
                .setName("announce")
                .setDescription("Publish a draft tournament's announcement")
                .addStringOption((o) => o.setName("id").setDescription("Tournament").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sc) =>
            sc
                .setName("edit")
                .setDescription("Edit an existing tournament")
                .addStringOption((o) => o.setName("id").setDescription("Tournament").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sc) =>
            sc
                .setName("close")
                .setDescription("Close registration for a tournament")
                .addStringOption((o) => o.setName("id").setDescription("Tournament").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sc) => sc.setName("list").setDescription("List tournaments on this server")),
    new SlashCommandBuilder()
        .setName("register")
        .setDescription("Register for a tournament")
        .addStringOption((o) => o.setName("id").setDescription("Tournament").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder()
        .setName("unregister")
        .setDescription("Cancel your registration for a tournament")
        .addStringOption((o) => o.setName("id").setDescription("Tournament").setRequired(true).setAutocomplete(true)),
].map((c) => c.toJSON());

async function registerSlashCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
    console.log("[discord] Slash commands registered");
}

// =========================================================================
// Owner-only guild restriction (kept from the original project: only the
// bot's owner may add it to a server, checked on the bot side rather than
// relying solely on Discord's "Public Bot" toggle in the dev portal).
// =========================================================================

async function enforceOwnerOnlyGuilds() {
    const ownerId = process.env.OWNER_DISCORD_ID;
    if (!ownerId) return;
    for (const guild of client.guilds.cache.values()) {
        if (guild.ownerId !== ownerId) {
            console.log(`[discord] Found a foreign guild "${guild.name}" (owner ${guild.ownerId}) on startup, leaving it.`);
            await guild.leave().catch(() => {});
        }
    }
}

function attachHandlers() {
    client.once("ready", async () => {
        console.log(`[discord] Logged in as ${client.user.tag}`);
        await enforceOwnerOnlyGuilds();
        require("./reminders").start();
    });

    client.on("guildCreate", async (guild) => {
        const ownerId = process.env.OWNER_DISCORD_ID;
        if (!ownerId) {
            console.warn("[discord] OWNER_DISCORD_ID is not set in .env — owner check skipped, the bot stays on all guilds.");
            return;
        }
        if (guild.ownerId !== ownerId) {
            console.log(`[discord] The bot was added to a foreign guild "${guild.name}" (owner ${guild.ownerId}), leaving it.`);
            try {
                const channel = guild.channels.cache.find((c) => c.isTextBased() && !c.isThread());
                if (channel) {
                    const me = await guild.members.fetchMe();
                    const perms = channel.permissionsFor(me);
                    if (perms && perms.has(PermissionsBitField.Flags.SendMessages)) {
                        await channel.send("Only this bot's owner is allowed to add it to a server. Leaving now.");
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

    client.on("interactionCreate", async (interaction) => {
        try {
            if (interaction.isAutocomplete()) return await handleAutocomplete(interaction);
            if (interaction.isChatInputCommand()) return await handleChatInput(interaction);
            if (interaction.isModalSubmit()) return await handleModalSubmit(interaction);
            if (interaction.isButton()) return await handleButton(interaction);
        } catch (err) {
            console.error("[discord] interaction error:", err);
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "Something went wrong handling that.", ephemeral: true }).catch(() => {});
            }
        }
    });
}

// =========================================================================
// Permission check: Organizer = Manage Server or Administrator on the guild.
// Checked on the bot side for every privileged action, not just hidden from
// the Discord UI — the same rule the web panel's API enforces via OAuth2 scopes.
// =========================================================================

function isOrganizer(interaction) {
    return Boolean(
        interaction.memberPermissions &&
            (interaction.memberPermissions.has(PermissionsBitField.Flags.ManageGuild) ||
                interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator))
    );
}

// =========================================================================
// Autocomplete
// =========================================================================

async function handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const guildId = interaction.guildId;
    let pool = [];

    if (interaction.commandName === "tournament") {
        const sub = interaction.options.getSubcommand();
        const all = tournamentsLib.listTournaments(guildId);
        if (sub === "announce") pool = all.filter((t) => t.status === "draft");
        else if (sub === "close") pool = all.filter((t) => t.status === "published");
        else pool = all; // edit
    } else if (interaction.commandName === "register") {
        pool = tournamentsLib.listTournaments(guildId).filter((t) => t.status === "published");
    } else if (interaction.commandName === "unregister") {
        const registered = tournamentsLib.listActiveRegistrationsForUser(guildId, interaction.user.id);
        pool = registered;
    }

    const choices = pool
        .filter((t) => t.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((t) => ({ name: t.name.slice(0, 100), value: t.id }));

    await interaction.respond(choices);
}

// =========================================================================
// Slash command handling
// =========================================================================

async function handleChatInput(interaction) {
    if (interaction.commandName === "tournament") return handleTournamentCommand(interaction);
    if (interaction.commandName === "register") return handleRegisterCommand(interaction, true);
    if (interaction.commandName === "unregister") return handleRegisterCommand(interaction, false);
}

async function handleTournamentCommand(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
        const tournaments = tournamentsLib.listTournaments(interaction.guildId);
        if (!tournaments.length) {
            return interaction.reply({ content: "No tournaments on this server yet.", ephemeral: true });
        }
        const lines = tournaments.map(
            (t) => `**${t.name}** — ${tournamentsLib.STATUS_LABELS[t.status]} (${t.activeCount}/${t.max_participants}) — \`${t.id}\``
        );
        return interaction.reply({ content: lines.join("\n"), ephemeral: true });
    }

    if (!isOrganizer(interaction)) {
        return interaction.reply({ content: "You need the **Manage Server** permission to do that.", ephemeral: true });
    }

    if (sub === "create") {
        const channelId = interaction.options.getChannel("channel")?.id || interaction.channelId;
        const modal = new ModalBuilder().setCustomId(`tour_create:${channelId}`).setTitle("New tournament");
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("name").setLabel("Tournament name").setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("game").setLabel("Game").setStyle(TextInputStyle.Short).setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("format")
                    .setLabel("Format (single_elim / double_elim / round_robin)")
                    .setStyle(TextInputStyle.Short)
                    .setValue("single_elim")
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("max_participants")
                    .setLabel("Max participants")
                    .setStyle(TextInputStyle.Short)
                    .setValue("32")
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("description")
                    .setLabel("Description / rules")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
            )
        );
        return interaction.showModal(modal);
    }

    const id = interaction.options.getString("id");
    const tournament = tournamentsLib.getTournament(id);
    if (!tournament || tournament.guild_id !== interaction.guildId) {
        return interaction.reply({ content: "Tournament not found.", ephemeral: true });
    }

    if (sub === "announce") {
        if (tournament.status !== "draft") {
            return interaction.reply({ content: "This tournament was already announced.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const published = await publishTournament(tournament);
        return interaction.editReply(`Published in <#${published.channel_id}> ✅`);
    }

    if (sub === "close") {
        if (tournament.status !== "published") {
            return interaction.reply({ content: "This tournament isn't open for registration.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const closed = tournamentsLib.setClosed(id);
        await closeTournamentAnnouncement(closed);
        return interaction.editReply("Registration closed.");
    }

    if (sub === "edit") {
        const modal = new ModalBuilder().setCustomId(`tour_edit:${id}`).setTitle("Edit tournament");
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("name")
                    .setLabel("Tournament name")
                    .setStyle(TextInputStyle.Short)
                    .setValue(tournament.name || "")
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("game")
                    .setLabel("Game")
                    .setStyle(TextInputStyle.Short)
                    .setValue(tournament.game || "")
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("max_participants")
                    .setLabel("Max participants")
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(tournament.max_participants))
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("description")
                    .setLabel("Description / rules")
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(tournament.description || "")
                    .setRequired(false)
            )
        );
        return interaction.showModal(modal);
    }
}

async function handleRegisterCommand(interaction, isRegister) {
    const id = interaction.options.getString("id");
    const tournament = tournamentsLib.getTournament(id);
    if (!tournament || tournament.guild_id !== interaction.guildId) {
        return interaction.reply({ content: "Tournament not found.", ephemeral: true });
    }

    const result = isRegister
        ? tournamentsLib.registerParticipant(id, interaction.user.id, interaction.user.tag)
        : tournamentsLib.unregisterParticipant(id, interaction.user.id);

    await interaction.reply({ content: registrationResultMessage(result, isRegister), ephemeral: true });

    if (result.ok) {
        if (isRegister) sendRegistrationDM(interaction.user, tournament).catch(() => {});
        await refreshAnnouncementMessage(tournamentsLib.getTournament(id));
    }
}

function registrationResultMessage(result, isRegister) {
    if (result.ok) return isRegister ? "You're registered! ✅" : "Registration cancelled.";
    switch (result.reason) {
        case "not_open":
            return "Registration isn't open for this tournament.";
        case "already_registered":
            return "You're already registered.";
        case "full":
            return "Sorry, all slots are taken.";
        case "not_registered":
            return "You weren't registered for this tournament.";
        default:
            return "Tournament not found.";
    }
}

async function sendRegistrationDM(user, tournament) {
    const when = tournament.starts_at ? `<t:${Math.floor(tournament.starts_at / 1000)}:F>` : "TBD";
    await user.send(
        `✅ You're registered for **${tournament.name}**!\nStarts: ${when}\nWe'll remind you before it starts.`
    );
}

// =========================================================================
// Modal submissions
// =========================================================================

async function handleModalSubmit(interaction) {
    if (interaction.customId.startsWith("tour_create:")) {
        const channelId = interaction.customId.split(":")[1];
        const format = interaction.fields.getTextInputValue("format").trim();
        const tournament = tournamentsLib.createTournament(interaction.guildId, interaction.user.id, {
            channelId,
            name: interaction.fields.getTextInputValue("name").trim(),
            game: interaction.fields.getTextInputValue("game").trim() || null,
            format: FORMAT_CHOICES.includes(format) ? format : "single_elim",
            maxParticipants: Math.max(2, parseInt(interaction.fields.getTextInputValue("max_participants"), 10) || 32),
            description: interaction.fields.getTextInputValue("description").trim() || null,
        });
        return interaction.reply({
            content: `Draft created: **${tournament.name}** (\`${tournament.id}\`). Run \`/tournament announce id:${tournament.id}\` to publish it, or fine-tune it in the web panel first.`,
            ephemeral: true,
        });
    }

    if (interaction.customId.startsWith("tour_edit:")) {
        const id = interaction.customId.split(":")[1];
        const maxParticipants = Math.max(2, parseInt(interaction.fields.getTextInputValue("max_participants"), 10) || 32);
        const updated = tournamentsLib.updateTournament(id, {
            name: interaction.fields.getTextInputValue("name").trim(),
            game: interaction.fields.getTextInputValue("game").trim() || null,
            maxParticipants,
            description: interaction.fields.getTextInputValue("description").trim() || null,
        });
        if (updated.status === "published") await refreshAnnouncementMessage(updated);
        return interaction.reply({ content: `Updated **${updated.name}**.`, ephemeral: true });
    }
}

// =========================================================================
// Button interactions (the register/unregister buttons on the announcement)
// =========================================================================

async function handleButton(interaction) {
    const [ns, action, id] = interaction.customId.split(":");
    if (ns !== "tour") return;

    const tournament = tournamentsLib.getTournament(id);
    if (!tournament) {
        return interaction.reply({ content: "This tournament no longer exists.", ephemeral: true });
    }

    const isRegister = action === "register";
    const result = isRegister
        ? tournamentsLib.registerParticipant(id, interaction.user.id, interaction.user.tag)
        : tournamentsLib.unregisterParticipant(id, interaction.user.id);

    await interaction.reply({ content: registrationResultMessage(result, isRegister), ephemeral: true });

    if (result.ok) {
        if (isRegister) sendRegistrationDM(interaction.user, tournament).catch(() => {});
        await refreshAnnouncementMessage(tournamentsLib.getTournament(id));
    }
}

// =========================================================================
// Building / sending / editing the announcement message
// =========================================================================

let attachmentCounter = 0;
function dataUrlToAttachment(dataUrl, fallbackName) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error("Invalid file format");
    const mime = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const extFromMime = (mime.split("/")[1] || "png").split("+")[0];
    attachmentCounter += 1;
    const safeBase = (fallbackName || `image_${attachmentCounter}`).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 60);
    const filename = safeBase.includes(".") ? safeBase : `${safeBase}.${extFromMime}`;
    return { buffer, filename };
}

function parseColor(hex) {
    const parsed = parseInt(String(hex || "").replace("#", ""), 16);
    return Number.isNaN(parsed) ? 0x8b5cf6 : parsed;
}

function buildTournamentMessagePayload(tournament) {
    const activeCount = tournamentsLib.countActive(tournament.id);
    const data = tournamentsLib.buildEmbedData(tournament, activeCount);

    const embed = new EmbedBuilder().setTitle(data.title).setColor(parseColor(data.color)).setFooter({ text: data.footer }).setTimestamp();
    if (data.description) embed.setDescription(data.description);
    if (data.fields.length) embed.addFields(data.fields);

    const files = [];
    if (data.image) {
        if (data.image.startsWith("data:")) {
            const { buffer, filename } = dataUrlToAttachment(data.image, "banner");
            files.push(new AttachmentBuilder(buffer, { name: filename }));
            embed.setImage(`attachment://${filename}`);
        } else {
            embed.setImage(data.image);
        }
    }

    const isOpen = tournament.status === "published";
    const isFull = activeCount >= tournament.max_participants;

    const registerBtn = new ButtonBuilder()
        .setCustomId(`tour:register:${tournament.id}`)
        .setLabel(isFull ? "Slots full" : "Register")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!isOpen || isFull);

    const unregisterBtn = new ButtonBuilder()
        .setCustomId(`tour:unregister:${tournament.id}`)
        .setLabel("Unregister")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isOpen);

    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(registerBtn, unregisterBtn)],
        files,
    };
}

async function publishTournament(tournament) {
    const channel = await client.channels.fetch(tournament.channel_id);
    if (!channel || !channel.isTextBased()) throw new Error("Channel not found or not a text channel");

    const me = await channel.guild.members.fetchMe();
    const perms = channel.permissionsFor(me);
    if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) {
        throw new Error("The bot doesn't have permission to send messages in that channel");
    }

    const payload = buildTournamentMessagePayload(tournament);
    const message = await channel.send(payload);
    return tournamentsLib.setPublished(tournament.id, tournament.channel_id, message.id);
}

// Edits the *same* Discord message in place instead of posting a new one —
// this is what keeps the slot counter live and avoids spamming the channel
// every time someone clicks the button.
async function refreshAnnouncementMessage(tournament) {
    if (!tournament.channel_id || !tournament.message_id) return;
    try {
        const channel = await client.channels.fetch(tournament.channel_id);
        const message = await channel.messages.fetch(tournament.message_id);
        await message.edit(buildTournamentMessagePayload(tournament));
    } catch (err) {
        console.error("[discord] Failed to refresh announcement message:", err.message);
    }
}

async function closeTournamentAnnouncement(tournament) {
    await refreshAnnouncementMessage(tournament);
    try {
        const channel = await client.channels.fetch(tournament.channel_id);
        await channel.send(`🔒 Registration for **${tournament.name}** is now closed.`);
    } catch (err) {
        console.error("[discord] Failed to send close notice:", err.message);
    }
}

// Pings the configured role in the announcement channel when the tournament starts.
async function announceStart(tournament) {
    if (!tournament.ping_role_id || !tournament.channel_id) return;
    try {
        const channel = await client.channels.fetch(tournament.channel_id);
        await channel.send(`<@&${tournament.ping_role_id}> **${tournament.name}** is starting now! 🏆`);
    } catch (err) {
        console.error("[discord] Failed to send start ping:", err.message);
    }
}

async function sendReminderDM(userId, tournament, hours) {
    const user = await client.users.fetch(userId);
    await user.send(`⏰ Reminder: **${tournament.name}** starts in about ${hours} hour(s)!`);
}

// =========================================================================
// Helpers used by the web panel's REST API
// =========================================================================

// Builds the "Add to server" OAuth2 link — a server admin has to open this and
// authorize it themselves (a bot can never invite itself), see README.
function getBotInviteUrl() {
    const permissions = new PermissionsBitField([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks,
    ]).bitfield;
    const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        permissions: permissions.toString(),
        scope: "bot applications.commands",
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function listGuildsAndChannels() {
    return client.guilds.cache.map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL ? guild.iconURL({ size: 64 }) : null,
        channels: guild.channels.cache
            .filter((c) => c.isTextBased() && !c.isThread())
            .map((c) => ({ id: c.id, name: c.name })),
    }));
}

function listGuildRoles(guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];
    return guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor }));
}

module.exports = {
    client,
    registerSlashCommands,
    attachHandlers,
    listGuildsAndChannels,
    listGuildRoles,
    getBotInviteUrl,
    publishTournament,
    refreshAnnouncementMessage,
    closeTournamentAnnouncement,
    announceStart,
    sendReminderDM,
};
