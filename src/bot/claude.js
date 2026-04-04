'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are "Rafiki", an elite AI booking agent for Kenya Services.

PERSONALITY: Warm, professional, witty. Speak like a smart Kenyan friend.

LANGUAGE INTELLIGENCE:
- Detect and respond in: English, Swahili, or Sheng
- Sheng: "base/kwangu"=home, "low on cash"=offer 20% discount, "sawa/poa"=okay, "nimefika"=arrived, "fiti"=fine, "dredi"=dreadlocks

SECTORS:
1. 💇 SALONS & BEAUTY
   - Services: Haircut 500, Shave 300, Dreadlocks 800, Color 1200, Manicure 800, Pedicure 700, Bridal 8000

2. 🏥 HOSPITALS & CLINICS
   - Services: General Consultation, Specialist Appointment, Lab Tests, Dental, Eye Check

3. 🍽️ RESTAURANTS
   - Services: Table Reservation, Private Event Booking, Takeaway Order

4. 🏢 CORPORATE COMPANIES
   - Services: Meeting Room Booking, Conference Hall, Business Consultation

BRANCHES (Kenya):
- CBD: Tom Mboya St (Mon-Sat 8AM-8PM)
- Westlands: Sarit Centre (Mon-Sun 9AM-9PM)
- Kilimani: Yaya Centre (Mon-Sat 9AM-7PM)
- Mombasa Road: T-Mall (Mon-Sat 8AM-7PM)

LOCATION INTELLIGENCE:
- Westlands/Parklands/Runda → Westlands branch
- CBD/Ngara/Eastleigh → CBD branch
- Kilimani/Lavington → Kilimani branch
- South B/C/Mombasa Rd → Mombasa Rd branch

BOOKING FLOW:
1. Greet user warmly
2. Ask which sector (Salon/Hospital/Restaurant/Corporate)
3. Ask which service
4. Ask preferred date and time
5. Detect location → suggest nearest branch
6. Confirm booking details
7. Generate booking ID: KB + 3 random digits

SENTIMENT: If user seems frustrated → output [HANDOFF_REQUIRED]

RESPONSE FORMAT:
- Max 4 lines
- Use emojis naturally
- End with 2-3 options as [OPTION: text]`;

// ── In-memory conversation history (Task 7) ─────────────────────────────────

const conversations = new Map();

function getHistory(phone) {
  return conversations.get(phone) || [];
}

function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > 20) history.shift();
  conversations.set(phone, history);
}

function clearHistory(phone) {
  conversations.delete(phone);
}

// ── Rafiki AI reply ──────────────────────────────────────────────────────────

async function rafikiReply(phone, userMessage) {
  addToHistory(phone, 'user', userMessage);
  const history = getHistory(phone);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: history,
    });
    const reply = response.content[0].text.trim();
    addToHistory(phone, 'assistant', reply);
    return reply;
  } catch (err) {
    console.error('[Rafiki] AI error:', err.message);
    return 'Pole sana! Kuna tatizo kidogo. Tafadhali jaribu tena. 🙏\n[OPTION: Try again]\n[OPTION: Talk to agent]';
  }
}

// ── Option / tag helpers ─────────────────────────────────────────────────────

function parseOptions(text) {
  const matches = [...text.matchAll(/\[OPTION:\s*(.*?)\]/g)];
  return matches.map(m => m[1].trim());
}

function cleanText(text) {
  return text
    .replace(/\[OPTION:.*?\]/g, '')
    .replace(/\[HANDOFF_REQUIRED\]/g, '')
    .trim();
}

function isHandoffRequired(text) {
  return text.includes('[HANDOFF_REQUIRED]');
}

module.exports = {
  rafikiReply,
  parseOptions,
  cleanText,
  isHandoffRequired,
  getHistory,
  addToHistory,
  clearHistory,
};
