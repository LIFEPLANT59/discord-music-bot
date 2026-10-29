// === Прокси для Discord REST и WebSocket ===
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

const { Client, GatewayIntentBits } = require('discord.js');
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
  rest: {
    agent: new ProxyAgent(PROXY_URL),
  },
});

const manager = new PlayerManager({
  plugins: [
    new YouTubePlugin(),
    new SoundCloudPlugin(),
    new SpotifyPlugin(),
    new InfinityPlugin(), // fallback: cobalt-инстансы для SoundCloud и других сайтов
  ],
});

manager.on('trackStart', (player, track) => {
  console.log(`[PLAY] ${track.title || track.url}`);
});
manager.on('trackEnd', (player, track) => {
  console.log(`[END] ${track.title || track.url}`);
});
manager.on('playerError', (player, error) => {
  console.error('[PLAYER ERROR]', error?.message || error);
});

client.once('ready', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  if (msg.content === '!ping') {
    return msg.reply(`Pong! Задержка: ${client.ws.ping}ms`);
  }

  if (msg.content.startsWith('!play ') && msg.member?.voice?.channel) {
    const query = msg.content.slice(6).trim();
    if (!query) return msg.reply('Укажите название или ссылку.');

    try {
      const player = await manager.create(msg.guildId, { leaveOnEnd: true });
      if (!player.connection) await player.connect(msg.member.voice.channel);
      await player.play(query, msg.author.id);
      msg.reply(`▶️ Ищу и включаю: **${query}**`);
    } catch (e) {
      console.error('Ошибка воспроизведения:', e);
      msg.reply('❌ Не удалось найти или воспроизвести трек.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
