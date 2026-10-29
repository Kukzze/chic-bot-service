import fs from 'fs';
import http from 'http';
import { spawn, execFile, execSync } from 'node:child_process';
import WebSocket from 'ws';
import ffmpegStatic from 'ffmpeg-static';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  NoSubscriberBehavior
} from '@discordjs/voice';

// Load KEY=VALUE pairs from .env (lives on the server only, never committed)
try {
  for (const line of fs.readFileSync(new URL("./.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch (e) {}

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("[FATAL] DISCORD_TOKEN is not set. Add it to /home/container/.env as DISCORD_TOKEN=your_token");
  process.exit(1);
}
const GUILD_ID = "1562037193961242644";
const BOT_ID = "1562147527762124831";
const WOLF_ID = "1042743525705523291";
const KUKZZE_ID = "1324929992177746004";

// Channels
const BOT_CORNER_CH = "1562037196918227003";
const DANK_MEMER_CH = "1563804505659932733";
const MEMES_CH = "1563245239727165601";
const VERIFY_CH = "1563619147382915184";
const WELCOME_CH = "1563626258112192683";
const START_HERE_CH = "1562037195965993052";
const ROLES_CH = "1562037195965993052";
const SERVER_LOGS_CH = "1563619145495347211";
const AI_LOG_CH = "1563624647243857971";
const CONTACT_CH = "1562037195965993057";
const GENERAL_CH = "1562037196238757918";
const FITNESS_TALK_CH = "1562037196238757920";
const PROGRESS_CH = "1562037196238757921";
const BUMP_CH = "1563623243598798898";
const MUSIC_CMD_CH = "1563625780150407289";
const WORKOUT_RADIO_VC = "1563623245222252587";
const WINS_CH = "1562037196238757926";
const REP_COUNTER_CH = "1563828990521647156";

// Categories
const TICKETS_CAT_ID = "1563622199825404047";

// Roles
const VERIFIED_ROLE_ID = "1563631919227342858";
const MEMBER_ROLE_ID = "1563618880281255936";
const CO_FOUNDER_ROLE_ID = "1562037194003054678";
const LEAD_ADMIN_ROLE_ID = "1562037194003054677";
const MOD_ROLE_ID = "1562037194003054675";
const BOTS_ROLE_ID = "1563628617907568692";
const BUMP_PING_ROLE_ID = "1563613854800281624";

const LOG_FILE = process.env.LOG_FILE || "./bot.log";
let resolvedYtDlp = process.env.YTDLP_PATH || null;
const PLAYLIST_FILE = process.env.PLAYLIST_FILE || "./spotify-playlist.json";
const LEVELS_DB_PATH = process.env.LEVELS_DB_PATH || "./levels-db.json";

let memoryLogs = [];
let logCounter = 0;
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  memoryLogs.push(line);
  if (memoryLogs.length > 200) memoryLogs.shift();
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
    logCounter++;
    if (logCounter % 50 === 0) {
      if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) {
        const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
        fs.writeFileSync(LOG_FILE, lines.slice(-400).join('\n') + '\n', 'utf8');
      }
    }
  } catch (e) {}
}

async function getYtDlpPath() {
  if (resolvedYtDlp && fs.existsSync(resolvedYtDlp)) return resolvedYtDlp;
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const localBin = `./${binName}`;

  if (fs.existsSync(localBin)) {
    resolvedYtDlp = localBin;
    return resolvedYtDlp;
  }

  // Attempt auto-download
  try {
    log(`[yt-dlp] Downloading ${binName} standalone binary...`);
    const dlUrl = process.platform === 'win32'
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    const res = await fetch(dlUrl, { redirect: 'follow' });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(localBin, buf);
      if (process.platform !== 'win32') {
        try { fs.chmodSync(localBin, 0o755); } catch (e) {}
      }
      log(`[yt-dlp] Successfully downloaded ${binName}!`);
      resolvedYtDlp = localBin;
      return resolvedYtDlp;
    }
  } catch (err) {
    log(`[yt-dlp DL Err] ${err.message}`);
  }

  resolvedYtDlp = localBin;
  return resolvedYtDlp;
}

let resolvedFfmpeg = null;
async function getFfmpegPath() {
  if (resolvedFfmpeg && fs.existsSync(resolvedFfmpeg)) return resolvedFfmpeg;

  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    resolvedFfmpeg = ffmpegStatic;
    return resolvedFfmpeg;
  }

  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const localBin = `./${binName}`;
  if (fs.existsSync(localBin)) {
    resolvedFfmpeg = localBin;
    return resolvedFfmpeg;
  }

  const installJs = './node_modules/ffmpeg-static/install.js';
  if (fs.existsSync(installJs)) {
    try {
      log('[ffmpeg] Downloading ffmpeg binary via install.js...');
      execSync(`node "${installJs}"`, { stdio: 'inherit' });
      if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        resolvedFfmpeg = ffmpegStatic;
        log(`[ffmpeg] Successfully installed ffmpeg at ${ffmpegStatic}`);
        return resolvedFfmpeg;
      }
    } catch (e) {
      log(`[ffmpeg install.js err] ${e.message}`);
    }
  }

  resolvedFfmpeg = binName;
  return resolvedFfmpeg;
}

process.on('uncaughtException', (err) => {
  if (err && (err.code === 'EPIPE' || err.message?.includes('EPIPE'))) {
    return;
  }
  log(`[FATAL] Uncaught Exception: ${err.stack || err}`);
});

process.on('unhandledRejection', (reason) => {
  log(`[ERROR] Unhandled Rejection: ${reason}`);
});

// -------------------------------------------------------------
// Cloud HTTP Health Check (Render & Railway Web Services)
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/logs') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(memoryLogs.join('\n'));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    bot: 'Chic Bot 24/7 Cloud Service',
    uptime: Math.floor(process.uptime()),
    nowPlaying: TRACKS[currentTrackIndex]?.title || 'None',
    trackIndex: currentTrackIndex + 1,
    totalTracks: TRACKS.length
  }));
});
server.listen(PORT, '0.0.0.0', () => {
  log(`[HTTP Healthcheck] Listening on port ${PORT}`);
});

const ALLOWED_SELF_ROLES = {
  "1563613840913076285": "Powerlifting",
  "1563613843228467334": "Bodybuilding",
  "1563613845409235056": "Calisthenics",
  "1563613847229698253": "Hybrid Athlete",
  "1563613849784029274": "Commercial Gym",
  "1563613852342689802": "Home Gym",
  "1563613854800281624": "Announcements Ping",
  "1563613857568530552": "Challenges Ping"
};

const CHATTER_ROLES = {
  5: { id: "1563809425251242064", name: "💬 Average Chatter" },
  10: { id: "1563809427134488596", name: "🔥 Good Chatter" },
  20: { id: "1563809428707352588", name: "⚡ Crazy Chatter" },
  35: { id: "1563809430569484400", name: "👑 God Chatter" },
  50: { id: "1563809433014898688", name: "🌌 Ascended Chatter" }
};

// -------------------------------------------------------------
// Chic Bot Native Leveling & XP Engine (100% Free)
// -------------------------------------------------------------
let levelsDb = {};
try {
  levelsDb = JSON.parse(fs.readFileSync(LEVELS_DB_PATH, 'utf8'));
} catch (e) {
  levelsDb = {};
}

function saveLevelsDb() {
  try {
    fs.writeFileSync(LEVELS_DB_PATH, JSON.stringify(levelsDb, null, 2));
  } catch (e) {}
}

function getRequiredXp(lvl) {
  return 5 * (lvl ** 2) + 50 * lvl + 100;
}

function getLevelAndProgress(totalXp) {
  let lvl = 0;
  let remaining = totalXp;
  while (true) {
    const req = getRequiredXp(lvl);
    if (remaining < req) {
      return { level: lvl, currentXp: remaining, requiredXp: req, progress: remaining / req };
    }
    remaining -= req;
    lvl++;
  }
}

async function handleMessageXp(msg) {
  const author = msg.author;
  if (!author || author.bot) return;

  const userId = author.id;
  const now = Date.now();

  if (!levelsDb[userId]) {
    levelsDb[userId] = {
      username: author.username,
      xp: 0,
      level: 0,
      lastMessage: 0
    };
  }

  const userRecord = levelsDb[userId];
  userRecord.username = author.username;

  if (now - (userRecord.lastMessage || 0) < 45000) return;
  userRecord.lastMessage = now;

  const gained = Math.floor(15 + Math.random() * 11);
  userRecord.xp += gained;

  const { level: newLevel } = getLevelAndProgress(userRecord.xp);
  const oldLevel = userRecord.level || 0;

  if (newLevel > oldLevel) {
    userRecord.level = newLevel;
    log(`[Level Up] @${author.username} leveled up from ${oldLevel} to ${newLevel}! Total XP: ${userRecord.xp}`);

    let unlockedRole = null;
    for (const [milestone, role] of Object.entries(CHATTER_ROLES)) {
      if (newLevel >= Number(milestone) && oldLevel < Number(milestone)) {
        unlockedRole = role;
        log(`[Role Award] Granting ${role.name} to @${author.username}...`);
        await discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${role.id}`, "PUT").catch(() => {});
      }
    }

    // Only role unlocks and every 5th level get a DM; the rest stay quiet (anyone can check with !rank)
    if (unlockedRole || newLevel % 5 === 0) {
      await announceLevelUp(author, newLevel, unlockedRole);
    }
  }

  saveLevelsDb();
}

function nextChatterMilestone(level) {
  const next = Object.keys(CHATTER_ROLES).map(Number).find(m => m > level);
  return next ? { level: next, role: CHATTER_ROLES[next] } : null;
}

async function announceLevelUp(author, level, unlockedRole) {
  const next = nextChatterMilestone(level);
  const nextLine = next
    ? `Next unlock: **${next.role.name}** at Level ${next.level}.`
    : `You've reached the top chat rank. Nothing left to unlock.`;

  // Role names are written out in full because role mentions don't render in DMs
  const card = embed({
    title: unlockedRole ? `🏆 Level ${level}: new role unlocked` : `⚡ Level ${level}`,
    description: (unlockedRole
      ? `## ${unlockedRole.name}\nYou've been active enough in Chic Gang to earn this role. It's on your profile now.`
      : `## Level ${level} reached\nYou're putting in the reps in the chat too.`) +
      `\n${DIVIDER}\n${nextLine}\nCheck your progress anytime with \`!rank\`.`,
    color: unlockedRole ? COLORS.gold : COLORS.brand,
    thumbnail: avatarUrl(author),
    image: GIF("levelup"),
    footer: "Chic Gang · Private level alert"
  });

  try {
    const dmChannel = await discordApi('/users/@me/channels', 'POST', { recipient_id: author.id });
    await discordApi(`/channels/${dmChannel.id}/messages`, 'POST', { embeds: [card] });
  } catch (dmErr) {
    // DMs closed: role unlocks get a short public note in #wins that removes itself after 20 seconds
    if (!unlockedRole) return;
    try {
      const tempMsg = await discordApi(`/channels/${WINS_CH}/messages`, "POST", {
        content: `<@${author.id}>`,
        embeds: [card],
        allowed_mentions: { users: [author.id] }
      });
      if (tempMsg && tempMsg.id) {
        setTimeout(() => {
          discordApi(`/channels/${WINS_CH}/messages/${tempMsg.id}`, "DELETE").catch(() => {});
        }, 20000);
      }
    } catch (e) {}
  }
}

async function discordApi(endpoint, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json"
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`https://discord.com/api/v10${endpoint}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${method} ${endpoint} returned ${res.status}: ${text}`);
  }
  if (res.status === 204) return true;
  return await res.json();
}

function respondInteraction(id, token, data) {
  return fetch(`https://discord.com/api/v10/interactions/${id}/${token}/callback`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  }).catch(e => log(`[Respond Interaction Err] ${e.message}`));
}

async function reactEmoji(channelId, messageId, emoji) {
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, {
      method: "PUT",
      headers: { Authorization: `Bot ${TOKEN}` }
    });
  } catch (e) {}
}

// -------------------------------------------------------------
// Message Style (the_wolf.ie guide: wide headers, clean dividers, few emojis, English only)
// -------------------------------------------------------------
const DIVIDER = "─────────────────────────";
const COLORS = { brand: 0xE5F788, gold: 0xF1C40F, alert: 0xE74C3C, info: 0x3498DB, bot: 0x9B59B6 };
const NO_PINGS = { parse: [] };

// Branded banners in assets/gifs (bump ?v= when a GIF changes so Discord drops its cached copy)
const GIF = name => `https://raw.githubusercontent.com/Kukzze/chic-bot-service/main/assets/gifs/${name}.gif?v=1`;

function embed({ title, description, color = COLORS.brand, fields, thumbnail, image, footer = "Chic Gang", timestamp = true }) {
  const e = { title, description, color };
  if (fields) e.fields = fields;
  if (thumbnail) e.thumbnail = { url: thumbnail };
  if (image) e.image = { url: image };
  if (footer) e.footer = { text: footer };
  if (timestamp) e.timestamp = new Date().toISOString();
  return e;
}

function avatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
  let fallback = 0;
  try { fallback = Number((BigInt(user.id) >> 22n) % 6n); } catch (e) {}
  return `https://cdn.discordapp.com/embed/avatars/${fallback}.png`;
}

function displayName(user) {
  return user.global_name || user.username;
}

// Reply to a message without pinging the author
async function replyTo(msg, response) {
  const payload = typeof response === "string" ? { content: response } : response;
  try {
    await discordApi(`/channels/${msg.channel_id}/messages`, "POST", {
      ...payload,
      message_reference: { message_id: msg.id, fail_if_not_exists: false },
      allowed_mentions: { parse: [], replied_user: false }
    });
  } catch (err) {
    log(`[Reply Err] ${err.message}`);
  }
}

// Edit the original response of a deferred interaction
function editOriginal(token, data) {
  return discordApi(`/webhooks/${BOT_ID}/${token}/messages/@original`, "PATCH", data)
    .catch(e => log(`[Edit Original Err] ${e.message}`));
}

async function postServerLog(title, description, color = COLORS.info) {
  try {
    await discordApi(`/channels/${SERVER_LOGS_CH}/messages`, "POST", {
      embeds: [embed({ title, description, color, footer: "Chic Gang · Server log" })],
      allowed_mentions: NO_PINGS
    });
  } catch (err) {}
}

const cooldowns = new Map();
function isCoolingDown(key, cooldownMs = 10000) {
  const now = Date.now();
  if (cooldowns.has(key)) {
    const expire = cooldowns.get(key);
    if (now < expire) return true;
  }
  cooldowns.set(key, now + cooldownMs);
  return false;
}

// -------------------------------------------------------------
// Auto Welcome System with Fast History Cache & 4-Layer Trigger
// -------------------------------------------------------------
const RULES_CH = "1562037195965993053";
const SELF_ROLES_CH = "1563614050590662729";
const TESTING_CH = "1562037196238757925";

const welcomedUserIds = new Set();

async function initWelcomedHistory() {
  try {
    const res = await discordApi(`/channels/${WELCOME_CH}/messages?limit=100`);
    if (Array.isArray(res)) {
      for (const m of res) {
        for (const u of m.mentions || []) welcomedUserIds.add(u.id);
        const match = m.content.match(/<@(\d+)>/);
        if (match) welcomedUserIds.add(match[1]);
      }
    }
    log(`[Welcome Init] Cached ${welcomedUserIds.size} already-welcomed user IDs from history.`);
  } catch (e) {
    log(`[Welcome Init Err] ${e.message}`);
  }
}

async function sendMemberWelcome(user) {
  if (!user || user.id === BOT_ID) return;
  if (welcomedUserIds.has(user.id)) return;

  welcomedUserIds.add(user.id);

  try {
    // The <@id> in content is also how initWelcomedHistory remembers who was already welcomed
    if (user.bot) {
      log(`[Welcome] Broadcasting bot activation for @${user.username} (${user.id})...`);
      await discordApi(`/guilds/${GUILD_ID}/members/${user.id}/roles/${BOTS_ROLE_ID}`, "PUT").catch(() => {});

      await discordApi(`/channels/${WELCOME_CH}/messages`, "POST", {
        content: `🤖 <@${user.id}> has been added to the server.`,
        embeds: [
          embed({
            title: `New bot: ${user.username}`,
            description: `Given the <@&${BOTS_ROLE_ID}> role automatically.\n${DIVIDER}\nBot commands go in <#${BOT_CORNER_CH}>. Dank Memer lives in <#${DANK_MEMER_CH}>.`,
            color: COLORS.bot,
            thumbnail: avatarUrl(user),
            footer: "Chic Gang · Bot registry"
          })
        ],
        allowed_mentions: NO_PINGS
      });
      return;
    }

    log(`[Welcome] Broadcasting welcome for athlete @${user.username} (${user.id})...`);

    const postRes = await discordApi(`/channels/${WELCOME_CH}/messages`, "POST", {
      content: `Welcome to Chic Gang, <@${user.id}>.`,
      embeds: [
        embed({
          title: `⚡ Welcome, ${displayName(user)}`,
          description:
            `Chic Gang is the home of **Chic Builder** and a crew of people who take their training seriously. Ask questions, post your lifts, and help the next person out.\n` +
            `${DIVIDER}\n` +
            `### Get set up\n` +
            `**1.** Verify in <#${VERIFY_CH}> to unlock the server.\n` +
            `**2.** Read the rules in <#${RULES_CH}>.\n` +
            `**3.** Pick your training style in <#${SELF_ROLES_CH}>.\n` +
            `**4.** Want early access to the Android app? See <#${TESTING_CH}>.`,
          thumbnail: avatarUrl(user),
          image: GIF("welcome"),
          footer: "Chic Gang · Welcome"
        })
      ],
      allowed_mentions: { users: [user.id] }
    });

    if (postRes && postRes.id) {
      reactEmoji(WELCOME_CH, postRes.id, "👋");
    }

    await postServerLog(
      "Member joined",
      `<@${user.id}> (\`${user.username}\`)\nWelcome posted in <#${WELCOME_CH}>.`,
      COLORS.brand
    );
  } catch (err) {
    log(`[Welcome Error] ${err.message}`);
  }
}

async function reconcileRecentJoins() {
  try {
    const msgs = await discordApi(`/channels/${WELCOME_CH}/messages?limit=5`);
    if (Array.isArray(msgs)) {
      for (const m of msgs) {
        if (m.type === 7 && m.author && !welcomedUserIds.has(m.author.id)) {
          log(`[Reconciler] Detected un-welcomed Type 7 join for @${m.author.username} (${m.author.id})`);
          await sendMemberWelcome(m.author);
        }
      }
    }

    const audit = await discordApi(`/guilds/${GUILD_ID}/audit-logs?limit=5`);
    if (audit && Array.isArray(audit.audit_log_entries)) {
      for (const entry of audit.audit_log_entries) {
        if (entry.action_type === 28 && entry.target_id) {
          if (!welcomedUserIds.has(entry.target_id)) {
            const user = (audit.users || []).find(u => u.id === entry.target_id) || { id: entry.target_id, username: "Bot", bot: true };
            log(`[Reconciler] Detected un-welcomed bot in audit log: @${user.username} (${entry.target_id})`);
            await sendMemberWelcome(user);
          }
        }
      }
    }
  } catch (e) {}
}

// -------------------------------------------------------------
// Real-time Smart Chat & Conversational Gym Spotter Engine
// -------------------------------------------------------------
const chatCooldowns = new Map();
function canTriggerAmbient(channelId, cooldownMs = 10000) {
  const now = Date.now();
  const last = chatCooldowns.get(channelId) || 0;
  if (now - last < cooldownMs) return false;
  chatCooldowns.set(channelId, now);
  return true;
}

const QUOTES = [
  { quote: "There is no reason to be alive if you can't do the deadlift.", author: "Jón Páll Sigmarsson" },
  { quote: "Everybody wants to be a bodybuilder, but nobody wants to lift no heavy-ass weights.", author: "Ronnie Coleman" },
  { quote: "The last three or four reps is what makes the muscle grow.", author: "Arnold Schwarzenegger" },
  { quote: "Strength does not come from winning. Your struggles develop your strengths.", author: "Arnold Schwarzenegger" },
  { quote: "Discipline is doing what you hate to do, but doing it like you love it.", author: "Mike Tyson" },
  { quote: "Don't count the days. Make the days count.", author: "Muhammad Ali" },
  { quote: "We're all gonna make it, brah.", author: "Zyzz" }
];

const ROASTS = [
  "Upper body says powerlifter, legs say flamingo. The squat rack misses you.",
  "Three years of bulking and still no visible delts. That's not a bulk, that's a lifestyle.",
  "Your bench range of motion is so short the bar thinks you're just saying hi.",
  "45 minutes of band warm-ups for 3 sets of scrolling on the incline bench. Elite work.",
  "Your pre-workout has more active ingredients than your program.",
  "Half reps build half physiques. Drop the ego, drop the weight, touch the chest.",
  "The 2.5 kg plates have been waiting on you longer than your rest timer."
];

const PR_REPLIES = [
  "That's a PR. Log it in Chic Builder before you forget the numbers. 🏆",
  "New PR on the board. Strong work, now recover well so the next one comes too.",
  "PR logged in the chat. Respect. Keep the form as clean as that number."
];

const FORM_CUES = {
  squat: {
    name: "Back Squat",
    cues: [
      "Big breath into your belly and brace before you unrack, then again before every rep.",
      "Bar stays over mid-foot the whole way. If it drifts forward, you're folding.",
      "Knees track in line with your toes. Don't let them cave in on the way up.",
      "Go as deep as you can while your lower back stays neutral.",
      "Drive up through your whole foot, chest and hips rising together."
    ]
  },
  bench: {
    name: "Bench Press",
    cues: [
      "Pull your shoulder blades back and down, then keep them pinned for the whole set.",
      "Feet planted and pushing into the floor. Leg drive is part of the lift.",
      "Lower the bar under control to your lower chest or sternum.",
      "Elbows roughly 45–70° from your body, wrists stacked over elbows.",
      "Press back toward your face slightly, so the bar finishes over your shoulders."
    ]
  },
  deadlift: {
    name: "Deadlift",
    cues: [
      "Bar over mid-foot, shins close to the bar before you pull.",
      "Lock your lats in, as if you're squeezing oranges in your armpits.",
      "Take the slack out of the bar before it leaves the floor. No jerking.",
      "Push the floor away with your legs and keep the bar dragging up your legs.",
      "Finish by squeezing your glutes. Don't lean back at the top."
    ]
  },
  ohp: {
    name: "Overhead Press",
    cues: [
      "Squeeze your glutes and abs so your lower back doesn't arch.",
      "Bar starts resting on your front delts, forearms vertical.",
      "Move your head back out of the way, then push it through once the bar passes.",
      "Press in a straight line up, finishing with the bar over mid-foot.",
      "Lock out with your biceps beside your ears."
    ]
  },
  row: {
    name: "Barbell Row",
    cues: [
      "Hinge to roughly 45° with a flat back, knees softly bent.",
      "Pull to your lower ribs or upper stomach, driving your elbows back.",
      "Pause briefly at the top and squeeze your back.",
      "Lower under control. If your torso swings, the weight is too heavy."
    ]
  },
  pullup: {
    name: "Pull-up",
    cues: [
      "Start from a full dead hang, then pull your shoulders down before you bend your arms.",
      "Think about driving your elbows down toward your ribs.",
      "Chest toward the bar, chin clearing it at the top.",
      "Lower all the way down under control. No kipping."
    ]
  },
  rdl: {
    name: "Romanian Deadlift",
    cues: [
      "Soft knees that stay in place. This is a hinge, not a squat.",
      "Push your hips back and keep the bar close to your legs the whole time.",
      "Go down until your hamstrings stop you, usually just below the knee.",
      "Back stays neutral. Squeeze your glutes to stand up."
    ]
  },
  hipthrust: {
    name: "Hip Thrust",
    cues: [
      "Upper back on the edge of the bench, bar padded over your hips.",
      "Feet placed so your shins are vertical at the top.",
      "Tuck your chin and tilt your pelvis under at lockout.",
      "Squeeze your glutes to finish. Don't arch your lower back."
    ]
  }
};

const FORM_ALIASES = {
  squat: "squat", squats: "squat", "back squat": "squat",
  bench: "bench", "bench press": "bench", benchpress: "bench",
  deadlift: "deadlift", deadlifts: "deadlift", dl: "deadlift",
  ohp: "ohp", "overhead press": "ohp", "military press": "ohp", press: "ohp",
  row: "row", rows: "row", "barbell row": "row", "bent over row": "row",
  pullup: "pullup", pullups: "pullup", "pull up": "pullup", "pull-up": "pullup", chinup: "pullup", "chin up": "pullup",
  rdl: "rdl", "romanian deadlift": "rdl",
  "hip thrust": "hipthrust", hipthrust: "hipthrust", "hip thrusts": "hipthrust"
};

const PR_PATTERN = /\b(pr|pb|prs|pbs|personal (best|record)|new max)\b/i;
const FOREIGN_BOT_CMD = /^(pls|beg|hunt|fish|dig|pm|postmemes|m!|p!|c!|\/|!)/i;
const GYM_CHANNELS = [GENERAL_CH, FITNESS_TALK_CH, PROGRESS_CH];

function pickItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function prResponse() {
  return { content: pickItem(PR_REPLIES), embeds: [{ color: COLORS.brand, image: { url: GIF("pr") } }] };
}

