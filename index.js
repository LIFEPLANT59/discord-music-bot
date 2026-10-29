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
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
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
const playerMessages = new Map();
const searchResults = new Map();

// Вспомогательная функция для форматирования длительности
function formatDuration(duration) {
  if (!duration) return 'Неизвестно';
  let sec = duration;
  // Если число слишком большое, скорее всего это миллисекунды
  if (sec > 10000) sec = Math.floor(sec / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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

// --- Меню выбора трека ---
function createSearchMenu(guildId, tracks) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`select_track_${guildId}`)
    .setPlaceholder('Select track');

  const options = tracks.slice(0, 25).map((track, index) => {
    const label = `${index + 1}. ${track.title || 'Без названия'}`;
    const durationStr = formatDuration(track.duration);
    return new StringSelectMenuOptionBuilder()
      .setLabel(label.substring(0, 100))
      .setValue(String(index))
      .setDescription(`Длина: ${durationStr}`);
  });

  menu.addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

// --- Обработка слэш-команд и взаимодействий ---
client.on('interactionCreate', async (interaction) => {
  
  // 1. Меню выбора трека
  if (interaction.isStringSelectMenu()) {
    const guildId = interaction.guildId;
    if (interaction.customId !== `select_track_${guildId}`) return;

    await interaction.deferUpdate(); // Защита от таймаута в 3 секунды

    const player = players.get(guildId);
    const tracks = searchResults.get(guildId);
    
    if (!tracks) {
      return interaction.followUp({ content: 'Результаты поиска устарели.', ephemeral: true }).catch(() => {});
    }

    const index = parseInt(interaction.values[0]);
    const selectedTrack = tracks[index];
    
    if (!selectedTrack) {
      return interaction.followUp({ content: 'Трек не найден.', ephemeral: true }).catch(() => {});
    }

    try {
      if (!player) {
        return interaction.followUp({ content: 'Бот не в голосовом канале.', ephemeral: true }).catch(() => {});
      }
      
      await player.play(selectedTrack.url, interaction.user.id);
      trackRequesters.set(guildId, interaction.user.id);
      searchResults.delete(guildId);

      await interaction.editReply({
        content: `▶️ **${selectedTrack.title}**`,
        components: [createControlRow(player)],
      });
      playerMessages.set(guildId, interaction.message);
    } catch (e) {
      console.error('Select error:', e);
      await interaction.followUp({ content: 'Ошибка при запуске трека.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  // 2. Слэш-команды
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
          { name: '▶️ !play <название/ссылка>', value: 'Найти трек и выбрать из списка (YouTube, SoundCloud, Spotify).' },
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

  // 3. Кнопки управления
  if (interaction.isButton()) {
    const player = players.get(interaction.guildId);
    if (!player) return interaction.reply({ content: 'Бот ничего не играет.', ephemeral: true });
    if (!canControl(interaction)) return interaction.reply({ content: '⛔ Только автор трека или админ.', ephemeral: true });

    await interaction.deferUpdate().catch(() => {});

    try {
      switch (interaction.customId) {
        case 'ctrl_toggle':
          if (player.paused) player.resume(); else player.pause();
          break;
        case 'ctrl_next':
          player.skip();
          break;
        case 'ctrl_prev':
          player.previous();
          break;
        case 'ctrl_stop':
          player.stop();
          player.destroy();
          players.delete(interaction.guildId);
          currentTracks.delete(interaction.guildId);
          trackRequesters.delete(interaction.guildId);
          playerMessages.delete(interaction.guildId);
          searchResults.delete(interaction.guildId);
          await interaction.editReply({ content: '⏹ Остановлено.', components: [], embeds: [] }).catch(() => {});
          return;
      }
      await interaction.editReply({ components: [createControlRow(player)] }).catch(() => {});
    } catch (e) {
      console.error('Button error:', e);
      await interaction.followUp({ content: 'Ошибка при выполнении.', ephemeral: true }).catch(() => {});
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
    searchResults.delete(msg.guildId);
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

    // Прямая ссылка
    if (query.startsWith('http://') || query.startsWith('https://')) {
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
      return;
    }

    // Текстовый запрос
    try {
      if (!player) {
        player = await manager.create(msg.guildId, { leaveOnEnd: true });
        players.set(msg.guildId, player);
      }
      if (!player.connection) await player.connect(voiceChannel);

      const youtubePlugin = manager.plugins.find(p => p.name === 'youtube');
      if (!youtubePlugin) return msg.reply('Плагин для поиска не найден.');

      const result = await youtubePlugin.search(query, msg.author.id);
      if (!result || !result.tracks || result.tracks.length === 0) {
        return msg.reply('❌ Ничего не найдено.');
      }

      searchResults.set(msg.guildId, result.tracks);

      const listText = result.tracks.slice(0, 10).map((t, i) => {
        const dur = formatDuration(t.duration);
        return `**${i + 1}:** ${t.title} \`Длина: ${dur}\``;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('⚠️ Выберите трек с помощью меню ниже:')
        .setDescription(listText)
        .setColor(0xFFA500)
        .setFooter({ text: 'Выберите трек в выпадающем списке' });

      const selectRow = createSearchMenu(msg.guildId, result.tracks);

      await msg.reply({
        embeds: [embed],
        components: [selectRow],
      });
    } catch (e) {
      console.error(e);
      msg.reply('❌ Ошибка при поиске.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);