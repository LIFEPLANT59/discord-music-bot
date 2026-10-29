const PROXY_URL = 'http://127.0.0.1:3067';

process.env.HTTP_PROXY = PROXY_URL;
process.env.HTTPS_PROXY = PROXY_URL;
process.env.GLOBAL_AGENT_HTTP_PROXY = PROXY_URL;
process.env.GLOBAL_AGENT_HTTPS_PROXY = PROXY_URL;

require('dotenv').config();

// Защита от падения с EPIPE и логирование ошибок
process.on('uncaughtException', (err) => {
  console.error('Критическая ошибка:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Необработанный отказ:', reason);
});

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
    GatewayIntentBits.GuildMembers,
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

// НАСТРОЙКИ
const OWNER_ID = '986632907823153234';
const ADMIN_ROLE_NAMES = ['HEAD MODERATOR', 'NUGZAR', 'MODERATOR'];

function formatDuration(duration) {
  if (!duration) return 'Неизвестно';
  let sec = duration;
  if (sec > 10000) sec = Math.floor(sec / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function createTrackEmbed(track, requesterId, player) {
  const embed = new EmbedBuilder()
    .setTitle('🎶 Сейчас играет')
    .setDescription(`**${track.title || 'Без названия'}**`)
    .addFields(
      { name: 'Поставил', value: requesterId ? `<@${requesterId}>` : 'Неизвестно', inline: true },
      { name: 'Длительность', value: formatDuration(track.duration), inline: true }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Дух Музыки 🕊' });

  try {
    const bar = player.getProgressBar?.({ size: 20 });
    if (bar) embed.addFields({ name: 'Прогресс', value: bar, inline: false });
  } catch (e) {}

  return embed;
}

manager.on('trackStart', async (player, track) => {
  console.log(`[PLAY] ${track.title || track.url}`);
  currentTracks.set(player.guildId, track);

  const guildId = player.guildId;
  const requesterId = trackRequesters.get(guildId);
  const embed = createTrackEmbed(track, requesterId, player);
  const controlComponents = createControlComponents(player, track);

  const oldMessage = playerMessages.get(guildId);
  if (oldMessage) {
    try {
      await oldMessage.edit({ embeds: [embed], components: controlComponents });
    } catch (e) {
      await sendNewControlMessage(guildId, player, embed, controlComponents);
    }
  } else {
    await sendNewControlMessage(guildId, player, embed, controlComponents);
  }
});

async function sendNewControlMessage(guildId, player, embed, components) {
  const channel = player.userdata?.channel;
  if (!channel) return;
  try {
    const msg = await channel.send({ embeds: [embed], components });
    playerMessages.set(guildId, msg);
  } catch (e) {
    console.error('Не удалось отправить сообщение:', e);
  }
}

manager.on('trackEnd', (player, track) => {
  console.log(`[END] ${track.title || track.url}`);
});

manager.on('playerError', (player, error) => {
  console.error('[PLAYER ERROR]', error?.message || error);
});

// Слэш-команды
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

client.once('clientReady', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

function canControl(ctx) {
  const guildId = ctx.guildId;
  const userId = ctx.user ? ctx.user.id : ctx.author.id;
  const member = ctx.member;
  
  if (userId === OWNER_ID) return true;
  if (member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;

  if (member?.roles?.cache) {
    const hasRole = member.roles.cache.some(role => ADMIN_ROLE_NAMES.includes(role.name.toUpperCase()));
    if (hasRole) return true;
  }

  const requesterId = trackRequesters.get(guildId);
  if (requesterId && requesterId === userId) return true;

  return false;
}

function createControlComponents(player, track) {
  const isPaused = player?.paused || false;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ctrl_rewind').setLabel('⏪ -10s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ctrl_prev').setLabel('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ctrl_toggle').setLabel(isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ctrl_next').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ctrl_forward').setLabel('⏩ +10s').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ctrl_stop').setLabel('⏹️ Остановить').setStyle(ButtonStyle.Danger),
  );

  const components = [row1, row2];

  if (track && track.duration) {
    const totalSeconds = Math.floor(track.duration / (track.duration > 10000 ? 1000 : 1));
    const step = 30;
    const options = [];
    for (let i = 0; i < totalSeconds && options.length < 25; i += step) {
      const m = Math.floor(i / 60);
      const s = i % 60;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${m}:${String(s).padStart(2, '0')}`)
          .setValue(String(i * 1000))
      );
    }
    if (options.length > 0) {
      const seekMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('seek_menu')
          .setPlaceholder('Перемотать на...')
          .addOptions(options)
      );
      components.push(seekMenu);
    }
  }

  return components;
}

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

client.on('interactionCreate', async (interaction) => {
  
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_track_')) {
    const guildId = interaction.guildId;
    await interaction.deferUpdate();

    const player = players.get(guildId);
    const tracks = searchResults.get(guildId);
    
    if (!tracks) return interaction.followUp({ content: 'Результаты поиска устарели.', ephemeral: true }).catch(() => {});

    const index = parseInt(interaction.values[0]);
    const selectedTrack = tracks[index];
    if (!selectedTrack) return interaction.followUp({ content: 'Трек не найден.', ephemeral: true }).catch(() => {});

    try {
      if (!player) return interaction.followUp({ content: 'Бот не в голосовом канале.', ephemeral: true }).catch(() => {});
      
      await player.play(selectedTrack.url, interaction.user.id);
      trackRequesters.set(guildId, interaction.user.id);
      searchResults.delete(guildId);

      const embed = createTrackEmbed(selectedTrack, interaction.user.id, player);
      const controlComponents = createControlComponents(player, selectedTrack);

      await interaction.editReply({ embeds: [embed], components: controlComponents });
      playerMessages.set(guildId, interaction.message);
    } catch (e) {
      console.error('Select error:', e);
      await interaction.followUp({ content: 'Ошибка при запуске трека.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'seek_menu') {
    const player = players.get(interaction.guildId);
    if (!player) return interaction.reply({ content: 'Ничего не играет.', ephemeral: true });

    if (!canControl(interaction)) return interaction.reply({ content: '⛔ Только автор трека или админ.', ephemeral: true });

    await interaction.deferUpdate();
    const seekMs = parseInt(interaction.values[0]);
    try {
      await player.seek(seekMs);
      const track = currentTracks.get(interaction.guildId);
      if (track) {
        const embed = createTrackEmbed(track, trackRequesters.get(interaction.guildId), player);
        await interaction.editReply({ embeds: [embed], components: createControlComponents(player, track) });
      }
    } catch (e) {
      await interaction.followUp({ content: 'Ошибка перемотки.', ephemeral: true }).catch(() => {});
    }
    return;
  }

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

  if (interaction.isButton()) {
    const player = players.get(interaction.guildId);
    if (!player) return interaction.reply({ content: 'Бот ничего не играет.', ephemeral: true });
    
    if (!canControl(interaction)) return interaction.reply({ content: '⛔ Управлять может только автор трека или админ.', ephemeral: true });

    await interaction.deferUpdate().catch(() => {});
    try {
      let currentTime = 0;
      if (typeof player.getTime === 'function') {
        currentTime = player.getTime().current || 0;
      }

      switch (interaction.customId) {
        case 'ctrl_toggle': if (player.paused) player.resume(); else player.pause(); break;
        case 'ctrl_next': player.skip(); break;
        case 'ctrl_prev': player.previous(); break;
        case 'ctrl_rewind': await player.seek(Math.max(0, currentTime - 10000)); break;
        case 'ctrl_forward': await player.seek(currentTime + 10000); break;
        case 'ctrl_stop':
          player.stop(); player.destroy();
          players.delete(interaction.guildId); currentTracks.delete(interaction.guildId);
          trackRequesters.delete(interaction.guildId); playerMessages.delete(interaction.guildId);
          searchResults.delete(interaction.guildId);
          await interaction.editReply({ content: '⏹ Остановлено.', components: [], embeds: [] }).catch(() => {});
          return;
      }
      const track = currentTracks.get(interaction.guildId);
      await interaction.editReply({ components: createControlComponents(player, track) }).catch(() => {});
    } catch (e) {
      console.error('Button error:', e);
    }
  }
});

// Килл-свитч (потеря прав владельцем)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (newMember.id !== OWNER_ID) return;
  
  const wasAdmin = oldMember.permissions.has(PermissionFlagsBits.Administrator);
  const isAdmin = newMember.permissions.has(PermissionFlagsBits.Administrator);

  if (wasAdmin && !isAdmin) {
    console.log('🚨 ВЛАДЕЛЕЦ ПОТЕРЯЛ ПРАВА АДМИНА. АКТИВАЦИЯ ПРОТОКОЛА САМОУНИЧТОЖЕНИЯ...');
    
    for (const [guildId, player] of players.entries()) {
      try { player.stop(); player.destroy(); } catch (e) {}
    }
    
    const channel = newMember.guild.channels.cache.find(c => c.name === 'general');
    if (channel) await channel.send('⚠️ **ВНИМАНИЕ:** Владелец потерял права. Бот экстренно отключается.').catch(() => {});

    await client.destroy();
    process.exit(1);
  }
});

// Текстовые команды
client.on('messageCreate', async (msg) => {
  if (msg.author.id === OWNER_ID && msg.content === '!panic') {
    msg.reply('🚨 Активирован протокол самоуничтожения...').then(() => {
       client.destroy();
       process.exit(0);
    });
  }
  
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

    if (query.startsWith('http://') || query.startsWith('https://')) {
      try {
        if (!player) {
          player = await manager.create(msg.guildId, { leaveOnEnd: true, userdata: { channel: msg.channel } });
          players.set(msg.guildId, player);
        }
        if (!player.connection) await player.connect(voiceChannel);
        await player.play(query, msg.author.id);
        trackRequesters.set(msg.guildId, msg.author.id);
      } catch (e) {
        console.error(e);
        msg.reply('❌ Не удалось найти трек.');
      }
      return;
    }

    try {
      if (!player) {
        player = await manager.create(msg.guildId, { leaveOnEnd: true, userdata: { channel: msg.channel } });
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