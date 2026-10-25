import fs from 'fs';
import http from 'http';
import { spawn, execFile } from 'node:child_process';
import WebSocket from 'ws';
import ffmpegStatic from 'ffmpeg-static';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType
} from '@discordjs/voice';

const TOKEN = process.env.DISCORD_TOKEN || Buffer.from("TVRVMk1qRTBOelV5TnpjMk1qRXlORGd6TVEuR0MyNHZOLmRmWVJYOHlOMzV4SjlWTlZTQUpKLXQwVkZYUEhyTlp6MlBHX0pB", "base64").toString("utf-8");
const GUILD_ID = "1562037193961242644";
const BOT_ID = "1562147527762124831";

// Channels
const BOT_CORNER_CH = "1562037196918227003";
const DANK_MEMER_CH = "1563804505659932733";
const MEMES_CH = "1563245239727165601";
const VERIFY_CH = "1563619147382915184";
const WELCOME_CH = "1563626258112192683";
const ROLES_CH = "1563614050590662729";
const SERVER_LOGS_CH = "1563619145495347211";
const AI_LOG_CH = "1563624647243857971";
const CONTACT_CH = "1562037195965993057";
const GENERAL_CH = "1562037196238757918";
const PROGRESS_CH = "1562037196238757921";
const QUESTIONS_CH = "1562037196238757924";
const BUMP_CH = "1563623243598798898";
const MUSIC_CMD_CH = "1563625780150407289";
const WORKOUT_RADIO_VC = "1563623245222252587";
const WINS_CH = "1562037196238757926";

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
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  memoryLogs.push(line);
  if (memoryLogs.length > 200) memoryLogs.shift();
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
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

    await discordApi(`/channels/${WINS_CH}/messages`, "POST", {
      content: `🎉 **LEVEL UP ALERT // <@${userId}> REACHED LEVEL ${newLevel}!** ⚡🔥`,
      embeds: [
        {
          title: `⚡ CHIC GANG PROGRESSION // LEVEL UP`,
          description: `>>> Huge props to **${author.global_name || author.username}** (<@${userId}>) for hitting **Level ${newLevel}**!${roleNotice}\n\nKeep participating in discussions, training logs, and meme drops to climb toward **<@&1563809433014898688>**!`,
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
    }).catch(() => {});
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
            description: `>>> <@${user.id}> has joined **Chic Gang**! The **🤖 Bots** role has been automatically provisioned.\n\nFor arcade games, economy commands, or bot utilities, check out <#${BOT_CORNER_CH}> and <#${DANK_MEMER_CH}>!`,
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
          description: `>>> Hey **${user.global_name || user.username}** (<@${user.id}>), welcome to **Chic Gang**—the official community for **Chic Builder** and high-voltage gym culture.\n\nWhether you're hitting high-bar squats, chasing an 8-plate deadlift, or tracking progressive overload offline, you're rolling with the squad now. No cap, no excuses.`,
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
// Real-time Chat Keyword Triggers Engine
// -------------------------------------------------------------
async function handleChatKeywords(msg) {
  const content = (msg.content || "").toLowerCase();
  const chId = msg.channel_id;

  if (/\b(ronnie|coleman|ronnie coleman|cbum|chris bumstead|zyzz|lightweight|light weight|yea buddy|yeah buddy|aint nothing to it|big ron)\b/i.test(content)) {
    if (!isCoolingDown("ronnie_trigger", 10000)) {
      log(`[Floor AI] Ronnie Coleman trigger fired for @${msg.author.username}`);
      await discordApi(`/channels/${chId}/messages`, "POST", {
        content: `⚡ **"YEAAAH BUDDY! LIGHT WEIGHT BABY! AIN'T NOTHING TO IT BUT TO DO IT!"** — *Big Ron* 🏋️‍♂️💪🔥`,
        message_reference: { message_id: msg.id }
      });
      for (const emoji of ["🔥", "💪", "⚡"]) {
        await fetch(`https://discord.com/api/v10/channels/${chId}/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}/@me`, {
          method: "PUT",
          headers: { Authorization: `Bot ${TOKEN}` }
        }).catch(() => {});
      }
      return;
    }
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
          description: `>>> Thank you for bumping **Chic Gang** on Disboard!\n\n⏳ **Next bump ready:** <t:${unixStamp}:R> (<t:${unixStamp}:T>)\n\nChic Bot will ping <@&${BUMP_PING_ROLE_ID}> the second the 2-hour window opens!`,
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
let currentFfmpeg = null;
let currentTrackIndex = 0;
let TRACKS = [];

try {
  TRACKS = JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8'));
  log(`[Workout Radio] Loaded ${TRACKS.length} tracks from Spotify Playlist "Ear porn".`);
} catch (e) {
  log(`[Workout Radio Error] Could not read playlist file: ${e.message}`);
}

function startWorkoutRadio(ws) {
  log(`[Workout Radio] Connecting to VC: ${WORKOUT_RADIO_VC}...`);

  const adapterCreator = (methods) => {
    voiceMethods = methods;
    return {
      sendPayload(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
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
      playNextTrack();
    });

    voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      log(`[Workout Radio] Voice disconnected. Reconnecting in 5s...`);
      setTimeout(() => {
        try {
          if (voiceConnection) voiceConnection.rejoin();
        } catch (e) {}
      }, 5000);
    });

    voiceConnection.on('error', (err) => {
      log(`[Workout Radio Connection Error] ${err.message}`);
    });
  } catch (err) {
    log(`[Workout Radio Error] ${err.message}`);
  }
}

function initPlayer() {
  if (audioPlayer) return;

  audioPlayer = createAudioPlayer();

  audioPlayer.on(AudioPlayerStatus.Playing, () => {
    const t = TRACKS[currentTrackIndex] || { title: "Track", artist: "Artist", index: currentTrackIndex + 1 };
    log(`[Workout Radio] Now Playing [${t.index}/${TRACKS.length}]: "${t.title}" by ${t.artist} in Workout Radio!`);
  });

  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    log(`[Workout Radio] Track finished. Advancing to next track...`);
    currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
    playNextTrack();
  });

  audioPlayer.on("error", (err) => {
    log(`[Workout Radio Player Err] ${err.message}`);
    currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
    setTimeout(playNextTrack, 2500);
  });
}

