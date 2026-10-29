const PROXY_URL = 'http://127.0.0.1:3067';

process.env.HTTP_PROXY = PROXY_URL;
process.env.HTTPS_PROXY = PROXY_URL;
process.env.GLOBAL_AGENT_HTTP_PROXY = PROXY_URL;
process.env.GLOBAL_AGENT_HTTPS_PROXY = PROXY_URL;

require('dotenv').config();

const { bootstrap } = require('global-agent');
bootstrap();

const { setGlobalDispatcher, ProxyAgent } = require('undici');
setGlobalDispatcher(new ProxyAgent(PROXY_URL));

const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { PlayerManager } = require('ziplayer');
const { YouTubePlugin, SoundCloudPlugin, SpotifyPlugin } = require('@ziplayer/plugin');
const { InfinityPlugin } = require('@ziplayer/infinity');
const wtf = require('wtf_wikipedia');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: { agent: new ProxyAgent(PROXY_URL) },
});

const manager = new PlayerManager({
  plugins: [
    new YouTubePlugin(),
    new SoundCloudPlugin(),
    new SpotifyPlugin(),
    new InfinityPlugin(),
  ],
});

const players = new Map();
const currentTracks = new Map();
const trackRequesters = new Map();
const playerMessages = new Map(); // guildId -> Message с панелью

manager.on('trackStart', (player, track) => {
  console.log(`[PLAY] ${track.title || track.url}`);
  currentTracks.set(player.guildId, track);
});
manager.on('trackEnd', (player, track) => {
  console.log(`[END] ${track.title || track.url}`);
});
manager.on('playerError', (player, error) => {
  console.error('[PLAYER ERROR]', error?.message || error);
});

// --- Слэш-команды ---
const commands = [
  new SlashCommandBuilder().setName('info').setDescription('Информация о текущем треке').toJSON(),
  new SlashCommandBuilder().setName('help').setDescription('Список всех команд бота').toJSON(),
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Слэш-команды зарегистрированы.');
  } catch (e) {
    console.error('Ошибка регистрации:', e);
  }
})();

client.once('ready', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

// --- Проверка прав ---
function canControl(ctx) {
  const guildId = ctx.guildId;
  const userId = ctx.user ? ctx.user.id : ctx.author.id;
  const member = ctx.member;
  const requesterId = trackRequesters.get(guildId);
  if (member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (requesterId && requesterId === userId) return true;
  return false;
}

// --- Панель кнопок ---
function createControlRow(player) {
  const isPaused = player?.paused || false;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ctrl_prev').setLabel('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ctrl_toggle').setLabel(isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ctrl_next').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ctrl_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger),
  );
}