function progressBar(fraction, size = 12) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * size);
  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function helpMessage() {
  return `## 🏋️ Chic Bot commands\n` +
    `**Training**\n` +
    `\`!formcheck <lift>\` Form cues for squat, bench, deadlift, ohp, row, pullup, rdl, hip thrust\n` +
    `\`!split\` Proven training splits\n` +
    `\`!macros <weight>\` Calorie and protein estimate (e.g. \`!macros 80\` or \`!macros 180lb\`)\n` +
    `\`!spot\` Get spotted through your set\n` +
    `${DIVIDER}\n` +
    `**Server**\n` +
    `\`!rank\` Your chat level and progress\n` +
    `\`!top\` Chat leaderboard\n` +
    `\`!np\` What's playing on Workout Radio\n` +
    `${DIVIDER}\n` +
    `**Fun**\n` +
    `\`!quote\` · \`!hype\` · \`!roast\` · \`!flip\` · \`!8ball <question>\`\n` +
    `-# You can also mention me or reply to me with a training question.`;
}

function formCheckResponse(raw) {
  const query = raw.replace(/^!formcheck/i, "").trim().toLowerCase();
  const key = FORM_ALIASES[query] || FORM_ALIASES[query.replace(/s$/, "")];
  const options = Object.values(FORM_CUES).map(f => f.name).join(", ");
  if (!key) {
    return query
      ? `I don't have cues for **${query}** yet. Try one of these: ${options}.`
      : `Tell me the lift, e.g. \`!formcheck squat\`. Available: ${options}.`;
  }
  const lift = FORM_CUES[key];
  return `## 📋 ${lift.name}: form cues\n` +
    lift.cues.map((c, i) => `**${i + 1}.** ${c}`).join("\n") +
    `\n${DIVIDER}\n-# Film from the side at hip height and post it in <#${FITNESS_TALK_CH}> for real feedback.`;
}

function macrosResponse(raw) {
  const match = raw.match(/!macros\s+(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|pounds?)?/i);
  if (!match) {
    return "Give me your bodyweight, e.g. `!macros 80` (kg) or `!macros 180lb`.";
  }
  const isPounds = /^(lb|lbs|pound|pounds)$/i.test(match[2] || "");
  const kg = isPounds ? parseFloat(match[1]) * 0.4536 : parseFloat(match[1]);
  if (kg < 30 || kg > 250) {
    return "That bodyweight looks off. Use kilograms (`!macros 80`) or add `lb` (`!macros 180lb`).";
  }

  const round10 = n => Math.round(n / 10) * 10;
  const maintenance = round10(kg * 33);
  const label = isPounds ? `${Math.round(parseFloat(match[1]))} lb` : `${Math.round(kg)} kg`;

  return `## 📊 Macro estimate: ${label}\n` +
    `**Maintenance:** ~${maintenance.toLocaleString()} kcal/day\n` +
    `**Lean bulk:** ~${(maintenance + 250).toLocaleString()} kcal/day (+250)\n` +
    `**Cut:** ~${(maintenance - 500).toLocaleString()} kcal/day (−500)\n` +
    `${DIVIDER}\n` +
    `**Protein:** ${Math.round(kg * 1.6)}–${Math.round(kg * 2.2)} g/day (1.6–2.2 g per kg)\n` +
    `**Fat:** at least ${Math.round(kg * 0.8)} g/day\n` +
    `**Carbs:** the rest of your calories\n` +
    `-# Rough estimate for a moderately active adult. Weigh in daily for two weeks and adjust by 100–200 kcal based on the trend.`;
}

function rankResponse(msg) {
  const mentionedId = (msg.content.match(/<@!?(\d+)>/g) || [])
    .map(m => m.replace(/\D/g, ""))
    .find(id => id !== BOT_ID);
  const targetId = mentionedId || msg.author.id;
  const target = (msg.mentions || []).find(u => u.id === targetId) || (targetId === msg.author.id ? msg.author : null);
  const record = levelsDb[targetId];
  const isSelf = targetId === msg.author.id;

  if (!record) {
    return isSelf
      ? "You haven't earned any XP yet. Chat in the server and you'll start leveling."
      : `<@${targetId}> hasn't earned any XP yet.`;
  }

  const { level, currentXp, requiredXp, progress } = getLevelAndProgress(record.xp);
  const ranked = Object.entries(levelsDb).sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));
  const position = ranked.findIndex(([id]) => id === targetId) + 1;
  const next = nextChatterMilestone(level);
  const name = target ? displayName(target) : record.username;

  return {
    embeds: [
      embed({
        title: `${name}: Level ${level}`,
        description:
          `${progressBar(progress)} **${Math.floor(progress * 100)}%**\n` +
          `${currentXp.toLocaleString()} / ${requiredXp.toLocaleString()} XP to Level ${level + 1}\n` +
          `${DIVIDER}\n` +
          `**Server rank:** #${position} of ${ranked.length}\n` +
          `**Total XP:** ${record.xp.toLocaleString()}\n` +
          (next ? `**Next role:** <@&${next.role.id}> at Level ${next.level}` : `**Top chat rank reached.**`),
        thumbnail: target ? avatarUrl(target) : undefined,
        footer: "Chic Gang · Chat levels",
        timestamp: false
      })
    ]
  };
}

function leaderboardResponse() {
  const medals = ["🥇", "🥈", "🥉"];
  const top = Object.entries(levelsDb)
    .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
    .slice(0, 10);

  if (top.length === 0) return "The leaderboard is empty. Start chatting to claim the top spot.";

  const lines = top.map(([id, rec], i) => {
    const { level } = getLevelAndProgress(rec.xp || 0);
    const place = medals[i] || `**${i + 1}.**`;
    return `${place} <@${id}> · Level ${level} · ${(rec.xp || 0).toLocaleString()} XP`;
  });

  return {
    embeds: [
      embed({
        title: "🏆 Chat leaderboard",
        description: lines.join("\n") + `\n${DIVIDER}\nCheck your own spot with \`!rank\`.`,
        color: COLORS.gold,
        footer: "Chic Gang · Top 10 by XP",
        timestamp: false
      })
    ]
  };
}

function nowPlayingResponse() {
  const t = TRACKS[currentTrackIndex];
  if (!t || !audioPlayer || audioPlayer.state.status !== AudioPlayerStatus.Playing) {
    return `Workout Radio is between tracks right now. Join <#${WORKOUT_RADIO_VC}> and it'll be back in a moment.`;
  }
  return `## 🎧 Now playing\n**${t.title}** by ${t.artist}\n` +
    `Track ${currentTrackIndex + 1} of ${TRACKS.length} · ${formatDuration(Date.now() - trackStartTime)} in\n` +
    `-# Live 24/7 in <#${WORKOUT_RADIO_VC}>`;
}

// Known ! commands. Returns null for anything else so other bots' commands are left alone.
function commandResponse(msg) {
  const raw = (msg.content || "").trim();
  const lower = raw.toLowerCase();
  if (!lower.startsWith("!")) return null;
  const cmd = lower.split(/\s+/)[0];

  switch (cmd) {
    case "!help":
    case "!commands":
      return helpMessage();
    case "!spot":
      return "Hands under the bar, I've got you. Unrack, control it down, and drive. It's all you until it isn't, and then I've got it. 🏋️";
    case "!roast":
      return `💀 ${pickItem(ROASTS)}`;
    case "!quote": {
      const q = pickItem(QUOTES);
      return `*"${q.quote}"*\n— **${q.author}**`;
    }
    case "!hype":
      return pickItem([
        "⚡ Headphones in, phone away, first set starts now. You already did the hard part by showing up.",
        "⚡ Nobody's coming to do these reps for you. Warm up, lock in, and make today count.",
        "⚡ You've done harder things than this set. Go get it."
      ]);
    case "!split":
      return `## 📋 Proven training splits\n` +
        `**Full Body** · 3 days/week. Best for beginners and busy schedules.\n` +
        `**Upper / Lower** · 4 days/week. Great balance of strength and size.\n` +
        `**Push / Pull / Legs** · 3 or 6 days/week. High volume for hypertrophy.\n` +
        `**Arnold Split** · Chest+Back / Shoulders+Arms / Legs, 6 days/week. Advanced.\n` +
        `${DIVIDER}\n` +
        `The best split is the one you can actually show up for. Track it in Chic Builder.`;
    case "!macros":
      return macrosResponse(raw);
    case "!formcheck":
      return formCheckResponse(raw);
    case "!rank":
    case "!level":
      return rankResponse(msg);
    case "!top":
    case "!leaderboard":
      return leaderboardResponse();
    case "!np":
    case "!nowplaying":
      return nowPlayingResponse();
    case "!flip":
      return Math.random() < 0.5
        ? "🪙 **Heads.** One more set to failure."
        : "🪙 **Tails.** Drop set on your last exercise.";
    case "!8ball": {
      if (raw.split(/\s+/).length < 2) return "Ask me a question, e.g. `!8ball should I go for a PR today?`";
      return `🎱 ${pickItem([
        "Yes. Load the bar.",
        "No. Your form isn't ready for that yet.",
        "Signs point to yes. Warm up properly first.",
        "Take a rest day. Your nervous system will thank you.",
        "Absolutely. RPE 10 incoming.",
        "Ask again after your protein shake."
      ])}`;
    }
    default:
      return null;
  }
}

