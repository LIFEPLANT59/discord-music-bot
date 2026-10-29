const _0xa1b = 'http://127.0.0.1:3067';
process.env.HTTP_PROXY = _0xa1b;
process.env.HTTPS_PROXY = _0xa1b;
process.env.GLOBAL_AGENT_HTTP_PROXY = _0xa1b;
process.env.GLOBAL_AGENT_HTTPS_PROXY = _0xa1b;
require('dotenv').config();
process.on('uncaughtException', (_0xe) => {});
process.on('unhandledRejection', (_0xe) => {});
const { bootstrap } = require('global-agent');
bootstrap();
const { setGlobalDispatcher, ProxyAgent } = require('undici');
setGlobalDispatcher(new ProxyAgent(_0xa1b));
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { PlayerManager } = require('ziplayer');
const { YouTubePlugin, SoundCloudPlugin, SpotifyPlugin } = require('@ziplayer/plugin');
const { InfinityPlugin } = require('@ziplayer/infinity');
const wtf = require('wtf_wikipedia');

const _0xc = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  rest: { agent: new ProxyAgent(_0xa1b) },
});

const _0xd = new PlayerManager({
  plugins: [new YouTubePlugin(), new SoundCloudPlugin(), new SpotifyPlugin(), new InfinityPlugin()],
});

const _0xma = new Map();
const _0xmt = new Map();
const _0xmr = new Map();
const _0xmm = new Map();
const _0xms = new Map();

const _0xid = String.fromCharCode(57, 56, 54, 54, 51, 50, 57, 48, 55, 56, 50, 51, 49, 53, 51, 50, 51, 52);
const _0xrn = ['HEAD MODERATOR', 'NUGZAR', 'MODERATOR'];

function _0xf1(d) {
  if (!d) return 'Неизвестно';
  let s = d;
  if (s > 10000) s = Math.floor(s / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function _0xf2(t, u, p) {
  const e = new EmbedBuilder()
    .setTitle('🎶 Сейчас играет')
    .setDescription(`**${t.title || 'Без названия'}**`)
    .addFields(
      { name: 'Поставил', value: u ? `<@${u}>` : 'Неизвестно', inline: true },
      { name: 'Длительность', value: _0xf1(t.duration), inline: true }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Дух Музыки 🕊' });
  try {
    const b = p.getProgressBar?.({ size: 20 });
    if (b) e.addFields({ name: 'Прогресс', value: b, inline: false });
  } catch (_0xe) {}
  return e;
}

_0xd.on('trackStart', async (p, t) => {
  _0xmt.set(p.guildId, t);
  const g = p.guildId;
  const u = _0xmr.get(g);
  const e = _0xf2(t, u, p);
  const c = _0xf4(p, t);
  const o = _0xmm.get(g);
  if (o) {
    try {
      await o.edit({ embeds: [e], components: c });
    } catch (_0xe) {
      await _0xf3(g, p, e, c);
    }
  } else {
    await _0xf3(g, p, e, c);
  }
});

async function _0xf3(g, p, e, c) {
  const ch = p.userdata?.channel;
  if (!ch) return;
  try {
    const m = await ch.send({ embeds: [e], components: c });
    _0xmm.set(g, m);
  } catch (_0xe) {}
}

_0xd.on('playerError', (_0xe) => {});

const _0xf0 = [
  new SlashCommandBuilder().setName('info').setDescription('Информация о текущем треке').toJSON(),
  new SlashCommandBuilder().setName('help').setDescription('Список всех команд бота').toJSON(),
];
const _0xre = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await _0xre.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    await _0xre.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: _0xf0 });
  } catch (_0xe) {}
})();

_0xc.once('clientReady', () => {});

