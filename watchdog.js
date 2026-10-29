import fs from 'fs';

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

const LOG_FILE = "./watchdog.log";
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch(e){}
}

const lastSeenMap = new Map();

async function discordFetch(endpoint, method = "GET", body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://discord.com/api/v10${endpoint}`, opts);
  if (res.status === 204) return true;
  if (!res.ok) return null;
  return await res.json();
}

async function checkChannels() {
  try {
    const channels = await discordFetch(`/guilds/${GUILD_ID}/channels`);
    if (!Array.isArray(channels)) return;
    const textChannels = channels.filter(c => c.type === 0);

    for (const ch of textChannels) {
      const lastId = lastSeenMap.get(ch.id);
      const url = lastId
        ? `/channels/${ch.id}/messages?after=${lastId}&limit=10`
        : `/channels/${ch.id}/messages?limit=3`;

      const msgs = await discordFetch(url);
      if (!Array.isArray(msgs) || msgs.length === 0) continue;

      if (!lastId) {
        // Initialize last seen to latest message ID
        lastSeenMap.set(ch.id, msgs[0].id);
        continue;
      }

      for (const m of msgs.reverse()) {
        lastSeenMap.set(ch.id, m.id);
        if (m.author.id === BOT_ID) continue;

        const isWolf = m.author.id === WOLF_ID;
        const isKukzze = m.author.id === KUKZZE_ID;
        const mentionsBot = m.mentions && m.mentions.some(u => u.id === BOT_ID);

        if (isWolf || isKukzze || mentionsBot) {
          log(`[NEW MESSAGE in #${ch.name}] from @${m.author.username}: ${m.content || '[empty/embed]'}`);

          // Handle rep-counter barbell reaction if number or rep counter channel
          if (ch.name === 'rep-counter' && (m.content || '').match(/\d+/)) {
            await discordFetch(`/channels/${ch.id}/messages/${m.id}/reactions/%F0%9F%8F%8B%EF%B8%8F/@me`, 'PUT');
            log(`[Watchdog] Auto-reacted with barbell on rep in #${ch.name}`);
          }
        }
      }
    }
  } catch (err) {
    log(`[Watchdog Err] ${err.message}`);
  }
}

log("=== Chic Gang 24/7 Autonomous Watchdog Initialized ===");
// Poll every 5 seconds
setInterval(checkChannels, 5000);
checkChannels();
