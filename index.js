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

    const roleNotice = unlockedRole
      ? `\n\n🏆 **NEW PRESTIGE UNLOCKED:** <@&${unlockedRole.id}>\nWear your discipline with pride on the gym floor!`
      : ``;

    // Hidden personal level-up alert to avoid spamming the channel
    try {
      const dmChannel = await discordApi('/users/@me/channels', 'POST', { recipient_id: userId });
      if (dmChannel && dmChannel.id) {
        await discordApi(`/channels/${dmChannel.id}/messages`, 'POST', {
          content: `🎉 **CHIC GANG LEVEL UP // LEVEL ${newLevel}!** ⚡🔥`,
          embeds: [
            {
              title: `⚡ CHIC GANG PROGRESSION // LEVEL UP`,
              description: `Huge props on hitting **Level ${newLevel}**!${roleNotice}\n\nKeep participating in discussions, training logs, and meme drops to climb toward **<@&1563809433014898688>**!`,
              color: unlockedRole ? 0xF1C40F : 0x2ECC71,
              footer: { text: "Chic Gang Native Leveling Engine • Private Level Alert" },
              timestamp: new Date().toISOString()
            }
          ]
        });
      }
    } catch (dmErr) {
      // If DMs closed, post temporary alert in WINS_CH and auto-delete after 20 seconds
      try {
        const tempMsg = await discordApi(`/channels/${WINS_CH}/messages`, "POST", {
          content: `🎉 **LEVEL UP ALERT // <@${userId}> REACHED LEVEL ${newLevel}!** ⚡🔥 *(Auto-cleaning in 20s)*`,
          embeds: [
            {
              title: `⚡ CHIC GANG PROGRESSION // LEVEL UP`,
              description: `Huge props to **${author.global_name || author.username}** (<@${userId}>) for hitting **Level ${newLevel}**!${roleNotice}\n\nKeep participating in discussions, training logs, and meme drops to climb toward **<@&1563809433014898688>**!`,
              color: unlockedRole ? 0xF1C40F : 0x2ECC71,
              thumbnail: {
                url: author.avatar
                  ? `https://cdn.discordapp.com/avatars/${userId}/${author.avatar}.png?size=256`
                  : `https://cdn.discordapp.com/embed/avatars/0.png`
              },
              footer: { text: "Chic Gang Native Leveling Engine • 100% Free & Automated" },
              timestamp: new Date().toISOString()
            }
          ]
        });
        if (tempMsg && tempMsg.id) {
          setTimeout(() => {
            discordApi(`/channels/${WINS_CH}/messages/${tempMsg.id}`, "DELETE").catch(() => {});
          }, 20000);
        }
      } catch (e) {}
    }
  }

  saveLevelsDb();
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