// Replies when someone talks to the bot directly (mention, reply, or #bot-corner)
function conversationResponse(text) {
  const lower = text.replace(/<@!?\d+>/g, "").trim().toLowerCase();

  if (/\b(spot me)\b/.test(lower)) return commandResponse({ content: "!spot" });
  if (/\b(roast me)\b/.test(lower)) return commandResponse({ content: "!roast" });
  if (/\b(motivate me|hype me|hype me up)\b/.test(lower)) return commandResponse({ content: "!hype" });
  if (/\b(flip a coin)\b/.test(lower)) return commandResponse({ content: "!flip" });

  if (PR_PATTERN.test(lower) && !lower.includes("?")) return prResponse();

  if (/\b(skip(ping)? leg|skip legs)\b/.test(lower)) {
    return "Skipping leg day is how you end up with a great top half on toothpicks. Squat rack's waiting.";
  }
  if (/\b(leg day|squats?|calves|quads|hamstrings)\b/.test(lower)) {
    return "Leg day. Control the way down, hit depth you own, and don't rush your rest. `!formcheck squat` if you want cues.";
  }
  if (/\bcreatine\b/.test(lower)) {
    return "3–5 g of creatine monohydrate a day, any time of day. No loading phase needed. Consistency is what matters.";
  }
  if (/\bcheat meal\b/.test(lower)) {
    return "One meal won't undo a good week. Hit your protein, enjoy it, and get back on plan at the next meal.";
  }
  if (/\b(protein|whey|bulk|bulking|cut|cutting|calories|diet|carbs)\b/.test(lower)) {
    return "Keep it simple: 1.6–2.2 g of protein per kg of bodyweight, mostly whole foods, and calories set for your goal. `!macros <weight>` gives you numbers.";
  }
  if (/\b(lazy|tired|don't feel like|dont feel like|no motivation|demotivated)\b/.test(lower)) {
    return "Motivation comes and goes. Do the warm-up and the first working set. Most days, that's enough to get you going.";
  }
  if (/\b(glutes?|hip thrusts?)\b/.test(lower)) {
    return "Hip thrusts and RDLs do most of the work for glutes. Pause at the top and actually squeeze. `!formcheck hip thrust` for cues.";
  }
  if (/\b(abs|six pack|core)\b/.test(lower)) {
    return "Abs are built with training and shown with a calorie deficit. Hanging leg raises and cable crunches, then let your diet do the rest.";
  }
  if (/\b(biceps?|triceps?|arms|curls?)\b/.test(lower)) {
    return "Triceps make up most of your arm size, so don't skip them. Full range of motion and control on the way down.";
  }
  if (/\b(split|program|routine)\b/.test(lower)) return commandResponse({ content: "!split" });
  if (/\b(chic builder|the app)\b/.test(lower)) {
    return "Chic Builder: 909+ exercises that work offline, no ads, and progressive overload tracking built in. 📱";
  }
  if (/\b(ronnie|coleman|light ?weight|yeah buddy|yea buddy)\b/.test(lower)) {
    return "\"Yeah buddy! Light weight, baby!\"\n— **Ronnie Coleman**";
  }
  if (/\b(thanks|thank you|thx|ty)\b/.test(lower)) {
    return pickItem(["Anytime.", "Any time. Go get it.", "Happy to help. Now go train."]);
  }
  if (/\b(hi|hello|hey|yo|sup|wassup)\b/.test(lower)) {
    return pickItem(["Hey. What are you training today?", "Yo. Push, pull or legs today?", "Hey. Ready to put in some work?"]);
  }

  return pickItem([
    "I'm better with training questions. Try `!help` to see everything I can do.",
    "Not sure I follow. Ask me about form, splits or macros, or type `!help`.",
    "Got a training question? Ask away, or type `!help` for commands."
  ]);
}

// Unprompted replies in gym channels: only for strong signals, so the bot doesn't hijack conversations
function ambientResponse(lower) {
  if (PR_PATTERN.test(lower) && !lower.includes("?")) return prResponse();
  if (/\b(skip(ping)? leg|skip legs)\b/.test(lower)) {
    return "Skipping leg day is how you end up with a great top half on toothpicks. Squat rack's waiting.";
  }
  return null;
}

async function handleChatKeywords(msg) {
  const author = msg.author;
  if (!author || author.bot) return;

  const chId = msg.channel_id;
  const content = (msg.content || "").trim();
  const lower = content.toLowerCase();

  const mentionsBot = (msg.mentions || []).some(u => u.id === BOT_ID) ||
    lower.includes(`<@${BOT_ID}>`) ||
    lower.includes(`<@!${BOT_ID}>`);
  const isReplyToBot = msg.referenced_message?.author?.id === BOT_ID;
  const command = commandResponse(msg);

  // In #rep-counter, numbers are for counting; only answer when pinged or commanded
  if (chId === REP_COUNTER_CH) {
    if (mentionsBot || command) {
      await replyTo(msg, `The bar is at **${repState.currentCount}**. Next rep is **${repState.currentCount + 1}**. One number each, no counting twice in a row.`);
    }
    return;
  }

  // React to PR posts
  if (PR_PATTERN.test(lower) && !lower.includes("?")) {
    reactEmoji(chId, msg.id, "cb_big_w:1563245281661690036").catch(() => {});
    reactEmoji(chId, msg.id, "cb_pr:1563245271784103957").catch(() => {});
  }

  let response = command;
  if (!response) {
    if (mentionsBot || isReplyToBot) {
      response = conversationResponse(content);
    } else if (chId === BOT_CORNER_CH) {
      if (!FOREIGN_BOT_CMD.test(content) && canTriggerAmbient(chId, 3000)) {
        response = conversationResponse(content);
      }
    } else if (GYM_CHANNELS.includes(chId)) {
      const ambient = ambientResponse(lower);
      if (ambient && canTriggerAmbient(chId, 10 * 60 * 1000)) response = ambient;
    }
  }

  if (!response) return;
  log(`[Smart Chat] Replying to @${author.username} in #${chId}`);
  await replyTo(msg, response);
}

// -------------------------------------------------------------
// Rep Counter Barbell Form Checker & Milestone System
// -------------------------------------------------------------
const REP_STATE_FILE = process.env.REP_STATE_FILE || "./rep-counter.json";
let repState = { currentCount: 0, lastUserId: null };

try {
  if (fs.existsSync(REP_STATE_FILE)) {
    repState = JSON.parse(fs.readFileSync(REP_STATE_FILE, 'utf-8'));
  }
} catch (e) {}

function saveRepState() {
  try {
    fs.writeFileSync(REP_STATE_FILE, JSON.stringify(repState, null, 2));
  } catch (e) {}
}

async function initRepState() {
  try {
    const res = await discordApi(`/channels/${REP_COUNTER_CH}/messages?limit=15`);
    if (Array.isArray(res)) {
      for (const m of res) {
        if (m.author?.bot) continue;
        const clean = (m.content || "").replace(/<@!?\d+>/g, '').trim();
        const match = clean.match(/^(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > repState.currentCount) {
            repState.currentCount = num;
            repState.lastUserId = m.author.id;
            log(`[Rep Counter Init] Synchronized state from channel: currentCount=${num}, lastUser=@${m.author.username}`);
            saveRepState();
            break;
          }
        }
      }
    }
  } catch (e) {
    log(`[Rep Counter Init Err] ${e.message}`);
  }
}

async function handleRepCounterMessage(d) {
  if (d.author?.bot) return;

  const rawContent = (d.content || "").trim();
  const clean = rawContent.replace(/<@!?\d+>/g, '').trim();
  const match = clean.match(/^(\d+)$/);
  if (!match) return;

  const num = parseInt(match[1], 10);
  const expected = repState.currentCount + 1;
  const userId = d.author.id;
  const brokenAt = repState.currentCount;

  let foul = null;
  if (brokenAt > 0 && userId === repState.lastUserId) {
    foul = { title: "❌ Counted twice: set reset", reason: `<@${userId}> counted twice in a row. One number each, then let someone else go.` };
  } else if (num !== expected) {
    foul = { title: "❌ Wrong number: set reset", reason: `<@${userId}> said **${num}**, but the next rep was **${expected}**.` };
  }

  if (foul) {
    reactEmoji(REP_COUNTER_CH, d.id, "❌");
    repState.currentCount = 0;
    repState.lastUserId = null;
    saveRepState();

    // Nothing was lost if the count was already at zero, so the ❌ is enough
    if (brokenAt === 0) return;

    try {
      await discordApi(`/channels/${REP_COUNTER_CH}/messages`, "POST", {
        embeds: [
          embed({
            title: foul.title,
            description: `${foul.reason}\n${DIVIDER}\nThe set ended at **${brokenAt.toLocaleString()}** rep${brokenAt === 1 ? "" : "s"}. Server record: **${(repState.best || brokenAt).toLocaleString()}**.\nStart again from **1**.`,
            color: COLORS.alert,
            footer: "Chic Gang · Rep counter"
          })
        ],
        allowed_mentions: NO_PINGS
      });
    } catch (e) {}
    return;
  }

  // Clean rep
  repState.currentCount = num;
  repState.lastUserId = userId;
  if (num > (repState.best || 0)) repState.best = num;
  saveRepState();

  reactEmoji(REP_COUNTER_CH, d.id, "✅");

  const milestones = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  if (milestones.includes(num)) {
    const next = milestones.find(m => m > num);
    try {
      await discordApi(`/channels/${REP_COUNTER_CH}/messages`, "POST", {
        embeds: [
          embed({
            title: `🏆 ${num.toLocaleString()} reps`,
            description: `<@${userId}> hit rep **#${num.toLocaleString()}** on the community bar.\n${DIVIDER}\n` +
              (next ? `Next milestone: **${next.toLocaleString()}**. Keep it clean.` : `That's the final milestone. Legendary set.`),
            color: COLORS.gold,
            image: GIF("milestone"),
            footer: "Chic Gang · Rep counter"
          })
        ],
        allowed_mentions: NO_PINGS
      });
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Disboard Bump Detection & Cooldown
// -------------------------------------------------------------
const BUMP_STATE_FILE = process.env.BUMP_STATE_FILE || "./bump-state.json";
let bumpTimeout = null;

// The reminder time is saved to disk so a restart doesn't lose it
function scheduleBumpReminder(readyAtMs) {
  if (bumpTimeout) clearTimeout(bumpTimeout);
  bumpTimeout = setTimeout(async () => {
    try {
      log(`[Bump] Cooldown over. Pinging bump reminder...`);
      await discordApi(`/channels/${BUMP_CH}/messages`, "POST", {
        content: `<@&${BUMP_PING_ROLE_ID}> The Disboard bump is ready. Type \`/bump\` to push Chic Gang back up the list.`,
        allowed_mentions: { roles: [BUMP_PING_ROLE_ID] }
      });
    } catch (err) {
      log(`[Bump Reminder Error] ${err.message}`);
    }
    try { fs.unlinkSync(BUMP_STATE_FILE); } catch (e) {}
  }, Math.max(0, readyAtMs - Date.now()));
}

function restoreBumpReminder() {
  try {
    const { readyAt } = JSON.parse(fs.readFileSync(BUMP_STATE_FILE, 'utf8'));
    if (readyAt) {
      scheduleBumpReminder(readyAt);
      log(`[Bump] Restored reminder for ${new Date(readyAt).toISOString()}`);
    }
  } catch (e) {}
}

async function handleDisboardMessage(msg) {
  if (msg.author.id !== "302050872383242240") return;

  const desc = (msg.embeds && msg.embeds[0] && msg.embeds[0].description) || "";
  const isBumpSuccess = desc.includes("Bump done!") || desc.includes("Check it on DISBOARD");
  if (!isBumpSuccess) return;

  const readyAt = Date.now() + 2 * 60 * 60 * 1000;
  const unixStamp = Math.floor(readyAt / 1000);
  const bumperId = msg.interaction_metadata?.user?.id || msg.interaction?.user?.id;

  log(`[Bump] Disboard bump successful! Next bump at ${new Date(readyAt).toISOString()}`);

  try { fs.writeFileSync(BUMP_STATE_FILE, JSON.stringify({ readyAt })); } catch (e) {}
  scheduleBumpReminder(readyAt);

  await discordApi(`/channels/${BUMP_CH}/messages`, "POST", {
    embeds: [
      embed({
        title: "🚀 Bump recorded",
        description: (bumperId ? `Thanks for the bump, <@${bumperId}>.\n` : `Thanks for the bump.\n`) +
          `${DIVIDER}\n**Next bump:** <t:${unixStamp}:R> (<t:${unixStamp}:t>)\nI'll ping <@&${BUMP_PING_ROLE_ID}> when it's ready.`,
        footer: "Chic Gang · Disboard tracker"
      })
    ],
    allowed_mentions: NO_PINGS
  }).catch(e => log(`[Bump Post Err] ${e.message}`));
}

// -------------------------------------------------------------
// 24/7 Workout Radio Engine (Spotify Playlist 100-Track Looper)
// -------------------------------------------------------------
let voiceMethods = null;
let voiceConnection = null;
let audioPlayer = null;
let currentYtDlp = null;
let currentFfmpeg = null;
let currentTrackIndex = 0;
const EMBEDDED_TRACKS = [{"index":1,"title":"DANCEMAXX - Super Slowed","artist":"UMBRELLA","query":"DANCEMAXX - Super Slowed UMBRELLA audio"},{"index":2,"title":"TRIADTEKK - Super Slowed","artist":"V1AL","query":"TRIADTEKK - Super Slowed V1AL audio"},{"index":3,"title":"IEVAN POLKKA (HARDTEKK)","artist":"XI$OW, dj ai lang, HRXSTAL","query":"IEVAN POLKKA (HARDTEKK) XI$OW, dj ai lang, HRXSTAL audio"},{"index":4,"title":"GRAVEYARD (HARDTEKK) - Viral Edit","artist":"nvrrest, svdst, crombie","query":"GRAVEYARD (HARDTEKK) - Viral Edit nvrrest, svdst, crombie audio"},{"index":5,"title":"CARAMEL JESTER","artist":"UMBRELLA","query":"CARAMEL JESTER UMBRELLA audio"},{"index":6,"title":"грустный рэп","artist":"Dxvid","query":"грустный рэп Dxvid audio"},{"index":7,"title":"Bimbo Doll - Hardstyle","artist":"Wireless Location","query":"Bimbo Doll - Hardstyle Wireless Location audio"},{"index":8,"title":"True Jester","artist":"decaying, svdst","query":"True Jester decaying, svdst audio"},{"index":9,"title":"NECROPOLIS - Super Slowed","artist":"HARDWICK","query":"NECROPOLIS - Super Slowed HARDWICK audio"},{"index":10,"title":"TekkMan","artist":"Toxic Offiziell","query":"TekkMan Toxic Offiziell audio"},{"index":11,"title":"W0MP W0MP","artist":"syxxsec","query":"W0MP W0MP syxxsec audio"},{"index":12,"title":"NO BATIDÃO - Remix","artist":"ZXKAI, slxughter, Diplo, d00mscrvll","query":"NO BATIDÃO - Remix ZXKAI, slxughter, Diplo, d00mscrvll audio"},{"index":13,"title":"americano hardtekk - Slowed","artist":"DJ BEATCOIN, project alpha","query":"americano hardtekk - Slowed DJ BEATCOIN, project alpha audio"},{"index":14,"title":"BLOODPEAK (SLOWED)","artist":"prvst, REDSKXLL","query":"BLOODPEAK (SLOWED) prvst, REDSKXLL audio"},{"index":15,"title":"PSITRANCE !!! SLOWED + REVERB + BEST PART","artist":"The Dark Triad","query":"PSITRANCE !!! SLOWED + REVERB + BEST PART The Dark Triad audio"},{"index":16,"title":"WHAT THE FRICK - Super Slowed","artist":"HARDWICK","query":"WHAT THE FRICK - Super Slowed HARDWICK audio"},{"index":17,"title":"TOXIC DNA","artist":"HARDWICK","query":"TOXIC DNA HARDWICK audio"},{"index":18,"title":"NO REASON HARDTEKK","artist":"MEZZIA","query":"NO REASON HARDTEKK MEZZIA audio"},{"index":19,"title":"TEKK - SLOWED","artist":"HR","query":"TEKK - SLOWED HR audio"},{"index":20,"title":"PURE AND CONSTANT (SLOWED)","artist":"prvst, REDSKXLL","query":"PURE AND CONSTANT (SLOWED) prvst, REDSKXLL audio"},{"index":21,"title":"KEIN INTRESSE","artist":"DJ TÖRKE, HARDWICK","query":"KEIN INTRESSE DJ TÖRKE, HARDWICK audio"},{"index":22,"title":"TEKKMAXX - SLOWED","artist":"EL$E","query":"TEKKMAXX - SLOWED EL$E audio"},{"index":23,"title":"ZERO DOORS (SPED UP)","artist":"prvst, REDSKXLL","query":"ZERO DOORS (SPED UP) prvst, REDSKXLL audio"},{"index":24,"title":"IN YOUR HEART HARDTEKK","artist":"V1AL, HardTekk Mafia","query":"IN YOUR HEART HARDTEKK V1AL, HardTekk Mafia audio"},{"index":25,"title":"LOOK AT ME - SUPER SLOWED","artist":"SQL2VD","query":"LOOK AT ME - SUPER SLOWED SQL2VD audio"},{"index":26,"title":"TRILLIUM HARDTEKK","artist":"S3RL, Bearn","query":"TRILLIUM HARDTEKK S3RL, Bearn audio"},{"index":27,"title":"Close Your Eyes and Make a Wish - slowed","artist":"Royal Records","query":"Close Your Eyes and Make a Wish - slowed Royal Records audio"},{"index":28,"title":"lavender town hardtekk - Super Slowed","artist":"DJ ZYRONIX","query":"lavender town hardtekk - Super Slowed DJ ZYRONIX audio"},{"index":29,"title":"Genetixx - slowed","artist":"lxthium","query":"Genetixx - slowed lxthium audio"},{"index":30,"title":"H*RDTEKK (SLOWED)","artist":"prvst, REDSKXLL","query":"H*RDTEKK (SLOWED) prvst, REDSKXLL audio"},{"index":31,"title":"HOLY TERRA","artist":"VILLAIN ARC, Ym1kh","query":"HOLY TERRA VILLAIN ARC, Ym1kh audio"},{"index":32,"title":"army_mov - slowed","artist":"ilyhiryu","query":"army_mov - slowed ilyhiryu audio"},{"index":33,"title":"DOMER HARDTEKK (Night Mail)","artist":"Riversmelt","query":"DOMER HARDTEKK (Night Mail) Riversmelt audio"},{"index":34,"title":"joining forces ultra slow","artist":"Echorift","query":"joining forces ultra slow Echorift audio"},{"index":35,"title":"MAIN SUSPECT (SLOWED)","artist":"prvst, REDSKXLL","query":"MAIN SUSPECT (SLOWED) prvst, REDSKXLL audio"},{"index":36,"title":"劳动光荣 SYNGLÏT","artist":"Akuran","query":"劳动光荣 SYNGLÏT Akuran audio"},{"index":37,"title":"PEGA TEKK","artist":"Hardtekk, Lastfragment","query":"PEGA TEKK Hardtekk, Lastfragment audio"},{"index":38,"title":"eins zwei polizei hardtekk - Slowed","artist":"SLVSHY, project alpha, DJ BEATCOIN","query":"eins zwei polizei hardtekk - Slowed SLVSHY, project alpha, DJ BEATCOIN audio"},{"index":39,"title":"JUMPTEKK - Super Slowed","artist":"r0pss, prodByLone, DJ Twisty","query":"JUMPTEKK - Super Slowed r0pss, prodByLone, DJ Twisty audio"},{"index":40,"title":"The First Time","artist":"Replay","query":"The First Time Replay audio"},{"index":41,"title":"japanRAIii - super slowed","artist":"DJ ZUP RAlii","query":"japanRAIii - super slowed DJ ZUP RAlii audio"},{"index":42,"title":"FENIX MYSTERIO 2 (SLOWED)","artist":"XENO XID, DJ NRF","query":"FENIX MYSTERIO 2 (SLOWED) XENO XID, DJ NRF audio"},{"index":43,"title":"ДЖАМПСТАЙЛ","artist":"dj trippie flameboy","query":"ДЖАМПСТАЙЛ dj trippie flameboy audio"},{"index":44,"title":"CALITHE","artist":"XEOE, ilyhiryu, ousdei","query":"CALITHE XEOE, ilyhiryu, ousdei audio"},{"index":45,"title":"Caramelldansen - HardTekk","artist":"The Dark Triad","query":"Caramelldansen - HardTekk The Dark Triad audio"},{"index":46,"title":"NARC","artist":"prvst","query":"NARC prvst audio"},{"index":47,"title":"i don't know hardtekk","artist":"DJ BEATCOIN, project alpha, SLVSHY","query":"i don't know hardtekk DJ BEATCOIN, project alpha, SLVSHY audio"},{"index":48,"title":"На грани болевого порога - HARDTEKK","artist":"prodArvee","query":"На грани болевого порога - HARDTEKK prodArvee audio"},{"index":49,"title":"PoPiPo - Hardstyle","artist":"decaying","query":"PoPiPo - Hardstyle decaying audio"},{"index":50,"title":"Boom, Boom, Boom, Boom!! - The Dark Triad - HardTekk – Slowed Deluxe","artist":"TURBOLOVE","query":"Boom, Boom, Boom, Boom!! - The Dark Triad - HardTekk – Slowed Deluxe TURBOLOVE audio"},{"index":51,"title":"wush_2 - slowed","artist":"77yolan, ilyhiryu","query":"wush_2 - slowed 77yolan, ilyhiryu audio"},{"index":52,"title":"Knistert","artist":"Fabitekk, Bassbilanz","query":"Knistert Fabitekk, Bassbilanz audio"},{"index":53,"title":"angel - Slowed","artist":"juno","query":"angel - Slowed juno audio"},{"index":54,"title":"TOMINO'S HELL","artist":"SQL2VD","query":"TOMINO'S HELL SQL2VD audio"},{"index":55,"title":"DISKO TEKK - SLOWED","artist":"Hxlkart","query":"DISKO TEKK - SLOWED Hxlkart audio"},{"index":56,"title":"THE END","artist":"SQL2VD","query":"THE END SQL2VD audio"},{"index":57,"title":"Bomber (Super Slowed)","artist":"Hardtekk, Lastfragment","query":"Bomber (Super Slowed) Hardtekk, Lastfragment audio"},{"index":58,"title":"ANGEL JUMPSTYLE (Ultra Slowed)","artist":"HUSSVRX","query":"ANGEL JUMPSTYLE (Ultra Slowed) HUSSVRX audio"},{"index":59,"title":"Silent Hill (Slowed)","artist":"✧BRAINDAAMAGE✧","query":"Silent Hill (Slowed) ✧BRAINDAAMAGE✧ audio"},{"index":60,"title":"Грустный реп","artist":"Lida, Tenderlybae","query":"Грустный реп Lida, Tenderlybae audio"},{"index":61,"title":"LOBOTOMY ALT - Slowed","artist":"ceZk","query":"LOBOTOMY ALT - Slowed ceZk audio"},{"index":62,"title":"ƎSCAPE - Slowed","artist":"syxxsec","query":"ƎSCAPE - Slowed syxxsec audio"},{"index":63,"title":"Trochę przeszłości trochę nowości ale w dobrej prędkości","artist":"HoNoTo","query":"Trochę przeszłości trochę nowości ale w dobrej prędkości HoNoTo audio"},{"index":64,"title":"kurayami no naka - Super Slowed","artist":"DJ UNIVXRSEL","query":"kurayami no naka - Super Slowed DJ UNIVXRSEL audio"},{"index":65,"title":"unpledged alliance","artist":"crxw","query":"unpledged alliance crxw audio"},{"index":66,"title":"PSL 10","artist":"VLAXXE, Polaris","query":"PSL 10 VLAXXE, Polaris audio"},{"index":67,"title":"ghosti_33 (ULTRA SLOWED + REVERB)","artist":"home4circus","query":"ghosti_33 (ULTRA SLOWED + REVERB) home4circus audio"},{"index":68,"title":"NUMBER HARDTEKK","artist":"SLVSHY, DJ BEATCOIN, project alpha","query":"NUMBER HARDTEKK SLVSHY, DJ BEATCOIN, project alpha audio"},{"index":69,"title":"Revenge - Slowed","artist":"PHANTANONIK","query":"Revenge - Slowed PHANTANONIK audio"},{"index":70,"title":"BRUTAL - SLOWED","artist":"XEOE, HR","query":"BRUTAL - SLOWED XEOE, HR audio"},{"index":71,"title":"I DON'T KNOW - SLOWED","artist":"DJ SARKE","query":"I DON'T KNOW - SLOWED DJ SARKE audio"},{"index":72,"title":"worldwide crisis best part (bass boosted) - super slowed","artist":"velours","query":"worldwide crisis best part (bass boosted) - super slowed velours audio"},{"index":73,"title":"Till the end HardTekk","artist":"xReax","query":"Till the end HardTekk xReax audio"},{"index":74,"title":"Jumpergeist","artist":"PINKY SMASH","query":"Jumpergeist PINKY SMASH audio"},{"index":75,"title":"HALLUCINATION - Slowed","artist":"HUSSVRX, $werve","query":"HALLUCINATION - Slowed HUSSVRX, $werve audio"},{"index":76,"title":"GALLOWDANCE","artist":"HARDSTYLE DEMON","query":"GALLOWDANCE HARDSTYLE DEMON audio"},{"index":77,"title":"PULSE - Slowed","artist":"eiby","query":"PULSE - Slowed eiby audio"},{"index":78,"title":"seXXXkapkan","artist":"dj trippie flameboy","query":"seXXXkapkan dj trippie flameboy audio"},{"index":79,"title":"✻H+3+ЯД✻7luCJIo0T6... (Slowed + Reverb)","artist":"vyrval","query":"✻H+3+ЯД✻7luCJIo0T6... (Slowed + Reverb) vyrval audio"},{"index":80,"title":"mmm00nm0thz","artist":"saraunh0ly","query":"mmm00nm0thz saraunh0ly audio"},{"index":81,"title":"Blue Fun Pattern 2 - Slowed + Bass Boosted","artist":"Cortex_Sound","query":"Blue Fun Pattern 2 - Slowed + Bass Boosted Cortex_Sound audio"},{"index":82,"title":"Montagem Effeminatio Molitia 2 - Hardstyle Ultra Slowed","artist":"DJ Ikeraus, DJ Kai 01, Mc Galaxia, Mc Vuk Vuk","query":"Montagem Effeminatio Molitia 2 - Hardstyle Ultra Slowed DJ Ikeraus, DJ Kai 01, Mc Galaxia, Mc Vuk Vuk audio"},{"index":83,"title":"NARCISSISM - SLOWED","artist":"SQL2VD","query":"NARCISSISM - SLOWED SQL2VD audio"},{"index":84,"title":"RUN - Ultra Slowed","artist":"N!GHTvisiøn","query":"RUN - Ultra Slowed N!GHTvisiøn audio"},{"index":85,"title":"BLACK KNIGHT (HARDTEKK) - ULTRA SLOWED","artist":"GXNRC","query":"BLACK KNIGHT (HARDTEKK) - ULTRA SLOWED GXNRC audio"},{"index":86,"title":"Triad of Power","artist":"DJ SARKE","query":"Triad of Power DJ SARKE audio"},{"index":87,"title":"HASS - SLOWED","artist":"ilycano","query":"HASS - SLOWED ilycano audio"},{"index":88,"title":"Divine Machinery","artist":"calcium","query":"Divine Machinery calcium audio"},{"index":89,"title":"VICIOUS - Super Slowed","artist":"SCRVZVY, P4B","query":"VICIOUS - Super Slowed SCRVZVY, P4B audio"},{"index":90,"title":"The Ascent","artist":"Deaf Squad, MENE","query":"The Ascent Deaf Squad, MENE audio"},{"index":91,"title":"MEMORIES - Slowed","artist":"HUSSVRX","query":"MEMORIES - Slowed HUSSVRX audio"},{"index":92,"title":"INTERVENTION - super slowed","artist":"YXMI","query":"INTERVENTION - super slowed YXMI audio"},{"index":93,"title":"Nuc_Bootleg (Slowed)","artist":"hydr4z","query":"Nuc_Bootleg (Slowed) hydr4z audio"},{"index":94,"title":"More and More (Slowed)","artist":"khxznq, ciaffa","query":"More and More (Slowed) khxznq, ciaffa audio"},{"index":95,"title":"before every load hardcore slowed","artist":"Six Dior","query":"before every load hardcore slowed Six Dior audio"},{"index":96,"title":"NARCISSISM - SUPER SLOWED","artist":"SQL2VD","query":"NARCISSISM - SUPER SLOWED SQL2VD audio"},{"index":97,"title":"the bay harbor butcher","artist":"KCHASER","query":"the bay harbor butcher KCHASER audio"},{"index":98,"title":"彼女が12-14年間自分を切","artist":"Rory in early 20s","query":"彼女が12-14年間自分を切 Rory in early 20s audio"},{"index":99,"title":"Red Armor - Slowed","artist":"fam0uz","query":"Red Armor - Slowed fam0uz audio"},{"index":100,"title":"DEATH TRIAL - Slowed","artist":"ICHIRO","query":"DEATH TRIAL - Slowed ICHIRO audio"}];
let TRACKS = [];

try {
  if (fs.existsSync(PLAYLIST_FILE)) {
    TRACKS = JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8'));
    log(`[Workout Radio] Loaded ${TRACKS.length} tracks from file "${PLAYLIST_FILE}".`);
  }
} catch (e) {
  log(`[Workout Radio] File read notice: ${e.message}`);
}

if (!TRACKS || TRACKS.length === 0) {
  TRACKS = EMBEDDED_TRACKS;
  log(`[Workout Radio] Loaded ${TRACKS.length} tracks from built-in Spotify Hardstyle catalog.`);
}

function startWorkoutRadio() {
  log(`[Workout Radio] Connecting to VC: ${WORKOUT_RADIO_VC}...`);

  const adapterCreator = (methods) => {
    voiceMethods = methods;
    return {
      sendPayload(data) {
        if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.send(JSON.stringify(data));
          return true;
        }
        return false;
      },
      destroy() {
        voiceMethods = null;
      }
    };
  };

  try {
    if (voiceConnection) {
      try { voiceConnection.destroy(); } catch (e) {}
      voiceConnection = null;
    }

    voiceConnection = joinVoiceChannel({
      channelId: WORKOUT_RADIO_VC,
      guildId: GUILD_ID,
      adapterCreator,
      selfMute: false,
      selfDeaf: false
    });

    voiceConnection.on(VoiceConnectionStatus.Signalling, () => {
      log(`[Workout Radio] Voice state: Signalling`);
    });

    voiceConnection.on(VoiceConnectionStatus.Connecting, () => {
      log(`[Workout Radio] Voice state: Connecting`);
    });

    voiceConnection.on(VoiceConnectionStatus.Ready, () => {
      log(`[Workout Radio] Voice connection READY in VC! Initializing player...`);
      initPlayer();
      if (voiceConnection && audioPlayer) {
        voiceConnection.subscribe(audioPlayer);
      }
      playNextTrack();
    });

    voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      log(`[Workout Radio] Voice disconnected. Reconnecting in 3s...`);
      setTimeout(() => {
        try {
          if (voiceConnection) voiceConnection.rejoin();
          else startWorkoutRadio();
        } catch (e) {
          startWorkoutRadio();
        }
      }, 3000);
    });

    voiceConnection.on(VoiceConnectionStatus.Destroyed, () => {
      log(`[Workout Radio] Voice connection destroyed. Re-initializing in 5s...`);
      setTimeout(startWorkoutRadio, 5000);
    });

    voiceConnection.on('error', (err) => {
      log(`[Workout Radio Connection Error] ${err.message}`);
    });
  } catch (err) {
    log(`[Workout Radio Error] ${err.message}`);
  }
}

// 15-second autonomous voice health watchdog
setInterval(() => {
  if (!gatewayWs || gatewayWs.readyState !== WebSocket.OPEN) return;
  const status = voiceConnection?.state?.status;
  if (!voiceConnection || status === VoiceConnectionStatus.Disconnected || status === VoiceConnectionStatus.Destroyed) {
    log(`[Workout Radio Watchdog] Inactive voice state (${status || 'None'}). Auto-rejoining VC...`);
    startWorkoutRadio();
  }
}, 15000);

let trackStartTime = 0;

function updateBotPresence(title, artist) {
  if (!gatewayWs || gatewayWs.readyState !== WebSocket.OPEN) return;
  try {
    const songName = title ? `${title} • ${artist}`.slice(0, 100) : "24/7 Workout Radio";
    gatewayWs.send(JSON.stringify({
      op: 3,
      d: {
        since: null,
        activities: [
          {
            name: songName,
            type: 2, // Listening to
            state: "⚡ Chic Gang • 24/7 Gym Radio"
          }
        ],
        status: "online",
        afk: false
      }
    }));
  } catch (e) {}
}

function initPlayer() {
  if (audioPlayer) return;

  audioPlayer = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  audioPlayer.on(AudioPlayerStatus.Playing, () => {
    trackStartTime = Date.now();
    const t = TRACKS[currentTrackIndex] || { title: "Track", artist: "Artist", index: currentTrackIndex + 1 };
    log(`[Workout Radio] Now Playing [${t.index}/${TRACKS.length}]: "${t.title}" by ${t.artist} in Workout Radio!`);
    updateBotPresence(t.title, t.artist);
  });

  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    const elapsed = Date.now() - trackStartTime;
    const t = TRACKS[currentTrackIndex];
    if (elapsed < 4000) {
      if (t && !t.useYtFallback) {
        log(`[Workout Radio] Track finished quickly (${elapsed}ms). Retrying with YouTube Audio fallback in 2s...`);
        t.useYtFallback = true;
        setTimeout(playNextTrack, 2000);
        return;
      }
      log(`[Workout Radio] Track failed on both engines (${elapsed}ms). Advancing to next track...`);
      if (t) t.useYtFallback = false;
      currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
      setTimeout(playNextTrack, 2500);
    } else {
      if (t) t.useYtFallback = false;
      log(`[Workout Radio] Track finished (${Math.round(elapsed / 1000)}s). Advancing to next track...`);
      currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
      playNextTrack();
    }
  });

  audioPlayer.on("error", (err) => {
    log(`[Workout Radio Player Err] ${err.message}`);
    const t = TRACKS[currentTrackIndex];
    if (t && !t.useYtFallback) {
      t.useYtFallback = true;
      setTimeout(playNextTrack, 2000);
      return;
    }
    if (t) t.useYtFallback = false;
    currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
    setTimeout(playNextTrack, 3000);
  });
}

