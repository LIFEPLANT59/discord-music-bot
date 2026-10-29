cat > index.js << 'EOF'
// === Прокси для ВСЕХ запросов (включая плагины YouTube/Spotify/SoundCloud) ===
process.env.HTTP_PROXY = 'http://127.0.0.1:3067';
process.env.HTTPS_PROXY = 'http://127.0.0.1:3067';
process.env.GLOBAL_AGENT_HTTP_PROXY = 'http://127.0.0.1:3067';
process.env.GLOBAL_AGENT_HTTPS_PROXY = 'http://127.0.0.1:3067';

require('dotenv').config();

const { bootstrap } = require('global-agent');
bootstrap();

const { setGlobalDispatcher, ProxyAgent } = require('undici');
const PROXY_URL = 'http://127.0.0.1:3067';
setGlobalDispatcher(new ProxyAgent(PROXY_URL));

const { Client, GatewayIntentBits } = require('discord.js');
const { PlayerManager } = require('ziplayer');
const { YouTubePlugin, SpotifyPlugin, SoundCloudPlugin } = require('@ziplayer/plugin');

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

// Подключаем несколько источников: YouTube, SoundCloud, Spotify
const manager = new PlayerManager({
  plugins: [
    new YouTubePlugin(),
    new SoundCloudPlugin(),
    new SpotifyPlugin(),
  ],
});

// События плеера — чтобы в консоли было видно, что происходит
manager.on('trackStart', (player, track) => {
  console.log(`[PLAY] ${track.title || track.url}`);
});

manager.on('trackEnd', (player, track) => {
  console.log(`[END] ${track.title || track.url}`);
});

manager.on('playerError', (player, error, track) => {
  console.error('[PLAYER ERROR]', error?.message || error);
});

client.once('ready', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

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

  // Простая команда для проверки, что бот жив
  if (msg.content === '!ping') {
    msg.reply(`Pong! Задержка: ${client.ws.ping}ms`);
  }
});

client.login(process.env.DISCORD_TOKEN);
EOF