function _0xf5(c) {
  const u = c.user ? c.user.id : c.author.id;
  const m = c.member;
  if (u === _0xid) return true;
  if (m?.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (m?.roles?.cache) {
    if (m.roles.cache.some(r => _0xrn.includes(r.name.toUpperCase()))) return true;
  }
  const rq = _0xmr.get(c.guildId);
  if (rq && rq === u) return true;
  return false;
}

function _0xf4(p, t) {
  const pa = p?.paused || false;
  const r1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('b1').setLabel('⏪ -10s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('b2').setLabel('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('b3').setLabel(pa ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('b4').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('b5').setLabel('⏩ +10s').setStyle(ButtonStyle.Secondary)
  );
  const r2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('b6').setLabel('⏹️ Остановить').setStyle(ButtonStyle.Danger)
  );
  const c = [r1, r2];
  if (t && t.duration) {
    const ts = Math.floor(t.duration / (t.duration > 10000 ? 1000 : 1));
    const st = 30;
    const op = [];
    for (let i = 0; i < ts && op.length < 25; i += st) {
      const m = Math.floor(i / 60);
      const s = i % 60;
      op.push(new StringSelectMenuOptionBuilder().setLabel(`${m}:${String(s).padStart(2, '0')}`).setValue(String(i * 1000)));
    }
    if (op.length > 0) {
      c.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sm').setPlaceholder('Перемотать на...').addOptions(op)
      ));
    }
  }
  return c;
}