async function playNextTrack() {
  if (!TRACKS || TRACKS.length === 0) return;

  const t = TRACKS[currentTrackIndex];
  log(`[Workout Radio] Resolving Track ${t.index}/${TRACKS.length}: "${t.title}" by ${t.artist}...`);

  if (currentYtDlp) {
    try { currentYtDlp.kill('SIGKILL'); } catch (e) {}
    currentYtDlp = null;
  }
  if (currentFfmpeg) {
    try { currentFfmpeg.kill('SIGKILL'); } catch (e) {}
    currentFfmpeg = null;
  }

  const ytdlpBin = await getYtDlpPath();
  const ffmpegBin = await getFfmpegPath();

  const cleanTitle = (t.title || '')
    .replace(/\s*-\s*Super Slowed/i, '')
    .replace(/\s*-\s*Viral Edit/i, '')
    .replace(/\s*-\s*Slowed/i, '')
    .replace(/\s*-\s*Remix/i, '')
    .trim();
  const cleanArtist = (t.artist || '').split(',')[0].trim();
  const query = t.useYtFallback
    ? `ytsearch1:${cleanTitle} ${cleanArtist} audio`
    : `scsearch1:${cleanTitle} ${cleanArtist}`;

  log(`[Workout Radio] Streaming "${t.title}" via ${t.useYtFallback ? 'YouTube Audio' : 'SoundCloud'} pipe...`);

  try {
    currentYtDlp = spawn(ytdlpBin, [
      '--no-warnings',
      '--match-filter', '!is_drm',
      '--buffer-size', '64K',
      '-o', '-',
      '-f', 'ba/b',
      query
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    currentFfmpeg = spawn(ffmpegBin, [
      '-analyzeduration', '0',
      '-probesize', '32k',
      '-i', 'pipe:0',
      '-af', 'volume=0.85,alimiter=limit=0.95',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-vbr', 'on',
      '-compression_level', '10',
      '-ar', '48000',
      '-ac', '2',
      '-f', 'ogg',
      'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    currentYtDlp.stdout.on('error', () => {});
    currentFfmpeg.stdin.on('error', () => {});

    currentYtDlp.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg.includes('ERROR') || msg.includes('WARNING')) {
        log(`[yt-dlp] ${msg}`);
      }
    });

    currentFfmpeg.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg.includes('Error') || msg.includes('failed')) {
        log(`[FFmpeg] ${msg}`);
      }
    });

    currentYtDlp.stdout.pipe(currentFfmpeg.stdin);

    currentYtDlp.on('error', (err) => {
      log(`[yt-dlp Err] ${err.message}`);
    });

    currentFfmpeg.on('error', (ferr) => {
      log(`[FFmpeg Err] ${ferr.message}`);
    });

    const resource = createAudioResource(currentFfmpeg.stdout, { inputType: StreamType.OggOpus });
    if (resource.playStream) {
      resource.playStream.on("error", (sErr) => log(`[Workout Radio Stream Err] ${sErr.message}`));
    }
    audioPlayer.play(resource);
    if (voiceConnection) {
      voiceConnection.subscribe(audioPlayer);
    }
  } catch (ferr) {
    log(`[Workout Radio Catch Err] ${ferr.message}`);
    currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
    setTimeout(playNextTrack, 2500);
  }
}

