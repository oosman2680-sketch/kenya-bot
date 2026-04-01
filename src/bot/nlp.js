'use strict';

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5';

// Keyword-based intent map — avoids API calls for common inputs
const KEYWORD_INTENTS = {
  greeting:      ['hi', 'hello', 'hey', 'hola', 'habari', 'hujambo', 'mambo', 'niaje', 'sasa', 'menu', 'start'],
  book:          ['book', 'booking', 'appointment', 'reserve', 'schedule', 'weka', 'panga', 'nafasi'],
  view_bookings: ['my bookings', 'my appointments', 'view', 'check', 'status', 'angalia', 'ona'],
  cancel:        ['cancel', 'cancellation', 'futa', 'acha'],
  contact:       ['contact', 'address', 'location', 'phone', 'number', 'hours', 'anwani', 'simu', 'mahali'],
};

function detectIntentByKeyword(input, lang) {
  const lower = input.toLowerCase().trim();
  for (const [intent, keywords] of Object.entries(KEYWORD_INTENTS)) {
    if (keywords.some(kw => lower === kw || lower.startsWith(kw + ' ') || lower.endsWith(' ' + kw))) {
      return { intent, date: null, ref_code: null, lang, confidence: 0.9 };
    }
  }
  return null;
}

/** Returns today's date string (YYYY-MM-DD) in Africa/Nairobi timezone (EAT, UTC+3). */
function getTodayNairobi() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Detect user intent and normalize date/free-text using Groq.
 * Returns a structured JSON object.
 */
async function detectIntent(userMessage, lang = 'en') {
  // Fast keyword check — skip API for obvious inputs
  const quick = detectIntentByKeyword(userMessage, lang);
  if (quick) return quick;

  const todayNairobi = getTodayNairobi();
  const prompt = `You are a WhatsApp booking assistant for small businesses in Kenya.
User language: ${lang === 'sw' ? 'Swahili' : 'English'}.

Analyze this message and return ONLY valid JSON (no markdown, no explanation):
Message: "${userMessage.replace(/"/g, '\\"')}"

Return JSON with:
{
  "intent": one of ["book", "view_bookings", "cancel", "contact", "menu", "confirm", "deny", "greeting", "unknown"],
  "date": normalized date as "YYYY-MM-DD" if mentioned (today=${todayNairobi}), else null,
  "ref_code": booking reference like "KE-XXXXX" if mentioned, else null,
  "lang": "en" or "sw" based on the message language,
  "confidence": number 0-1
}`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('[NLP] Claude error:', err.message);
    return { intent: 'unknown', date: null, ref_code: null, lang, confidence: 0 };
  }
}

/**
 * Generate a smart contextual reply using Groq when the bot
 * cannot handle the message with a scripted response.
 */
async function generateSmartReply(userMessage, bizName, lang = 'en') {
  const langInstruction =
    lang === 'sw'
      ? 'Reply ONLY in Swahili. Keep it short and friendly.'
      : 'Reply ONLY in English. Keep it short and friendly.';

  const prompt = `You are a helpful WhatsApp booking assistant for "${bizName}" in Kenya.
${langInstruction}
The user said: "${userMessage.replace(/"/g, '\\"')}"
Give a concise, helpful reply (max 3 sentences). Do NOT mention you are AI.`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].text.trim();
  } catch (err) {
    console.error('[NLP] Smart reply error:', err.message);
    return lang === 'sw'
      ? 'Samahani, kuna tatizo. Tafadhali jaribu tena.'
      : 'Sorry, something went wrong. Please try again.';
  }
}

/**
 * Normalize a date string or relative word to YYYY-MM-DD.
 * All "today/tomorrow" calculations use Africa/Nairobi timezone.
 */
function parseDate(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();

  const todayStr = getTodayNairobi();
  const today = new Date(todayStr + 'T00:00:00');

  if (['today', 'leo'].includes(lower)) {
    return todayStr;
  }
  if (['tomorrow', 'kesho'].includes(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  const dayNames = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 0,
    jumatatu: 1, jumanne: 2, jumatano: 3, alhamisi: 4,
    ijumaa: 5, jumamosi: 6, jumapili: 0,
  };

  if (dayNames[lower] !== undefined) {
    const target = dayNames[lower];
    const d = new Date(today);
    const current = d.getDay();
    let diff = target - current;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(lower)) return lower;

  const parts = lower.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

module.exports = { detectIntent, generateSmartReply, parseDate };
