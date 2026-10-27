// -------------------------------------------------------------
// Chic Bot // Smart Chat & Conversational Gym Spotter Engine
// 100% Pure English Edition
// -------------------------------------------------------------

const BOT_ID = "1562147527762124831";
const WOLF_ID = "1042743525705523291";
const KUKZZE_ID = "1324929992177746004";

// Dedicated Channels
const BOT_CORNER_CH = "1562037196918227003";
const GENERAL_CH = "1562037196238757918";
const FITNESS_TALK_CH = "1562037196238757920";
const REP_COUNTER_CH = "1563828990521647156";

// Channel cooldown tracking to avoid spam loops
const channelCooldowns = new Map();
function canTriggerAmbient(channelId, cooldownMs = 10000) {
  const now = Date.now();
  const last = channelCooldowns.get(channelId) || 0;
  if (now - last < cooldownMs) return false;
  channelCooldowns.set(channelId, now);
  return true;
}

// Quotes Bank
const QUOTES = [
  { quote: "There is no reason to be alive if you can't do the deadlift.", author: "Jón Páll Sigmarsson" },
  { quote: "Yeah buddy! Lightweight baby! Ain't nothing to it but to do it!", author: "Ronnie Coleman" },
  { quote: "The last three or four reps is what makes the muscle grow. This area of pain divides a champion from someone who is not a champion.", author: "Arnold Schwarzenegger" },
  { quote: "If you can still walk to your car after leg day, you didn't do leg day.", author: "Tom Platz" },
  { quote: "We're all gonna make it, brah.", author: "Zyzz" },
  { quote: "Don't count the days, make the days count under the bar.", author: "Chris Bumstead" },
  { quote: "Discipline is doing what you hate to do, but doing it like you love it.", author: "Mike Tyson" }
];

// Roasts Bank
const ROASTS = [
  "Bro's upper body is Johnny Bravo, but the lower body is flamingo legs. Rack up the squats today.",
  "You've been 'bulking' for 3 years straight without a single visible delt vein. That's not a bulk, that's just uncontrolled calorie consumption.",
  "Your range of motion on bench was so shallow the barbell thought you were just giving it a quick hug.",
  "Bro spends 45 minutes warming up with resistance bands and green tea just to do 3 sets of phone scrolling on the incline bench.",
  "Your pre-workout scoop has more active ingredients than your actual lifting routine.",
  "Half-reps don't build full physiques bro. Lower the ego, lower the weight, touch the chest.",
  "Lock in! Even the 2.5kg plates are feeling lonely waiting for you to finish talking in the gym lobby."
];

// Helper: Pick random item from array
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Interactive Natural Chat Parser & Generator (100% English)
export function generateChatResponse(msg) {
  const raw = (msg.content || "").trim();
  const lower = raw.toLowerCase();
  const authorId = msg.author?.id;
  const isWolf = authorId === WOLF_ID;
  const isKukzze = authorId === KUKZZE_ID;

  // Command handlers (!spot, !formcheck, !roast, !quote, !hype, !split, !macros, !flip, !8ball, !help)
  if (lower.startsWith("!spot") || lower.includes("spot me")) {
    return `Hands locked under the barbell. Unracked... down to the sternum... DRIVE THROUGH THE HEELS! It's all you, don't quit on the sticking point! 🏋️‍♂️🔥`;
  }

  if (lower.startsWith("!roast") || lower.includes("roast me")) {
    return `💀 ${pick(ROASTS)}`;
  }

  if (lower.startsWith("!quote") || lower === "quote" || lower.includes("motivate me")) {
    const q = pick(QUOTES);
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
    return `🎱 **Barbell Oracle:** ${pick(answers)}`;
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
  return pick(enResponses);
}

// Main handler for Discord messages
export async function handleSmartChat(msg, { botId, discordApi, reactEmoji, log }) {
  const author = msg.author;
  if (!author || author.bot) return;

  const chId = msg.channel_id;
  const content = (msg.content || "").trim();
  const lower = content.toLowerCase();

  const mentionsBot = (msg.mentions || []).some(u => u.id === botId) ||
    lower.includes(`<@${botId}>`) ||
    lower.includes(`<@!${botId}>`);

  const isReplyToBot = msg.referenced_message && msg.referenced_message.author && msg.referenced_message.author.id === botId;
  const isExplicitCommand = content.startsWith("!");

  // In #rep-counter, pure numbers are for counting, don't chat unless directly pinged/commanded
  if (chId === REP_COUNTER_CH && !mentionsBot && !isExplicitCommand) {
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
    if (reactEmoji) {
      reactEmoji(chId, msg.id, "cb_big_w:1563245281661690036").catch(() => {});
      reactEmoji(chId, msg.id, "cb_pr:1563245271784103957").catch(() => {});
      reactEmoji(chId, msg.id, "🔥").catch(() => {});
    }
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
