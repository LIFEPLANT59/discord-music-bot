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

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { PlayerManager } = require('ziplayer');
const { YouTubePlugin, SoundCloudPlugin, SpotifyPlugin } = require('@ziplayer/plugin');
const { InfinityPlugin } = require('@ziplayer/infinity');

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

const players = new Map();          // guildId -> player
const currentTracks = new Map();    // guildId -> track
const trackRequesters = new Map();  // guildId -> userId (кто поставил текущий трек)

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

// Регистрация слэш-команд
const commands = [
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Показать информацию о текущем треке')
    .toJSON(),
];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('Слэш-команды зарегистрированы.');
  } catch (e) {
    console.error('Ошибка регистрации:', e);
  }
})();

client.once('ready', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

// Проверка: админ или автор трека
function canControl(msg) {
  const requesterId = trackRequesters.get(msg.guildId);
  if (msg.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return true; // админ/модератор
  if (requesterId && requesterId === msg.author.id) return true; // автор трека
  return false;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'info') {
    const player = players.get(interaction.guildId);
    const track = currentTracks.get(interaction.guildId);
    if (!player || !track) {
      return interaction.reply('Сейчас ничего не играет.');
    }
    let progress = '';
    try {
      const bar = player.getProgressBar?.({ size: 20 });
      if (bar) progress = `\n${bar}`;
    } catch (e) {}
    await interaction.reply(`🎵 **Сейчас играет:** ${track.title || track.url}${progress}`);
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guildId) return;
  let player = players.get(msg.guildId);

  if (msg.content === '!ping') return msg.reply(`Pong! ${client.ws.ping}ms`);

  if (msg.content === '!stop') {
    if (!player) return msg.reply('Ничего не играет.');
    if (!canControl(msg)) return msg.reply('⛔ Только автор трека или админ может остановить.');
    player.stop();
    player.destroy();
    players.delete(msg.guildId);
    currentTracks.delete(msg.guildId);
    trackRequesters.delete(msg.guildId);
    return msg.reply('⏹ Остановлено.');
  }

  if (msg.content === '!skip' || msg.content === '!next') {
    if (!player) return msg.reply('Ничего не играет.');
    if (!canControl(msg)) return msg.reply('⛔ Только автор трека или админ может пропустить.');
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
      trackRequesters.set(msg.guildId, msg.author.id); // запоминаем, кто поставил
      msg.reply(`➕ Добавлено: **${query}**`);
    } catch (e) {
      console.error(e);
      msg.reply('❌ Не удалось найти трек.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);