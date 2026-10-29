require('dotenv').config();

// Официальная настройка прокси для discord.js
const { bootstrap } = require('global-agent');
bootstrap();
global.GLOBAL_AGENT.HTTP_PROXY = 'http://172.22.16.1:3067';
global.GLOBAL_AGENT.HTTPS_PROXY = 'http://172.22.16.1:3067';

const { ProxyAgent } = require('undici');
const { Client, GatewayIntentBits } = require('discord.js');
const { PlayerManager } = require('ziplayer');
const { YouTubePlugin, SpotifyPlugin } = require('@ziplayer/plugin');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: {
    agent: new ProxyAgent('http://172.22.16.1:3067'),
  },
});

const manager = new PlayerManager({
  plugins: [new YouTubePlugin(), new SpotifyPlugin()],
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
});

client.login(process.env.DISCORD_TOKEN);