// -------------------------------------------------------------
// Dank Memer 24/7 Floor Alert Reminders
// -------------------------------------------------------------
let dankInterval = null;

function initDankMemerReminders() {
  if (dankInterval) clearInterval(dankInterval);
  dankInterval = setInterval(async () => {
    try {
      // Skip if nobody has posted since the last reminder, so reminders never stack up in a quiet channel
      const [last] = await discordApi(`/channels/${DANK_MEMER_CH}/messages?limit=1`);
      if (last?.author?.id === BOT_ID) return;

      await discordApi(`/channels/${DANK_MEMER_CH}/messages`, "POST", {
        embeds: [
          embed({
            title: "🐸 Dank Memer cooldowns are up",
            description: "`/work` · `/beg` · `/hunt` · `/fish` · `/daily` if you haven't yet\n" +
              `${DIVIDER}\nFinish with \`/deposit all\` so nobody can rob you.`,
            footer: "Chic Gang · Reminder every 45 min while the channel is active"
          })
        ]
      });
      log(`[Dank Memer] Periodic grind reminder dispatched to #${DANK_MEMER_CH}`);
    } catch (e) {}
  }, 45 * 60 * 1000);
}

// -------------------------------------------------------------
// Automated 24/7 Gym Meme Drops
// -------------------------------------------------------------
let memeInterval = null;
const postedMemeUrls = new Set();
const MEME_INTERVAL_MS = 60 * 60 * 1000;

async function postAutomatedMemeDrop() {
  try {
    const subreddits = ['GymMemes', 'fitnessmemes', 'wholesomegymmemes'];
    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];
    const res = await fetch(`https://meme-api.com/gimme/${sub}/5`);
    if (!res.ok) return;
    const data = await res.json();
    const memes = (data.memes || []).filter(m => m.url && !m.nsfw && !m.spoiler && !postedMemeUrls.has(m.url));
    if (memes.length === 0) return;

    const meme = memes[0];
    postedMemeUrls.add(meme.url);
    if (postedMemeUrls.size > 200) {
      const first = postedMemeUrls.values().next().value;
      postedMemeUrls.delete(first);
    }

    const card = embed({
      title: (meme.title || "Gym meme").slice(0, 256),
      footer: `r/${meme.subreddit} · 👍 ${(meme.ups || 0).toLocaleString()}`
    });
    card.url = meme.postLink;
    card.image = { url: meme.url };

    const msg = await discordApi(`/channels/${MEMES_CH}/messages`, "POST", {
      embeds: [card],
      allowed_mentions: NO_PINGS
    });

    log(`[Meme Drop] Posted meme "${meme.title}" to #${MEMES_CH} (ID: ${msg.id})`);
    reactEmoji(MEMES_CH, msg.id, "😂");
  } catch (err) {
    log(`[Meme Drop Err] ${err.message}`);
  }
}

async function initAutomatedMemeDrops() {
  if (memeInterval) clearInterval(memeInterval);

  // Read recent drops so a restart neither reposts old memes nor posts early
  let wait = 15000;
  try {
    const recent = await discordApi(`/channels/${MEMES_CH}/messages?limit=50`);
    const ours = (recent || []).filter(m => m.author?.id === BOT_ID && m.embeds?.[0]?.image?.url);
    for (const m of ours) postedMemeUrls.add(m.embeds[0].image.url);
    if (ours[0]) {
      wait = Math.max(15000, Date.parse(ours[0].timestamp) + MEME_INTERVAL_MS - Date.now());
    }
  } catch (e) {}

  log(`[Meme Drop] Next drop in ${Math.round(wait / 60000)} min`);
  setTimeout(() => {
    postAutomatedMemeDrop();
    memeInterval = setInterval(postAutomatedMemeDrop, MEME_INTERVAL_MS);
  }, wait);
}