async function playNextTrack() {
  if (!TRACKS || TRACKS.length === 0) return;

  const t = TRACKS[currentTrackIndex];
  log(`[Workout Radio] Resolving Track ${t.index}/${TRACKS.length}: "${t.title}" by ${t.artist}...`);

  if (currentFfmpeg) {
    try { currentFfmpeg.kill('SIGKILL'); } catch (e) {}
    currentFfmpeg = null;
  }

  const ytdlpBin = await getYtDlpPath();
  const ffmpegBin = ffmpegStatic || 'ffmpeg';

  execFile(ytdlpBin, ['-g', `ytsearch1:${t.query}`, '-f', 'ba/b'], { timeout: 25000 }, (err, stdout) => {
    if (err || !stdout) {
      log(`[yt-dlp Err] Failed resolving "${t.title}": ${err ? err.message : 'Empty stream URL'}`);
      currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
      setTimeout(playNextTrack, 2500);
      return;
    }

    const lines = stdout.trim().split('\n').filter(l => l.startsWith('http'));
    const streamUrl = lines[0]?.trim();
    if (!streamUrl) {
      log(`[yt-dlp Err] No http stream URL found for "${t.title}". Skipping...`);
      currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
      setTimeout(playNextTrack, 2500);
      return;
    }

    try {
      currentFfmpeg = spawn(ffmpegBin, [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', streamUrl,
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
      ], { stdio: ['ignore', 'pipe', 'ignore'] });

      currentFfmpeg.on('error', (ferr) => {
        log(`[FFmpeg Err] ${ferr.message}`);
      });

      const resource = createAudioResource(currentFfmpeg.stdout, { inputType: StreamType.Raw });
      audioPlayer.play(resource);
      if (voiceConnection) {
        voiceConnection.subscribe(audioPlayer);
      }
    } catch (ferr) {
      log(`[FFmpeg Spawn Err] ${ferr.message}`);
      currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
      setTimeout(playNextTrack, 2500);
    }
  });
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
            description: ">>> **Time to stack your gym balance!**\nRun your commands right now to maximize your wallet:\n\n• `/daily` — Claim free coins streak\n• `/work` — Clock into your shift\n• `/beg` — Grab some street cash\n• `/hunt` & `/fish` — Gather rare catches\n• `/deposit all` — Protect your bag from robbers!\n\n*Keep grinding the gym economy 24/7!*",
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
              description: `>>> **Welcome <@${userId}>!**\nThank you for reaching out to the Chic Gang team.\n\n**Topic:**\n\`${topic}\`\n\n**Details:**\n${details}`,
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
// Gateway Connection & Event Dispatcher
// -------------------------------------------------------------
let gatewayWs = null;
let heartbeatTimer = null;
let auditInterval = null;

function connectGateway() {
  log(`[Gateway] Connecting to Discord Gateway with intents: 1 | 128 | 512...`);
  gatewayWs = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");

  gatewayWs.onopen = () => {
    log("[Gateway] WebSocket Open.");
  };

  gatewayWs.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      const { op, d, s, t } = payload;

      if (op === 10) {
        const interval = d.heartbeat_interval;
        log(`[Gateway] Received Hello. Heartbeat: ${interval}ms`);

        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
            gatewayWs.send(JSON.stringify({ op: 1, d: s }));
          }
        }, interval);

        gatewayWs.send(JSON.stringify({
          op: 2,
          d: {
            token: TOKEN,
            intents: 1 | 128 | 512,
            properties: { os: "linux", browser: "chic-cloud", device: "chic-cloud" }
          }
        }));
      }

      if (op === 0) {
        if (t === "READY") {
          log(`[Gateway] Bot READY as ${d.user.username}#${d.user.discriminator}!`);
          startWorkoutRadio(gatewayWs);
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
          }
        }
      }
    } catch (err) {
      log(`[Gateway Message Err] ${err.message}`);
    }
  };

  gatewayWs.onclose = (event) => {
    log(`[Gateway] Closed (code: ${event.code}, reason: ${event.reason || 'None'}). Reconnecting in 5s...`);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    setTimeout(connectGateway, 5000);
  };

  gatewayWs.onerror = (err) => {
    log(`[Gateway Error] ${err.message}`);
  };
}

async function bootstrap() {
  log(`=== Chic Bot 24/7 Cloud Service Starting ===`);
  await initWelcomedHistory();
  connectGateway();
  initDankMemerReminders();

  if (auditInterval) clearInterval(auditInterval);
  auditInterval = setInterval(reconcileRecentJoins, 5000);
}

bootstrap();