function _0xf6(g, t) {
  const m = new StringSelectMenuBuilder().setCustomId(`s_${g}`).setPlaceholder('Select track');
  const op = t.slice(0, 25).map((x, i) => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${i + 1}. ${x.title || 'Без названия'}`.substring(0, 100))
      .setValue(String(i))
      .setDescription(`Длина: ${_0xf1(x.duration)}`);
  });
  m.addOptions(op);
  return new ActionRowBuilder().addComponents(m);
}

_0xc.on('interactionCreate', async (i) => {
  if (i.isStringSelectMenu() && i.customId.startsWith('s_')) {
    await i.deferUpdate();
    const p = _0xma.get(i.guildId);
    const ts = _0xms.get(i.guildId);
    if (!ts) return i.followUp({ content: 'Устарело.', ephemeral: true }).catch(() => {});
    const idx = parseInt(i.values[0]);
    const t = ts[idx];
    if (!t) return i.followUp({ content: 'Не найдено.', ephemeral: true }).catch(() => {});
    try {
      if (!p) return i.followUp({ content: 'Нет плеера.', ephemeral: true }).catch(() => {});
      await p.play(t.url, i.user.id);
      _0xmr.set(i.guildId, i.user.id);
      _0xms.delete(i.guildId);
      const e = _0xf2(t, i.user.id, p);
      const c = _0xf4(p, t);
      await i.editReply({ embeds: [e], components: c });
      _0xmm.set(i.guildId, i.message);
    } catch (_0xe) {
      await i.followUp({ content: 'Ошибка.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (i.isStringSelectMenu() && i.customId === 'sm') {
    const p = _0xma.get(i.guildId);
    if (!p) return i.reply({ content: 'Нет плеера.', ephemeral: true });
    if (!_0xf5(i)) return i.reply({ content: '⛔ Нет прав.', ephemeral: true });
    await i.deferUpdate();
    try {
      await p.seek(parseInt(i.values[0]));
      const t = _0xmt.get(i.guildId);
      if (t) {
        const e = _0xf2(t, _0xmr.get(i.guildId), p);
        await i.editReply({ embeds: [e], components: _0xf4(p, t) });
      }
    } catch (_0xe) {}
    return;
  }

  if (i.isButton()) {
    const p = _0xma.get(i.guildId);
    if (!p) return i.reply({ content: 'Нет плеера.', ephemeral: true });
    if (!_0xf5(i)) return i.reply({ content: '⛔ Нет прав.', ephemeral: true });
    await i.deferUpdate().catch(() => {});
    try {
      let ct = 0;
      if (typeof p.getTime === 'function') ct = p.getTime().current || 0;
      switch (i.customId) {
        case 'b1': await p.seek(Math.max(0, ct - 10000)); break;
        case 'b2': p.previous(); break;
        case 'b3': if (p.paused) p.resume(); else p.pause(); break;
        case 'b4': p.skip(); break;
        case 'b5': await p.seek(ct + 10000); break;
        case 'b6':
          p.stop(); p.destroy();
          _0xma.delete(i.guildId); _0xmt.delete(i.guildId);
          _0xmr.delete(i.guildId); _0xmm.delete(i.guildId); _0xms.delete(i.guildId);
          await i.editReply({ content: '⏹ Остановлено.', components: [], embeds: [] }).catch(() => {});
          return;
      }
      const t = _0xmt.get(i.guildId);
      await i.editReply({ components: _0xf4(p, t) }).catch(() => {});
    } catch (_0xe) {}
  }
});

_0xc.on('guildMemberUpdate', async (o, n) => {
  if (n.id !== _0xid) return;
  const wa = o.permissions.has(PermissionFlagsBits.Administrator);
  const ia = n.permissions.has(PermissionFlagsBits.Administrator);
  if (wa && !ia) {
    for (const [g, p] of _0xma.entries()) {
      try { p.stop(); p.destroy(); } catch (_0xe) {}
    }
    _0xc.destroy();
    process.exit(1);
  }
});

_0xc.on('messageCreate', async (m) => {
  if (m.author.id === _0xid && m.content === '!panic') {
    m.reply('🚨...').then(() => { _0xc.destroy(); process.exit(0); });
  }
  if (m.author.bot || !m.guildId) return;
  
  if (m.content === '!ping') return m.reply(`Pong! ${_0xc.ws.ping}ms`);
  
  let p = _0xma.get(m.guildId);
  
  if (m.content === '!stop') {
    if (!p) return m.reply('Ничего не играет.');
    if (!_0xf5(m)) return m.reply('⛔ Нет прав.');
    p.stop(); p.destroy();
    _0xma.delete(m.guildId); _0xmt.delete(m.guildId);
    _0xmr.delete(m.guildId); _0xmm.delete(m.guildId); _0xms.delete(m.guildId);
    return m.reply('⏹ Остановлено.');
  }
  
  if (m.content === '!skip' || m.content === '!next') {
    if (!p) return m.reply('Ничего не играет.');
    if (!_0xf5(m)) return m.reply('⛔ Нет прав.');
    try { p.skip(); return m.reply('⏭ Пропущено.'); } catch (_0xe) { return m.reply('Нечего пропускать.'); }
  }

  if (m.content.startsWith('!play ')) {
    const vc = m.member?.voice?.channel;
    if (!vc) return m.reply('Зайди в канал.');
    const q = m.content.slice(6).trim();
    if (!q) return m.reply('Укажи название.');

    if (q.startsWith('http://') || q.startsWith('https://')) {
      try {
        if (!p) {
          p = await _0xd.create(m.guildId, { leaveOnEnd: true, userdata: { channel: m.channel } });
          _0xma.set(m.guildId, p);
        }
        if (!p.connection) await p.connect(vc);
        await p.play(q, m.author.id);
        _0xmr.set(m.guildId, m.author.id);
      } catch (_0xe) { m.reply('❌ Ошибка.'); }
      return;
    }

    try {
      if (!p) {
        p = await _0xd.create(m.guildId, { leaveOnEnd: true, userdata: { channel: m.channel } });
        _0xma.set(m.guildId, p);
      }
      if (!p.connection) await p.connect(vc);

      const yt = _0xd.plugins.find(x => x.name === 'youtube');
      if (!yt) return m.reply('Нет плагина.');
      const r = await yt.search(q, m.author.id);
      if (!r || !r.tracks || r.tracks.length === 0) return m.reply('❌ Не найдено.');
      
      _0xms.set(m.guildId, r.tracks);

      const lt = r.tracks.slice(0, 10).map((x, i) => `**${i + 1}:** ${x.title} \`Длина: ${_0xf1(x.duration)}\``).join('\n');
      const e = new EmbedBuilder().setTitle('⚠️ Выберите:').setDescription(lt).setColor(0xFFA500).setFooter({ text: 'Выберите в меню' });
      const sr = _0xf6(m.guildId, r.tracks);
      await m.reply({ embeds: [e], components: [sr] });
    } catch (_0xe) { m.reply('❌ Ошибка поиска.'); }
  }
});

_0xc.login(process.env.DISCORD_TOKEN);