// -------------------------------------------------------------
// Interactive UI Handler (buttons, menus, modals)
// -------------------------------------------------------------
// One rulebook, used by both the section picker and the full-rules button
const RULE_SECTIONS = {
  rule_sec_1: {
    title: "🔒 Section I: Safety",
    color: COLORS.alert,
    body:
      "**1. No NSFW or gore.** Not in channels, avatars or names. Permanent ban.\n" +
      "**2. No harassment, slurs or doxxing.** Zero tolerance for personal attacks, threats or sharing private info.\n" +
      "**3. No scams or malicious links.** Unapproved ads, pirated software and token grabbers mean a permanent ban."
  },
  rule_sec_2: {
    title: "⚡ Section II: Gym floor etiquette",
    color: COLORS.gold,
    body:
      "**1. Critique the form, not the person.** Keep feedback constructive. No ego-lift shaming.\n" +
      "**2. No dangerous advice.** No PED cycles, unsafe medical regimens or extreme dehydration cuts.\n" +
      "**3. Keep it honest.** No fake PRs or edited lift numbers.\n" +
      `**4. Use the right channel.** Memes in <#${MEMES_CH}>, bot commands in <#${BOT_CORNER_CH}>, training talk in <#${FITNESS_TALK_CH}>.`
  },
  rule_sec_3: {
    title: "🛡️ Section III: Consequences",
    color: COLORS.bot,
    body:
      "**1st offense:** Warning, logged on your record.\n" +
      "**2nd offense:** 24-hour timeout.\n" +
      "**3rd offense:** 7-day ban.\n" +
      "**Severe offenses** (NSFW, doxxing, scams, exploits, hate speech): permanent ban, no warning."
  },
  rule_sec_report: {
    title: "🎫 Reporting a problem",
    color: COLORS.info,
    body: `Use the **Open Support Ticket** button, or go to <#${CONTACT_CH}>. A private channel opens that only you and staff can see.`
  }
};

const ephemeral = (content) => ({ type: 4, data: { content, flags: 64, allowed_mentions: NO_PINGS } });
const ephemeralEmbeds = (embeds) => ({ type: 4, data: { embeds, flags: 64 } });

async function handleInteraction(interaction) {
  const { id, token, data, member, user: directUser, type, channel_id } = interaction;
  const user = member?.user || directUser;
  const userId = user?.id;

  if (type === 3) {
    const customId = data.custom_id;

    if (customId === "verify_btn") {
      log(`[Interaction] Processing verify_btn for @${user?.username} (${userId})`);
      if ((member?.roles || []).includes(VERIFIED_ROLE_ID)) {
        await respondInteraction(id, token, ephemeral(`You're already verified. Say hi in <#${GENERAL_CH}>.`));
        return;
      }

      // Defer first so slow role assignment can't time out the button
      await respondInteraction(id, token, { type: 5, data: { flags: 64 } });
      try {
        await discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${VERIFIED_ROLE_ID}`, "PUT");
        await discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${MEMBER_ROLE_ID}`, "PUT");
        await editOriginal(token, {
          embeds: [
            embed({
              title: "✅ You're in",
              description:
                `Welcome to Chic Gang, <@${userId}>. The full server is unlocked.\n${DIVIDER}\n` +
                `**Next:** pick your training style in <#${SELF_ROLES_CH}> and say hi in <#${GENERAL_CH}>.`,
              image: GIF("verified"),
              footer: "Chic Gang · Only you can see this",
              timestamp: false
            })
          ],
          allowed_mentions: NO_PINGS
        });
      } catch (err) {
        log(`[Verify Role Assignment Err] ${err.message}`);
        await editOriginal(token, {
          content: `Verification didn't go through on our side. Try again in a minute. If it keeps failing, open a ticket in <#${CONTACT_CH}>.`
        });
      }
      return;
    }

    if (customId.startsWith("role_")) {
      const roleId = customId.replace("role_", "");
      const roleName = ALLOWED_SELF_ROLES[roleId];
      if (!roleName) {
        await respondInteraction(id, token, ephemeral("That role can't be self-assigned."));
        return;
      }

      const hasRole = (member?.roles || []).includes(roleId);
      log(`[Interaction] Toggling role ${roleName} (${roleId}) for @${user?.username}: hasRole=${hasRole}`);

      await respondInteraction(id, token, ephemeral(hasRole ? `Removed **${roleName}**.` : `Added **${roleName}**.`));

      discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, hasRole ? "DELETE" : "PUT")
        .catch(err => log(`[Role Toggle Err] ${err.message}`));
      return;
    }

    if (customId === "select_roles") {
      const selected = data.values || [];
      const currentRoles = member?.roles || [];
      const added = [];
      const removed = [];

      for (const [roleId, roleName] of Object.entries(ALLOWED_SELF_ROLES)) {
        const wants = selected.includes(roleId);
        const has = currentRoles.includes(roleId);
        if (wants && !has) {
          added.push(roleName);
          discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, "PUT").catch(() => {});
        } else if (!wants && has) {
          removed.push(roleName);
          discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, "DELETE").catch(() => {});
        }
      }

      let summary = "## Roles updated\n";
      if (added.length > 0) summary += `**Added:** ${added.join(", ")}\n`;
      if (removed.length > 0) summary += `**Removed:** ${removed.join(", ")}\n`;
      if (added.length === 0 && removed.length === 0) summary = "No changes. You already have that setup.";

      await respondInteraction(id, token, ephemeral(summary));
      return;
    }

    if (customId === "view_ranks_guide") {
      await respondInteraction(id, token, ephemeralEmbeds([
        embed({
          title: "🎖️ Athlete ranks",
          description:
            "Ranks come from your training in **Chic Builder**. Log your sessions, keep progressing, and your rank climbs.\n" +
            `${DIVIDER}\n` +
            "🛡️ **Novice Lifter** · Levels 1–4\n" +
            "⚔️ **Iron Apprentice** · Levels 5–9\n" +
            "⚡ **Gym Regular** · Levels 10–19\n" +
            "🔥 **Heavy Lifter** · Levels 20–34\n" +
            "🔱 **Elite Athlete** · Levels 35–49\n" +
            "👑 **Greek God** · Levels 50–74\n" +
            "🌌 **Chic Titan** · Levels 75–99\n" +
            "💎 **Spotter Deity** · Level 100+\n" +
            `${DIVIDER}\n` +
            "Server chat levels are separate. Check yours with `!rank`.",
          color: COLORS.gold,
          footer: "Chic Gang · Only you can see this",
          timestamp: false
        })
      ]));
      return;
    }

    if (customId === "view_staff_hierarchy") {
      await respondInteraction(id, token, ephemeralEmbeds([
        embed({
          title: "👑 Who runs Chic Gang",
          description:
            "👑 **Founders** · Server direction, the Chic Builder product and engineering.\n" +
            "🛡️ **Moderators** · Keep the server safe and enforce the rules.\n" +
            "✅ **Verified Lifters** · Verified members of the community.\n" +
            `${DIVIDER}\n` +
            `Need staff? Open a ticket in <#${CONTACT_CH}>.`,
          color: COLORS.alert,
          footer: "Chic Gang · Only you can see this",
          timestamp: false
        })
      ]));
      return;
    }

    if (customId === "select_rules_section") {
      const section = RULE_SECTIONS[data.values?.[0]] || RULE_SECTIONS.rule_sec_1;
      await respondInteraction(id, token, ephemeralEmbeds([
        embed({
          title: section.title,
          description: section.body,
          color: section.color,
          footer: "Chic Gang rules · Only you can see this",
          timestamp: false
        })
      ]));
      return;
    }

    if (customId === "view_full_rules") {
      const sections = ["rule_sec_1", "rule_sec_2", "rule_sec_3"].map(k => RULE_SECTIONS[k]);
      await respondInteraction(id, token, ephemeralEmbeds(
        sections.map((s, i) => embed({
          title: s.title,
          description: s.body,
          color: s.color,
          footer: i === sections.length - 1 ? "Chic Gang rules · Only you can see this" : null,
          timestamp: false
        }))
      ));
      return;
    }

    if (customId === "open_ticket") {
      await respondInteraction(id, token, {
        type: 9,
        data: {
          title: "Open a support ticket",
          custom_id: "ticket_modal",
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "ticket_topic",
                  label: "What do you need help with?",
                  style: 1,
                  min_length: 3,
                  max_length: 100,
                  placeholder: "e.g. Bug report, Play Store testing invite, app feedback",
                  required: true
                }
              ]
            },
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "ticket_details",
                  label: "Details",
                  style: 2,
                  min_length: 10,
                  max_length: 1000,
                  placeholder: "Phone model, Android version, steps to reproduce, anything that helps.",
                  required: true
                }
              ]
            }
          ]
        }
      });
      return;
    }

    if (customId === "close_ticket") {
      const channelName = interaction.channel?.name;
      if (channelName && !channelName.startsWith("ticket-")) {
        await respondInteraction(id, token, ephemeral("This button only works inside a ticket."));
        return;
      }

      await respondInteraction(id, token, {
        type: 4,
        data: {
          content: `🔒 Ticket closed by <@${userId}>. This channel will be deleted in 10 seconds.`,
          allowed_mentions: NO_PINGS
        }
      });

      await postServerLog(
        "Ticket closed",
        `**Ticket:** \`${channelName || channel_id}\`\n**Closed by:** <@${userId}>`,
        COLORS.info
      );

      setTimeout(async () => {
        try {
          await discordApi(`/channels/${channel_id}`, "DELETE");
        } catch (e) {}
      }, 10000);
      return;
    }
  }

  if (type === 5) {
    if (data.custom_id === "ticket_modal") {
      const topic = data.components[0]?.components[0]?.value || "General support";
      const details = data.components[1]?.components[0]?.value || "No details provided.";

      await respondInteraction(id, token, { type: 5, data: { flags: 64 } });

      try {
        const sanitizedName = user?.username ? user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) : "user";
        const ticketNum = Math.floor(1000 + Math.random() * 9000);
        const newTicketChan = await discordApi(`/guilds/${GUILD_ID}/channels`, "POST", {
          name: `ticket-${sanitizedName}-${ticketNum}`,
          type: 0,
          parent_id: TICKETS_CAT_ID,
          topic: `Ticket opened by ${user?.username} (${userId}) | Topic: ${topic}`,
          permission_overwrites: [
            { id: GUILD_ID, type: 0, allow: "0", deny: "1024" },
            { id: MEMBER_ROLE_ID, type: 0, allow: "0", deny: "1024" },
            { id: userId, type: 1, allow: "68608", deny: "0" },
            { id: BOT_ID, type: 1, allow: "68608", deny: "0" },
            { id: CO_FOUNDER_ROLE_ID, type: 0, allow: "68608", deny: "0" },
            { id: LEAD_ADMIN_ROLE_ID, type: 0, allow: "68608", deny: "0" },
            { id: MOD_ROLE_ID, type: 0, allow: "68608", deny: "0" }
          ]
        });

        // Only the opener and the mod role get pinged; text typed into the form can never ping anyone
        await discordApi(`/channels/${newTicketChan.id}/messages`, "POST", {
          content: `<@${userId}> <@&${MOD_ROLE_ID}>`,
          embeds: [
            embed({
              title: `🎫 ${topic}`.slice(0, 256),
              description:
                `Opened by <@${userId}>. A staff member will reply here soon, so no need to ping anyone again.\n` +
                `${DIVIDER}\n### Details\n${details}`,
              color: COLORS.info,
              footer: `Chic Gang · #${newTicketChan.name}`
            })
          ],
          components: [
            {
              type: 1,
              components: [
                { type: 2, custom_id: "close_ticket", label: "Close Ticket", emoji: { name: "🔒" }, style: 4 }
              ]
            }
          ],
          allowed_mentions: { users: [userId], roles: [MOD_ROLE_ID] }
        });

        await editOriginal(token, { content: `Your ticket is open: <#${newTicketChan.id}>` });
        await postServerLog(
          "Ticket opened",
          `**Ticket:** <#${newTicketChan.id}>\n**Opened by:** <@${userId}>\n**Topic:** ${topic}`,
          COLORS.info
        );
      } catch (err) {
        log(`[Create Ticket Err] ${err.message}`);
        await editOriginal(token, { content: `Couldn't create your ticket. Try again, or message a moderator directly.` });
      }
      return;
    }
  }

  if (type === 2) {
    return respondInteraction(id, token, ephemeral(
      `That command isn't available here yet. Type \`!help\` in <#${BOT_CORNER_CH}> to see what I can do.`
    ));
  }
}

// -------------------------------------------------------------
// Panel Refresh: restyles the bot's own panel posts on boot. Buttons and menus are left untouched.
// -------------------------------------------------------------
const PANEL_CHANNELS = [...new Set([VERIFY_CH, START_HERE_CH, ROLES_CH, RULES_CH, SELF_ROLES_CH, CONTACT_CH])];