async function postServerLog(title, description, color = 0x3498DB) {
  try {
    await discordApi(`/channels/${SERVER_LOGS_CH}/messages`, "POST", {
      embeds: [
        {
          title,
          description,
          color,
          footer: { text: "Chic Gang Server Watchdog" },
          timestamp: new Date().toISOString()
        }
      ]
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
const WELCOME_GIFS = [
  "https://media.giphy.com/media/BCIoXfA95d1ba/giphy.gif",
  "https://media.giphy.com/media/d9ktvnNPax++M7Sl8j/giphy.gif",
  "https://media.giphy.com/media/3o7TKL9J48WENMyrII/giphy.gif",
  "https://media.giphy.com/media/l41lT4n6ylgW2hh04/giphy.gif",
  "https://media.giphy.com/media/26AHG5KGFxSkUWw1i/giphy.gif"
];

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
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    const gifUrl = WELCOME_GIFS[Math.floor(Math.random() * WELCOME_GIFS.length)];

    if (user.bot) {
      log(`[Welcome] Broadcasting bot activation for @${user.username} (${user.id})...`);
      await discordApi(`/guilds/${GUILD_ID}/members/${user.id}/roles/${BOTS_ROLE_ID}`, "PUT").catch(() => {});

      const postRes = await discordApi(`/channels/${WELCOME_CH}/messages`, "POST", {
        content: `🤖 **NEW EQUIPMENT INSTALLED: <@${user.id}> HAS ARRIVED ON THE FLOOR!** ⚡🦾`,
        embeds: [
          {
            title: `🦾 NEW GYM UTILITY BOT // @${user.username} CONNECTED`,
            description: `<@${user.id}> has joined **Chic Gang**! The **🤖 Bots** role has been automatically provisioned.\n\nFor arcade games, economy commands, or bot utilities, check out <#${BOT_CORNER_CH}> and <#${DANK_MEMER_CH}>!`,
            color: 0x9B59B6,
            thumbnail: { url: avatarUrl },
            image: { url: gifUrl },
            footer: { text: "Chic Gang Bot Registrar • Floor AI Sentinel" },
            timestamp: new Date().toISOString()
          }
        ]
      });

      if (postRes && postRes.id) {
        for (const emoji of ["🤖", "⚡", "🦾"]) {
          await fetch(`https://discord.com/api/v10/channels/${WELCOME_CH}/messages/${postRes.id}/reactions/${encodeURIComponent(emoji)}/@me`, {
            method: "PUT",
            headers: { Authorization: `Bot ${TOKEN}` }
          }).catch(() => {});
        }
      }
      return;
    }

    log(`[Welcome] Broadcasting welcome for athlete @${user.username} (${user.id})...`);

    const postRes = await discordApi(`/channels/${WELCOME_CH}/messages`, "POST", {
      content: `👋 **WELCOME TO THE SQUAD, <@${user.id}>!** Lock in and hit your goals with Chic Gang! ⚡💪🔥`,
      embeds: [
        {
          title: "⚡ NEW ATHLETE ENTERED THE FLOOR // WELCOME TO CHIC GANG",
          description: `Hey **${user.global_name || user.username}** (<@${user.id}>), welcome to **Chic Gang**—the official community for **Chic Builder** and high-voltage gym culture.\n\nWhether you're hitting high-bar squats, chasing an 8-plate deadlift, or tracking progressive overload offline, you're rolling with the squad now. No cap, no excuses.`,
          color: 0x2ECC71,
          thumbnail: { url: avatarUrl },
          image: { url: gifUrl },
          fields: [
            {
              name: "1️⃣ STEP UP TO VERIFICATION",
              value: "> Head to <#1563619147382915184> and tap **⚡ Verify & Enter Chic Gang** to unlock the gym floor.",
              inline: false
            },
            {
              name: "2️⃣ READ THE COMMANDMENTS",
              value: "> Review our updated gym rules in <#1562037195965993053>. Zero toxicity, strictly SFW, zero links.",
              inline: false
            },
            {
              name: "3️⃣ CLAIM YOUR DISCIPLINES",
              value: "> Pick your lifting style (Powerlifting, Bodybuilding, Calisthenics) in <#1563614050590662729>.",
              inline: false
            },
            {
              name: "4️⃣ JOIN 10-DAY PLAY STORE TESTING",
              value: "> Chic Builder Android Alpha is live! Check out <#1562037196238757925> to test 909+ offline exercises.",
              inline: false
            }
          ],
          footer: {
            text: "Chic Gang Welcome Desk • Floor AI Sentinel",
            icon_url: "https://cdn.discordapp.com/emojis/1563621932262232216.webp"
          },
          timestamp: new Date().toISOString()
        }
      ]
    });

    if (postRes && postRes.id) {
      for (const emoji of ["⚡", "💪", "🔥"]) {
        await fetch(`https://discord.com/api/v10/channels/${WELCOME_CH}/messages/${postRes.id}/reactions/${encodeURIComponent(emoji)}/@me`, {
          method: "PUT",
          headers: { Authorization: `Bot ${TOKEN}` }
        }).catch(() => {});
      }
    }

    await postServerLog(
      "🎉 New Athlete Joined",
      `**Athlete:** <@${user.id}> (\`${user.username}\`)\n**Welcome Broadcast:** Sent to <#${WELCOME_CH}>`,
      0x2ECC71
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
  { quote: "Yeah buddy! Lightweight baby! Ain't nothing to it but to do it!", author: "Ronnie Coleman" },
  { quote: "The last three or four reps is what makes the muscle grow. This area of pain divides a champion from someone who is not a champion.", author: "Arnold Schwarzenegger" },
  { quote: "If you can still walk to your car after leg day, you didn't do leg day.", author: "Tom Platz" },
  { quote: "We're all gonna make it, brah.", author: "Zyzz" },
  { quote: "Don't count the days, make the days count under the bar.", author: "Chris Bumstead" },
  { quote: "Discipline is doing what you hate to do, but doing it like you love it.", author: "Mike Tyson" }
];

const ROASTS = [
  "Bro's upper body is Johnny Bravo, but the lower body is flamingo legs. Rack up the squats today.",
  "You've been 'bulking' for 3 years straight without a single visible delt vein. That's not a bulk, that's just uncontrolled calorie consumption.",
  "Your range of motion on bench was so shallow the barbell thought you were just giving it a quick hug.",
  "Bro spends 45 minutes warming up with resistance bands and green tea just to do 3 sets of phone scrolling on the incline bench.",
  "Your pre-workout scoop has more active ingredients than your actual lifting routine.",
  "Half-reps don't build full physiques bro. Lower the ego, lower the weight, touch the chest.",
  "Lock in! Even the 2.5kg plates are feeling lonely waiting for you to finish talking in the gym lobby."
];

function pickItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateChatResponse(msg) {
  const raw = (msg.content || "").trim();
  const lower = raw.toLowerCase();
  const authorId = msg.author?.id;
  const isWolf = authorId === WOLF_ID;
  const isKukzze = authorId === KUKZZE_ID;

  // Commands
  if (lower.startsWith("!spot") || lower.includes("spot me")) {
    return `Hands locked under the barbell. Unracked... down to the sternum... DRIVE THROUGH THE HEELS! It's all you, don't quit on the sticking point! 🏋️‍♂️🔥`;
  }

  if (lower.startsWith("!roast") || lower.includes("roast me")) {
    return `💀 ${pickItem(ROASTS)}`;
  }

  if (lower.startsWith("!quote") || lower === "quote" || lower.includes("motivate me")) {
    const q = pickItem(QUOTES);
    return `💬 *"${q.quote}"* — **${q.author}** ⚡💪`;
  }

  if (lower.startsWith("!hype") || lower.includes("hype me up")) {
    return `⚡ **TIME TO RERACK THE WORLD!** Pre-workout surging, heart rate primed, zero room for hesitation. Get on the floor and own the iron! 🦾🔥`;
  }

  if (lower.startsWith("!split") || lower.includes("best split") || lower.includes("workout split")) {
    return `📋 **Top Tier Workout Splits:**\n` +
      `• **PPL (Push / Pull / Legs):** Best for hypertrophy & balanced recovery (6-day or 3-day cycle).\n` +
      `• **Upper / Lower:** Elite for strength & progressive overload (4 days/week).\n` +
      `• **Arnold Split (Chest+Back / Shoulders+Arms / Legs):** Insane pump & arm volume.\n\n` +
      `*Tip: Track all sets & progression offline inside the Chic Builder app!* 💪`;
  }

  if (lower.startsWith("!macros")) {
    const match = raw.match(/!macros\s+(\d+)/);
    const weight = match ? parseInt(match[1], 10) : 70;
    const protein = Math.round(weight * 2);
    const calsBulk = Math.round(weight * 38);
    const calsCut = Math.round(weight * 26);
    return `📊 **Macro Blueprint for ${weight}kg Lifter:**\n` +
      `• **Daily Protein:** ~${protein}g (2g / kg bodyweight)\n` +
      `• **Lean Bulk Calories:** ~${calsBulk} kcal/day (+300 surplus)\n` +
      `• **Cutting Calories:** ~${calsCut} kcal/day (-400 deficit)\n` +
      `• **Hydration:** Minimum 3.5L water daily. Don't forget 5g creatine! 💧`;
  }

  if (lower.startsWith("!flip") || lower.includes("flip a coin")) {
    return Math.random() > 0.5 ? "🪙 **HEADS** — Extra set to failure!" : "🪙 **TAILS** — Drop set on the last exercise!";
  }

  if (lower.startsWith("!8ball")) {
    const answers = [
      "💯 Absolutely, rack the weight and go.",
      "🚫 Don't do it, your form will collapse.",
      "🔥 The iron never lies. Yes.",
      "⚠️ Take a rest day bro, nervous system is fried.",
      "💪 100% yes, RPE 10 incoming.",
      "🤷‍♂️ Ask again after you finish your protein shake."
    ];
    return `🎱 **Barbell Oracle:** ${pickItem(answers)}`;
  }

  if (lower.startsWith("!help") || lower === "!commands") {
    return `⚡ **Chic Spotter Interactive Commands:**\n` +
      `• \`!spot\` — Get spotted on your set\n` +
      `• \`!formcheck [exercise]\` — Form cues & checklist\n` +
      `• \`!split\` — Proven workout splits\n` +
      `• \`!macros [kg]\` — Calorie & protein targets\n` +
      `• \`!quote\` — Iconic lifter quotes\n` +
      `• \`!roast\` — Gym bro reality check\n` +
      `• \`!hype\` — Pre-workout motivation\n` +
      `• \`!flip\` & \`!8ball\` — Fun gym decisions\n` +
      `*Or simply talk to me or tag me anywhere—I'm always on duty!* 🏋️‍♂️`;
  }

  // Wolfie recognition (the_wolf.ie - clear, grounded, respectful, human-like)
  if (isWolf) {
    if (lower.includes("changes") || lower.includes("update") || lower.includes("task") || lower.includes("fix") || lower.includes("check")) {
      return `Understood, wolf. Everything is verified and running clean. Standing by for any adjustments.`;
    }
    return `On it, wolf. The bot is locked in, workout radio is streaming 24/7, and server operations are fully nominal.`;
  }

  // Kukzze recognition (dev banter)
  if (isKukzze) {
    if (lower.includes("bot") || lower.includes("dev") || lower.includes("code") || lower.includes("app")) {
      return `Hey dev! Cloud container is operating at 100% health. Keep crushing those sets and pushing code! 💻⚡💪`;
    }
  }

  // PR / Heavy Lift Celebrations
  if (/\b(pr|pb|personal best|personal record|1rm|maxed out|hit 100|hit 120|hit 140|hit 160|hit 200|benched|deadlifted|squatted)\b/i.test(lower)) {
    return `MASSIVE PR! 🔥 That bar moved with authority. Log that milestone in Chic Builder and keep chasing progressive overload! <:cb_big_w:1563245281661690036>`;
  }

  // Leg Day & Excuses
  if (/\b(leg day|legs|skip legs|skip leg day|squats|calves|wheels)\b/i.test(lower)) {
    if (lower.includes("skip")) {
      return `Skipping leg day is an automatic penalty. You cannot build a fortress on toothpicks. Rerack and hit the squat rack! 🍗❌`;
    }
    return `Leg day on deck! Hit proper depth on squats, control the eccentric, and embrace the burn. Wheels under construction! 🏋️‍♂️`;
  }

  // Diet & Nutrition
  if (/\b(creatine|protein|whey|bulk|cut|calories|diet|chicken|carbs|cheat meal)\b/i.test(lower)) {
    if (lower.includes("cheat")) {
      return `Enjoy the cheat meal for glycogen replenishment, but hit your daily protein goal first and put those extra calories to work on heavy compound lifts tomorrow! 💪`;
    }
    if (lower.includes("creatine")) {
      return `5g of creatine monohydrate daily. No fancy loading phase needed. Just stay consistent and drink plenty of water! 💧`;
    }
    return `Keep nutrition dialed in: 1.6 to 2.2g of protein per kg of bodyweight, eat around maintenance according to your goals, and prioritize whole foods.`;
  }

  // Tired / Motivation
  if (/\b(lazy|tired|don't feel like|no motivation|skip today|demotivated)\b/i.test(lower)) {
    return `Discipline beats motivation every day of the week. The iron doesn't care if you're tired. Show up, warm up, and let the pump take over! 🔥`;
  }

  // Glutes / Ass / Hips
  if (/\b(glute|glutes|ass|butt|hip thrust)\b/i.test(lower)) {
    return `Hip thrusts are non-negotiable. Build glutes of steel so your lower back doesn't take the hit on heavy deadlifts! 🍑🏋️‍♂️`;
  }

  // Shhh / Silence
  if (/\b(shh|shhh|shhhh|shhhhh|quiet)\b/i.test(lower) || lower.includes("shhhhh")) {
    return `🤫 *Shhh... locking in.* No talking on the platform, strictly iron moving. 🗿⚡`;
  }

  // Let's Go / Hype
  if (/\b(lets goo|let's go|lets go)\b/i.test(lower)) {
    return `⚡ **LETS GOOOO!** Rerack the weight, lock the collar, and own this set! 🔥`;
  }

  // Arms / Biceps
  if (/\b(bicep|biceps|arms|tricep|triceps|curl|curls)\b/i.test(lower)) {
    return `Curls for the girls! Just don't curl in the squat rack unless you want the whole gym giving you the side-eye. 💪`;
  }

  // Abs / Core
  if (/\b(abs|six pack|core|belly)\b/i.test(lower)) {
    return `Abs are forged in the gym and revealed in the kitchen. Dial in that caloric deficit and hit your hanging leg raises! 🥗`;
  }

  // Chic Builder App Mention
  if (/\b(app|chic builder|exercises|tracker|workout log|logging)\b/i.test(lower)) {
    return `Chic Builder is built for serious lifters: **909+ offline exercises**, zero ads, local logging, and clean progressive overload tracking. 📱⚡`;
  }

  // Greetings
  if (/\b(hi|hello|hey|yo|sup|wassup)\b/i.test(lower)) {
    return `Yo! Ready to put in work today? What are we training? 🏋️‍♂️`;
  }

  // Ronnie / CBum / Zyzz triggers
  if (/\b(ronnie|coleman|lightweight|light weight|yea buddy|yeah buddy|cbum|zyzz)\b/i.test(lower)) {
    return `⚡ **"YEAAAH BUDDY! LIGHT WEIGHT BABY! AIN'T NOTHING TO IT BUT TO DO IT!"** — *Big Ron* 🏋️‍♂️💪🔥`;
  }

  // Conversational Fallback (English only)
  const enResponses = [
    `Spotter on duty! What's the play today—heavy compounds or hypertrophy volume? 💪`,
    `Heard you loud and clear. Keep the intensity high and don't rush through the eccentrics! 🏋️‍♂️`,
    `Locked in on the floor. Drop your questions, track your PRs, and let's get those numbers up! ⚡`,
    `Always listening. Barbell is racked and ready whenever you are! 🔥`
  ];
  return pickItem(enResponses);
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

  const isReplyToBot = msg.referenced_message && msg.referenced_message.author && msg.referenced_message.author.id === BOT_ID;
  const isExplicitCommand = content.startsWith("!");

  // In #rep-counter, pure numbers are for counting, don't chat unless directly pinged/commanded
  if (chId === REP_COUNTER_CH) {
    if (mentionsBot || isExplicitCommand) {
      const reply = `🏋️‍♂️ **Spotter on duty!** The barbell is racked at **${repState.currentCount} reps** (next rep is **${repState.currentCount + 1}**)! Drop your count lifters! 💪⚡`;
      await discordApi(`/channels/${chId}/messages`, "POST", {
        content: reply,
        message_reference: { message_id: msg.id }
      }).catch(() => {});
    }
    return;
  }

  const isBotCorner = chId === BOT_CORNER_CH;
  const isGymChannel = chId === GENERAL_CH || chId === FITNESS_TALK_CH;

  let shouldReply = false;
  let replyText = "";

  if (mentionsBot || isReplyToBot || isExplicitCommand) {
    shouldReply = true;
    replyText = generateChatResponse(msg);
  } else if (isBotCorner) {
    const isForeignBotCmd = /^(pls|beg|hunt|fish|dig|pm|postmemes|m!|p!|c!|\/)/i.test(content);
    if (!isForeignBotCmd && canTriggerAmbient(chId, 3000)) {
      shouldReply = true;
      replyText = generateChatResponse(msg);
    }
  } else if (isGymChannel) {
    const hasGymKeywords = /\b(pr|pb|leg day|squat|bench|deadlift|creatine|protein|bulk|cut|workout|gym|lifting|form|cheat meal|tired|lazy|motivation|ronnie|cbum|zyzz|split|macros)\b/i.test(lower);
    if (hasGymKeywords && canTriggerAmbient(chId, 8000)) {
      shouldReply = true;
      replyText = generateChatResponse(msg);
    }
  }

  // Reactions for PRs or wins
  if (/\b(pr|pb|personal record|hit 100|hit 120|hit 140|hit 160|hit 200)\b/i.test(lower)) {
    reactEmoji(chId, msg.id, "cb_big_w:1563245281661690036").catch(() => {});
    reactEmoji(chId, msg.id, "cb_pr:1563245271784103957").catch(() => {});
    reactEmoji(chId, msg.id, "🔥").catch(() => {});
  }

  if (shouldReply && replyText) {
    try {
      log(`[Smart Chat] Replying to @${author.username} in #${chId}: "${replyText.slice(0, 50)}..."`);
      await discordApi(`/channels/${chId}/messages`, "POST", {
        content: replyText,
        message_reference: { message_id: msg.id }
      });
    } catch (err) {
      log(`[Smart Chat Err] ${err.message}`);
    }
  }
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

  // 1. Check double-counting
  if (repState.currentCount > 0 && userId === repState.lastUserId) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${REP_COUNTER_CH}/messages/${d.id}/reactions/%E2%9D%8C/@me`, {
        method: "PUT",
        headers: { Authorization: `Bot ${TOKEN}` }
      });
      await discordApi(`/channels/${REP_COUNTER_CH}/messages`, "POST", {
        embeds: [
          {
            title: "🚨 FORM BREAK // DOUBLE SET FOUL!",
            description: `<@${userId}> tried to count twice in a row at **${repState.currentCount} reps**!\n\nForm is completely broken. Barbell has been reset back to **1**! Grab your chalk and pick it back up lifters! 🍼`,
            color: 0xE74C3C,
            footer: { text: "Chic Gang Barbell Form Checker" },
            timestamp: new Date().toISOString()
          }
        ]
      });
    } catch (e) {}
    repState.currentCount = 0;
    repState.lastUserId = null;
    saveRepState();
    return;
  }

  // 2. Check wrong number
  if (num !== expected) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${REP_COUNTER_CH}/messages/${d.id}/reactions/%E2%9D%8C/@me`, {
        method: "PUT",
        headers: { Authorization: `Bot ${TOKEN}` }
      });
      await discordApi(`/channels/${REP_COUNTER_CH}/messages`, "POST", {
        embeds: [
          {
            title: "🚨 FORM BREAK // MISSED REP!",
            description: `<@${userId}> counted **${num}**, but the barbell needed **${expected}**!\n\nThe set was ruined at **${repState.currentCount} reps**. Count reset to **1**! Lock in lifters! 🍼`,
            color: 0xE74C3C,
            footer: { text: "Chic Gang Barbell Form Checker" },
            timestamp: new Date().toISOString()
          }
        ]
      });
    } catch (e) {}
    repState.currentCount = 0;
    repState.lastUserId = null;
    saveRepState();
    return;
  }

  // 3. Clean Rep!
  repState.currentCount = num;
  repState.lastUserId = userId;
  saveRepState();

  try {
    await fetch(`https://discord.com/api/v10/channels/${REP_COUNTER_CH}/messages/${d.id}/reactions/%F0%9F%8F%8B%EF%B8%8F/@me`, {
      method: "PUT",
      headers: { Authorization: `Bot ${TOKEN}` }
    });
  } catch (e) {}

  // Milestones
  const milestones = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  if (milestones.includes(num)) {
    try {
      await discordApi(`/channels/${REP_COUNTER_CH}/messages`, "POST", {
        embeds: [
          {
            title: `🏆 BARBELL MILESTONE // ${num.toLocaleString()} REPS LOCKED!`,
            description: `**HEAVY WORKING SET MILESTONE ACHIEVED!**\n<@${userId}> just racked Rep **#${num.toLocaleString()}** on the community barbell!\n\nKeep rhythm, maintain strict form, and push to the next milestone! 🏋️‍♂️⚡🔥`,
            color: 0xF1C40F,
            footer: { text: "Chic Gang Strength Milestone" },
            timestamp: new Date().toISOString()
          }
        ]
      });
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Disboard Bump Detection & Cooldown
// -------------------------------------------------------------
let bumpTimeout = null;

async function handleDisboardMessage(msg) {
  if (msg.author.id !== "302050872383242240") return;

  const desc = (msg.embeds && msg.embeds[0] && msg.embeds[0].description) || "";
  const isBumpSuccess = desc.includes("Bump done!") || desc.includes("Check it on DISBOARD");

  if (isBumpSuccess) {
    const bumpDurationMs = 2 * 60 * 60 * 1000;
    const readyAtDate = new Date(Date.now() + bumpDurationMs);
    const unixStamp = Math.floor(readyAtDate.getTime() / 1000);

    log(`[Bump] Disboard bump successful! Next bump at ${readyAtDate.toISOString()}`);

    await discordApi(`/channels/${BUMP_CH}/messages`, "POST", {
      embeds: [
        {
          title: "🚀 SERVER BUMP RECORDED // COOLDOWN LOCKED",
          description: `Thank you for bumping **Chic Gang** on Disboard!\n\n⏳ **Next bump ready:** <t:${unixStamp}:R> (<t:${unixStamp}:T>)\n\nChic Bot will ping <@&${BUMP_PING_ROLE_ID}> the second the 2-hour window opens!`,
          color: 0x2ECC71,
          footer: { text: "Chic Gang Growth Engine • Disboard Tracker" },
          timestamp: new Date().toISOString()
        }
      ]
    });

    if (bumpTimeout) clearTimeout(bumpTimeout);
    bumpTimeout = setTimeout(async () => {
      try {
        log(`[Bump] 2 hours elapsed! Pinging bump reminder...`);
        await discordApi(`/channels/${BUMP_CH}/messages`, "POST", {
          content: `📢 <@&${BUMP_PING_ROLE_ID}> **TIME TO BUMP!**\nType \`/bump\` right now to push **Chic Gang** to the top of Disboard rankings! ⚡🚀💪`
        });
      } catch (err) {
        log(`[Bump Reminder Error] ${err.message}`);
      }
    }, bumpDurationMs);
  }
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
      await discordApi(`/channels/${DANK_MEMER_CH}/messages`, "POST", {
        embeds: [
          {
            title: "🐸 DANK MEMER COOLDOWN CHECK // GRIND TIME",
            description: "**Time to stack your gym balance!**\nRun your commands right now to maximize your wallet:\n\n• `/daily` — Claim free coins streak\n• `/work` — Clock into your shift\n• `/beg` — Grab some street cash\n• `/hunt` & `/fish` — Gather rare catches\n• `/deposit all` — Protect your bag from robbers!\n\n*Keep grinding the gym economy 24/7!*",
            color: 0x2ECC71,
            footer: { text: "Chic Gang Arcade Sentinel" },
            timestamp: new Date().toISOString()
          }
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

async function postAutomatedMemeDrop() {
  try {
    const subreddits = ['GymMemes', 'fitnessmemes', 'wholesomegymmemes'];
    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];
    const res = await fetch(`https://meme-api.com/gimme/${sub}/5`);
    if (!res.ok) return;
    const data = await res.json();
    const memes = (data.memes || []).filter(m => m.url && !m.nsfw && !postedMemeUrls.has(m.url));
    if (memes.length === 0) return;

    const meme = memes[0];
    postedMemeUrls.add(meme.url);
    if (postedMemeUrls.size > 200) {
      const first = postedMemeUrls.values().next().value;
      postedMemeUrls.delete(first);
    }

    const postRes = await fetch(`https://discord.com/api/v10/channels/${MEMES_CH}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [{
          title: meme.title || 'Gym Meme Drop',
          url: meme.postLink,
          image: { url: meme.url },
          color: 0x2ECC71,
          footer: { text: `r/${meme.subreddit} • u/${meme.author} • 👍 ${meme.ups || 0} upvotes` },
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (postRes.ok) {
      const msg = await postRes.json();
      log(`[Meme Drop] Posted meme "${meme.title}" to #${MEMES_CH} (ID: ${msg.id})`);
      for (const emoji of ['🔥', '💪', '😂']) {
        try {
          await fetch(`https://discord.com/api/v10/channels/${MEMES_CH}/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}/@me`, {
            method: 'PUT',
            headers: { Authorization: `Bot ${TOKEN}` }
          });
        } catch (e) {}
      }
    }
  } catch (err) {
    log(`[Meme Drop Err] ${err.message}`);
  }
}

function initAutomatedMemeDrops() {
  if (memeInterval) clearInterval(memeInterval);
  setTimeout(postAutomatedMemeDrop, 15000);
  memeInterval = setInterval(postAutomatedMemeDrop, 60 * 60 * 1000);
}

// -------------------------------------------------------------
// Interactive UI Handler (Sub-30ms Instant Response)
// -------------------------------------------------------------
async function handleInteraction(interaction) {
  const { id, token, data, member, user: directUser, type, channel_id } = interaction;
  const user = member?.user || directUser;
  const userId = user?.id;

  if (type === 3) {
    const customId = data.custom_id;

    if (customId === "verify_btn") {
      log(`[Interaction] Processing verify_btn for @${user?.username} (${userId})`);
      await respondInteraction(id, token, {
        type: 4,
        data: {
          content: `✅ **VERIFIED!** Welcome to Chic Gang, <@${userId}>! Roles \`✅ Verified\` and \`⚡ Member\` unlocked. Lock in and hit your sets! 💪⚡`,
          flags: 64
        }
      });

      discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${VERIFIED_ROLE_ID}`, "PUT")
        .then(() => discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${MEMBER_ROLE_ID}`, "PUT"))
        .catch(err => log(`[Verify Role Assignment Err] ${err.message}`));
      return;
    }

    if (customId.startsWith("role_")) {
      const roleId = customId.replace("role_", "");
      const roleName = ALLOWED_SELF_ROLES[roleId] || "Selected Discipline";

      const currentRoles = member?.roles || [];
      const hasRole = currentRoles.includes(roleId);

      log(`[Interaction] Toggling role ${roleName} (${roleId}) for @${user?.username}: hasRole=${hasRole}`);

      await respondInteraction(id, token, {
        type: 4,
        data: {
          content: hasRole
            ? `🗑️ Removed discipline: **${roleName}**.`
            : `⚡ Equipped discipline: **${roleName}**! Stay consistent. 💪`,
          flags: 64
        }
      });

      const method = hasRole ? "DELETE" : "PUT";
      discordApi(`/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, method)
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

      let summary = "✅ **Roles Synchronized!**\n";
      if (added.length > 0) summary += `• Equipped: **${added.join(", ")}**\n`;
      if (removed.length > 0) summary += `• Removed: **${removed.join(", ")}**\n`;
      if (added.length === 0 && removed.length === 0) summary += "No role changes made.\n";
      summary += `\n*Keep grinding the discipline!* 💪⚡`;

      await respondInteraction(id, token, {
        type: 4,
        data: {
          content: summary,
          flags: 64
        }
      });
      return;
    }

    if (customId === "view_ranks_guide") {
      await respondInteraction(id, token, {
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              title: "🎖️ CHIC BUILDER // ATHLETE RANK HIERARCHY",
              description: "Chic Gang ranks are dynamically calculated and unlocked through the **Chic Builder** workout engine. Track your lifts, achieve progressive overload, and unlock official athlete tiers on the server:\n\n🛡️ **Rank 1: Novice Lifter** (Levels 1–4)\n⚔️ **Rank 2: Iron Apprentice** (Levels 5–9)\n⚡ **Rank 3: Gym Regular** (Levels 10–19)\n🔥 **Rank 4: Heavy Lifter** (Levels 20–34)\n🔱 **Rank 5: Elite Athlete** (Levels 35–49)\n👑 **Rank 6: Greek God** (Levels 50–74)\n🌌 **Rank 7: Chic Titan** (Levels 75–99)\n💎 **Rank 8: Spotter Deity** (Levels 100+)\n\n*Log your training sets consistently to rank up and claim your role!*",
              color: 0xF1C40F,
              footer: { text: "Chic Gang Athlete Progression • Private Guide" }
            }
          ]
        }
      });
      return;
    }

    if (customId === "view_staff_hierarchy") {
      await respondInteraction(id, token, {
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              title: "👑 Chic Gang | Leadership Hierarchy",
              description: "**The official server leadership & administration structure:**\n\n• **👑 Co-Founder / Founders** — Core server direction, product vision & engineering.\n• **🛡️ Moderators** — Community safety, form check moderation & respect enforcement.\n• **⚡ Verified Lifters** — Dedicated server athletes with verified status.\n\n*Reach out to any staff member via <#1562037195965993057> if you need assistance!*",
              color: 0xE74C3C,
              footer: { text: "Chic Gang Staff Desk" }
            }
          ]
        }
      });
      return;
    }

    if (customId === "select_rules_section") {
      const val = data.values?.[0];
      let title = "📜 CHIC GANG // RULES SECTION";
      let desc = "Standard gym code.";
      let color = 0xE74C3C;

      if (val === "rule_sec_1") {
        title = "🔒 SECTION I // SERVER SECURITY & SAFETY";
        desc = "**1. No NSFW or Explicit Media:** Strictly prohibited in all public channels and avatars.\n**2. No Harassment, Slurs, or Doxxing:** Zero tolerance for personal attacks, threats, or releasing private info.\n**3. No Scamming or Malicious Links:** Unauthorized advertising, pirated software, or token grabbers lead to permanent bans.";
      } else if (val === "rule_sec_2") {
        title = "⚡ SECTION II // GYM FLOOR ETIQUETTE & LIFTING INTEGRITY";
        desc = "**1. Respect Form Critiques:** Constructive advice only. Zero ego lifting shaming.\n**2. No Dangerous Advice:** Do not prescribe unverified PED cycles, unsafe medical regimens, or extreme dehydration cuts.\n**3. Channel Routing:** Keep memes in <#1563245239727165601>, bot commands in <#1562037196918227003>, and training discussion in <#1562037196238757920>.";
      } else if (val === "rule_sec_3") {
        title = "🛡️ SECTION III // DISCIPLINARY LADDER";
        desc = "**Violation Severity Scale:**\n• **1st Offense:** Formal warning logged in server record.\n• **2nd Offense:** 24-Hour timeout from all text and voice channels.\n• **3rd Offense:** Temporary 7-day server suspension.\n• **Severe Offenses (Doxxing, Exploits, Hate Speech):** Immediate permanent IP ban.";
      } else if (val === "rule_sec_report") {
        title = "🎫 HOW TO REPORT A RULE VIOLATION";
        desc = "**Need Moderator Assistance?**\nClick the **🎫 Open Support Ticket** button below or head over to <#1562037195965993057> to open a confidential private thread with server staff.";
        color = 0x3498DB;
      }

      await respondInteraction(id, token, {
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              title,
              description: desc,
              color,
              footer: { text: "Chic Gang Discipline Protocol • Private View" }
            }
          ]
        }
      });
      return;
    }

    if (customId === "view_full_rules") {
      await respondInteraction(id, token, {
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              title: "🔒 SECTION I // SERVER SECURITY & SAFETY",
              description: "**1. Zero NSFW / Gore:** Immediate permanent ban.\n**2. No Doxxing or Harassment:** Respect lifters' privacy.\n**3. No Scams / Phishing:** Malicious links or unauthorized promo are blocked.",
              color: 0xE74C3C
            },
            {
              title: "⚡ SECTION II // GYM FLOOR ETIQUETTE",
              description: "**1. Lifting Respect:** Constructive critique only.\n**2. No Fake PRs:** Keep lifting metrics authentic.\n**3. Stay on designated channels.**",
              color: 0xF1C40F
            },
            {
              title: "🛡️ SECTION III // DISCIPLINARY LADDER",
              description: "**Warning ➔ 24h Mute ➔ 7d Ban ➔ Permanent IP Ban**\nFair, strict, and disciplined.",
              color: 0x9B59B6,
              footer: { text: "Chic Gang Full Rulebook • Private View" }
            }
          ]
        }
      });
      return;
    }

    if (customId === "open_ticket") {
      await respondInteraction(id, token, {
        type: 9,
        data: {
          title: "Create a Support Ticket",
          custom_id: "ticket_modal",
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "ticket_topic",
                  label: "What do you need assistance with?",
                  style: 1,
                  min_length: 3,
                  max_length: 100,
                  placeholder: "e.g. Bug report, Google Play testing invite, or App feedback",
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
                  label: "Provide additional details",
                  style: 2,
                  min_length: 10,
                  max_length: 1000,
                  placeholder: "Share phone model, Android OS version, or relevant logs...",
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
      await respondInteraction(id, token, {
        type: 4,
        data: {
          content: `🔒 **Ticket is being closed by <@${userId}>.** Channel will delete in 5 seconds. Thank you!`
        }
      });

      setTimeout(async () => {
        try {
          await discordApi(`/channels/${channel_id}`, "DELETE");
        } catch (e) {}
      }, 5000);
      return;
    }
  }

  if (type === 5) {
    if (data.custom_id === "ticket_modal") {
      const topic = data.components[0]?.components[0]?.value || "General Support";
      const details = data.components[1]?.components[0]?.value || "No details provided.";

      await respondInteraction(id, token, {
        type: 4,
        data: {
          content: `⚡ Creating your ticket room right now, please wait a moment...`,
          flags: 64
        }
      });

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

        await discordApi(`/channels/${newTicketChan.id}/messages`, "POST", {
          content: `Hey <@${userId}>! Staff has been pinged.`,
          embeds: [
            {
              title: `🎫 SUPPORT TICKET // #${newTicketChan.name}`,
              description: `**Welcome <@${userId}>!**\nThank you for reaching out to the Chic Gang team.\n\n**Topic:**\n\`${topic}\`\n\n**Details:**\n${details}`,
              color: 0x3498DB
            }
          ],
          components: [
            {
              type: 1,
              components: [
                { type: 2, custom_id: "close_ticket", label: "🔒 Close Ticket", style: 4 }
              ]
            }
          ]
        });
      } catch (err) {
        log(`[Create Ticket Err] ${err.message}`);
      }
      return;
    }
  }

  if (type === 2) {
    const cmd = data.name;
    return respondInteraction(id, token, {
      type: 4,
      data: {
        content: `⚡ Command **/${cmd}** processed successfully by Chic Bot! Lock in and keep training! 💪`
      }
    });
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

  if (auditInterval) clearInterval(auditInterval);
  auditInterval = setInterval(reconcileRecentJoins, 5000);
}

bootstrap();
