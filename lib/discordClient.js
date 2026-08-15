const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
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

function attachHandlers() {
  client.once("ready", () => {
    console.log(`[discord] Бот вошёл как ${client.user.tag}`);
  });

  // Обработчик /ask временно отключён вместе с самой командой, см. NOTES.md
  // client.on("interactionCreate", async (interaction) => {
  //   if (!interaction.isChatInputCommand()) return;
  //   if (interaction.commandName !== "ask") return;
  //   ...
  // });
}

/**
 * Отправляет сообщение в указанный канал по запросу с веб-панели.
 */
async function sendMessageToChannel(guildId, channelId, content) {
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

  return channel.send(content);
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
};