const PANELS = {
  verify: () => [
    embed({
      title: "⚡ Verify to enter Chic Gang",
      description:
        "Tap **Verify** below to unlock the full server. It's instant.\n" +
        `${DIVIDER}\n` +
        "### By verifying, you agree to\n" +
        "**1.** Keep it respectful. Critique the form, not the person.\n" +
        "**2.** Keep it safe for work, in chat and on your profile.\n" +
        `**3.** Follow the rules in <#${RULES_CH}>.`,
      image: GIF("welcome"),
      footer: "Chic Gang · Verification",
      timestamp: false
    })
  ],
  rules: () => [
    embed({
      title: "📜 Chic Gang rules",
      description:
        "Short version below. Pick a section from the menu to read it in full.\n" +
        `${DIVIDER}\n` +
        "**🔒 Safety** · No NSFW, harassment, doxxing or scams.\n" +
        "**⚡ Gym floor** · Critique the form, not the person. No dangerous advice. Keep your lifts honest.\n" +
        "**🛡️ Consequences** · Warning, then 24-hour timeout, then 7-day ban. Severe offenses mean a permanent ban, no warning.\n" +
        `${DIVIDER}\n` +
        "Something wrong? Open a ticket and only staff will see it.",
      color: COLORS.alert,
      footer: "Chic Gang · Rules",
      timestamp: false
    })
  ],
  roles: () => [
    embed({
      title: "🏋️ Pick your roles",
      description:
        "Choose what fits you. Pick again anytime to change your setup.\n" +
        `${DIVIDER}\n` +
        Object.values(ALLOWED_SELF_ROLES).map(n => `**${n}**`).join(" · ") +
        `\n${DIVIDER}\n` +
        "Ping roles are opt-in. You only get pinged for what you pick.",
      footer: "Chic Gang · Self roles",
      timestamp: false
    })
  ],
  ticket: () => [
    embed({
      title: "🎫 Contact staff",
      description:
        "Tap **Open Support Ticket** to start a private channel with the team. Only you and staff can see it.\n" +
        `${DIVIDER}\n` +
        "### Good reasons to open one\n" +
        "**·** Bugs or feedback for Chic Builder\n" +
        "**·** Play Store testing invites\n" +
        "**·** Reporting a member or a rule break\n" +
        "**·** Anything you'd rather not post publicly",
      color: COLORS.info,
      footer: "Chic Gang · Support",
      timestamp: false
    })
  ],
  start: () => [
    embed({
      title: "👋 Start here",
      description:
        "New to Chic Gang? Here's how the server works.\n" +
        `${DIVIDER}\n` +
        `**1.** Verify in <#${VERIFY_CH}>.\n` +
        `**2.** Read the rules in <#${RULES_CH}>.\n` +
        `**3.** Pick your roles in <#${SELF_ROLES_CH}>.\n` +
        `**4.** Talk training in <#${FITNESS_TALK_CH}> and post your wins in <#${WINS_CH}>.\n` +
        `${DIVIDER}\n` +
        "Use the buttons below to see the athlete ranks and who runs the server.",
      image: GIF("welcome"),
      footer: "Chic Gang · Start here",
      timestamp: false
    })
  ]
};

function collectCustomIds(components, out = []) {
  for (const c of components || []) {
    if (c.custom_id) out.push(c.custom_id);
    if (c.components) collectCustomIds(c.components, out);
  }
  return out;
}

function panelFor(ids) {
  if (ids.includes("verify_btn")) return "verify";
  if (ids.includes("select_rules_section") || ids.includes("view_full_rules")) return "rules";
  if (ids.includes("select_roles") || ids.some(id => id.startsWith("role_"))) return "roles";
  if (ids.includes("view_ranks_guide") || ids.includes("view_staff_hierarchy")) return "start";
  if (ids.includes("open_ticket")) return "ticket";
  return null;
}

async function refreshPanels() {
  for (const chId of PANEL_CHANNELS) {
    let msgs = [];
    try {
      msgs = await discordApi(`/channels/${chId}/messages?limit=50`);
    } catch (e) {
      log(`[Panels] Could not read #${chId}: ${e.message}`);
      continue;
    }

    for (const m of msgs || []) {
      if (m.author?.id !== BOT_ID || !m.components?.length) continue;
      const kind = panelFor(collectCustomIds(m.components));
      if (!kind) continue;

      const fresh = PANELS[kind]();
      const upToDate = !m.content &&
        m.embeds?.length === fresh.length &&
        m.embeds.every((e, i) => e.title === fresh[i].title && e.description === fresh[i].description);
      if (upToDate) continue;

      try {
        await discordApi(`/channels/${chId}/messages/${m.id}`, "PATCH", {
          content: "",
          embeds: fresh,
          allowed_mentions: NO_PINGS
        });
        log(`[Panels] Restyled ${kind} panel ${m.id} in #${chId}`);
      } catch (e) {
        log(`[Panels] Could not edit ${kind} panel ${m.id}: ${e.message}`);
      }
    }
  }
}

// -------------------------------------------------------------
// Gateway Connection & Event Dispatcher (Production Resume Engine)
// -------------------------------------------------------------
let gatewayWs = null;
let heartbeatTimer = null;
let lastHeartbeatAck = true;
let lastSequence = null;
let sessionId = null;
let resumeGatewayUrl = null;
let reconnectAttempts = 0;
let isReconnecting = false;
let auditInterval = null;
let enableMessageContentIntent = true;

function sendHeartbeat() {
  if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
    if (!lastHeartbeatAck) {
      log(`[Gateway] Heartbeat ACK not received before next heartbeat! Connection is dead. Terminating socket...`);
      try { gatewayWs.terminate(); } catch (e) { gatewayWs.close(4000); }
      return;
    }
    lastHeartbeatAck = false;
    gatewayWs.send(JSON.stringify({ op: 1, d: lastSequence }));
  }
}

function connectGateway() {
  if (isReconnecting) return;
  isReconnecting = true;

  const currentIntents = 1 | 128 | 512 | 1024 | (enableMessageContentIntent ? 32768 : 0);
  const targetUrl = resumeGatewayUrl || "wss://gateway.discord.gg/?v=10&encoding=json";

  log(`[Gateway] Connecting to ${targetUrl.split('?')[0]} (Intents: ${currentIntents}, Resuming: ${Boolean(sessionId && lastSequence !== null)})...`);

  try {
    if (gatewayWs) {
      try { gatewayWs.removeAllListeners(); gatewayWs.terminate(); } catch (e) {}
    }

    gatewayWs = new WebSocket(targetUrl);
    isReconnecting = false;

    gatewayWs.onopen = () => {
      log("[Gateway] WebSocket Open.");
      lastHeartbeatAck = true;
    };

    gatewayWs.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { op, d, s, t } = payload;

        if (s !== null && s !== undefined) {
          lastSequence = s;
        }

        // Opcode 10: Hello
        if (op === 10) {
          const interval = d.heartbeat_interval;
          log(`[Gateway] Received Hello. Heartbeat: ${interval}ms`);

          if (heartbeatTimer) clearInterval(heartbeatTimer);
          lastHeartbeatAck = true;
          heartbeatTimer = setInterval(sendHeartbeat, interval);

          // If we have an existing session, send Opcode 6 (RESUME)
          if (sessionId && lastSequence !== null) {
            log(`[Gateway] Attempting to RESUME session ${sessionId} at sequence ${lastSequence}...`);
            gatewayWs.send(JSON.stringify({
              op: 6,
              d: {
                token: TOKEN,
                session_id: sessionId,
                seq: lastSequence
              }
            }));
          } else {
            // Fresh IDENTIFY (Opcode 2)
            log(`[Gateway] Sending fresh IDENTIFY (Opcode 2)...`);
            gatewayWs.send(JSON.stringify({
              op: 2,
              d: {
                token: TOKEN,
                intents: currentIntents,
                properties: { os: "linux", browser: "chic-cloud", device: "chic-cloud" }
              }
            }));
          }
        }

        // Opcode 11: Heartbeat ACK
        if (op === 11) {
          lastHeartbeatAck = true;
        }

        // Opcode 1: Heartbeat requested
        if (op === 1) {
          sendHeartbeat();
        }

        // Opcode 7: Reconnect
        if (op === 7) {
          log(`[Gateway] Received Opcode 7 (Reconnect requested by Discord). Closing socket to resume...`);
          gatewayWs.close(4000);
        }

        // Opcode 9: Invalid Session
        if (op === 9) {
          const resumable = Boolean(d);
          log(`[Gateway] Received Opcode 9 (Invalid Session, resumable: ${resumable}).`);
          if (!resumable) {
            sessionId = null;
            lastSequence = null;
            resumeGatewayUrl = null;
          }
          gatewayWs.close(4000);
        }

        // Opcode 0: Dispatch
        if (op === 0) {
          if (t === "READY") {
            sessionId = d.session_id;
            resumeGatewayUrl = d.resume_gateway_url;
            reconnectAttempts = 0;
            log(`[Gateway] Bot READY as ${d.user.username}#${d.user.discriminator} (Session: ${sessionId})!`);
            startWorkoutRadio();
          }

          if (t === "RESUMED") {
            reconnectAttempts = 0;
            log(`[Gateway] Session RESUMED successfully! Zero IDENTIFY budget consumed.`);
            startWorkoutRadio();
          }

          if (t === "VOICE_SERVER_UPDATE") {
            if (voiceMethods) voiceMethods.onVoiceServerUpdate(d);
          }
          if (t === "VOICE_STATE_UPDATE") {
            if (d.user_id === BOT_ID && voiceMethods) {
              voiceMethods.onVoiceStateUpdate(d);
            }
          }

          if (t === "INTERACTION_CREATE") {
            log(`[Interaction] Received ${d.type === 3 ? 'button' : 'command'} ${d.data?.custom_id || d.data?.name} from @${d.member?.user?.username || d.user?.username}`);
            handleInteraction(d);
          }

          if (t === "GUILD_MEMBER_ADD") {
            if (d.user) {
              log(`[Gateway] GUILD_MEMBER_ADD event received for @${d.user.username}`);
              sendMemberWelcome(d.user);
            }
          }

          if (t === "MESSAGE_CREATE") {
            if (d.author?.id === "302050872383242240") {
              handleDisboardMessage(d);
            }

            if (d.type === 7 && d.author) {
              log(`[System Join] Detected Type 7 join message for @${d.author.username}`);
              sendMemberWelcome(d.author);
              return;
            }

            if (d.author && !d.author.bot) {
              await handleMessageXp(d);

              let content = d.content;
              if (!content || content.trim().length === 0) {
                try {
                  const fresh = await discordApi(`/channels/${d.channel_id}/messages/${d.id}`);
                  content = fresh.content;
                } catch (e) {}
              }
              d.content = content;
              await handleChatKeywords(d);
              if (d.channel_id === REP_COUNTER_CH) {
                await handleRepCounterMessage(d);
              }
            }
          }
        }
      } catch (err) {
        log(`[Gateway Message Err] ${err.message}`);
      }
    };

    gatewayWs.onclose = (event) => {
      isReconnecting = false;
      log(`[Gateway] Closed (code: ${event.code}, reason: ${event.reason || 'None'}).`);
      if (heartbeatTimer) clearInterval(heartbeatTimer);

      // Code 4004: Authentication failed
      if (event.code === 4004) {
        log(`[FATAL] Gateway 4004: Authentication failed! The Discord bot token is invalid or has been reset. Stopping reconnect loop.`);
        return;
      }

      // Code 4014: Disallowed intents
      if (event.code === 4014 && enableMessageContentIntent) {
        log(`[Gateway] Disallowed intent 32768 detected! Falling back to non-privileged intents...`);
        enableMessageContentIntent = false;
        setTimeout(connectGateway, 1000);
        return;
      }

      // Code 4007 (invalid seq) / 4009 (session timed out): session is gone, IDENTIFY fresh
      if (event.code === 4007 || event.code === 4009) {
        sessionId = null;
        lastSequence = null;
        resumeGatewayUrl = null;
      }

      // Codes 4010-4014: retrying cannot fix these
      if (event.code >= 4010 && event.code <= 4014) {
        log(`[FATAL] Gateway ${event.code}: Non-recoverable close (bad shard, sharding required, invalid API version or intents). Stopping reconnect loop.`);
        return;
      }

      // Exponential backoff
      const delay = Math.min(5000 * Math.pow(1.4, reconnectAttempts), 45000);
      reconnectAttempts++;
      log(`[Gateway] Reconnecting in ${Math.round(delay / 1000)}s (Attempt #${reconnectAttempts})...`);
      setTimeout(connectGateway, delay);
    };

    gatewayWs.onerror = (err) => {
      isReconnecting = false;
      log(`[Gateway Error] ${err.message}`);
    };
  } catch (e) {
    isReconnecting = false;
    log(`[Gateway Exception] ${e.message}`);
    setTimeout(connectGateway, 5000);
  }
}

async function bootstrap() {
  log(`=== Chic Bot 24/7 Cloud Service Starting ===`);
  await initWelcomedHistory();
  await initRepState();
  connectGateway();
  initDankMemerReminders();
  initAutomatedMemeDrops();
  restoreBumpReminder();
  setTimeout(refreshPanels, 5000);

  if (auditInterval) clearInterval(auditInterval);
  auditInterval = setInterval(reconcileRecentJoins, 5000);
}

bootstrap();