// --- Обработка слэш-команд и кнопок ---
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'info') {
      const player = players.get(interaction.guildId);
      const track = currentTracks.get(interaction.guildId);
      const requesterId = trackRequesters.get(interaction.guildId);
      if (!player || !track) return interaction.reply('Сейчас ничего не играет.');

      const title = track.title || 'Без названия';
      const requester = requesterId ? `<@${requesterId}>` : 'Неизвестно';
      await interaction.deferReply();

      let wikiText = 'Информация не найдена.';
      try {
        const doc = await wtf.fetch(title, 'ru');
        if (doc) {
          const text = doc.text();
          if (text && text.length > 10) {
            wikiText = text.length > 800 ? text.substring(0, 800) + '...' : text;
          }
        }
      } catch (e) {}

      const embed = new EmbedBuilder()
        .setTitle('🎵 Информация о треке')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Название', value: title, inline: false },
          { name: 'Поставил', value: requester, inline: false },
          { name: '📖 Из Wikipedia', value: wikiText, inline: false }
        )
        .setFooter({ text: 'Дух Музыки 🕊' });

      try {
        const bar = player.getProgressBar?.({ size: 20 });
        if (bar) embed.addFields({ name: 'Прогресс', value: bar, inline: false });
      } catch (e) {}

      await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('🎵 Дух Музыки — помощь')
        .setDescription('Музыкальный бот для вашего сервера.')
        .setColor(0x5865F2)
        .addFields(
          { name: '▶️ !play <название/ссылка>', value: 'Добавить трек в очередь (YouTube, SoundCloud, Spotify).' },
          { name: '⏭ !skip / !next', value: 'Пропустить текущий трек (автор или админ).' },
          { name: '⏹ !stop', value: 'Остановить и очистить очередь (автор или админ).' },
          { name: '🏓 !ping', value: 'Проверить задержку бота.' },
          { name: 'ℹ️ /info', value: 'Информация о текущем треке.' },
          { name: '❓ /help', value: 'Это сообщение.' },
        )
        .setFooter({ text: 'Также используйте кнопки под сообщением о треке!' });
      await interaction.reply({ embeds: [embed] });
    }
    return;
  }

  if (interaction.isButton()) {
    const player = players.get(interaction.guildId);
    if (!player) return interaction.reply({ content: 'Бот ничего не играет.', ephemeral: true });
    if (!canControl(interaction)) return interaction.reply({ content: '⛔ Только автор трека или админ.', ephemeral: true });

    try {
      switch (interaction.customId) {
        case 'ctrl_toggle':
          if (player.paused) player.resume(); else player.pause();
          await interaction.update({ components: [createControlRow(player)] });
          break;
        case 'ctrl_next':
          player.skip();
          await interaction.update({ components: [createControlRow(player)] });
          break;
        case 'ctrl_prev':
          player.previous();
          await interaction.update({ components: [createControlRow(player)] });
          break;
        case 'ctrl_stop':
          player.stop();
          player.destroy();
          players.delete(interaction.guildId);
          currentTracks.delete(interaction.guildId);
          trackRequesters.delete(interaction.guildId);
          playerMessages.delete(interaction.guildId);
          await interaction.update({ content: '⏹ Остановлено.', components: [], embeds: [] });
          break;
      }
    } catch (e) {
      console.error('Button error:', e);
      await interaction.reply({ content: 'Ошибка при выполнении.', ephemeral: true }).catch(() => {});
    }
  }
});

// --- Текстовые команды ---
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guildId) return;
  let player = players.get(msg.guildId);

  if (msg.content === '!ping') return msg.reply(`Pong! ${client.ws.ping}ms`);

  if (msg.content === '!stop') {
    if (!player) return msg.reply('Ничего не играет.');
    if (!canControl(msg)) return msg.reply('⛔ Только автор трека или админ.');
    player.stop();
    player.destroy();
    players.delete(msg.guildId);
    currentTracks.delete(msg.guildId);
    trackRequesters.delete(msg.guildId);
    playerMessages.delete(msg.guildId);
    return msg.reply('⏹ Остановлено.');
  }

  if (msg.content === '!skip' || msg.content === '!next') {
    if (!player) return msg.reply('Ничего не играет.');
    if (!canControl(msg)) return msg.reply('⛔ Только автор трека или админ.');
    try {
      player.skip();
      return msg.reply('⏭ Пропущено.');
    } catch (e) {
      return msg.reply('Нечего пропускать.');
    }
  }

  if (msg.content.startsWith('!play ')) {
    const voiceChannel = msg.member?.voice?.channel;
    if (!voiceChannel) return msg.reply('Зайди в голосовой канал.');
    const query = msg.content.slice(6).trim();
    if (!query) return msg.reply('Укажи название или ссылку.');

    try {
      if (!player) {
        player = await manager.create(msg.guildId, { leaveOnEnd: true });
        players.set(msg.guildId, player);
      }
      if (!player.connection) await player.connect(voiceChannel);
      await player.play(query, msg.author.id);
      trackRequesters.set(msg.guildId, msg.author.id);

      const controlMsg = await msg.reply({
        content: `▶️ **${query}**`,
        components: [createControlRow(player)],
      });
      playerMessages.set(msg.guildId, controlMsg);
    } catch (e) {
      console.error(e);
      msg.reply('❌ Не удалось найти трек.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);