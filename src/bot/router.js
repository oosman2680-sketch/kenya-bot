'use strict';

const { getSession, setSession, clearSession }     = require('./session');
const { detectIntent }                             = require('./nlp');
const { rafikiReply, parseOptions, cleanText, isHandoffRequired, clearHistory } = require('./claude');
const { handleBookingFlow }                        = require('../flows/booking');
const { handleCancelFlow }                         = require('../flows/cancel');
const { getAppointmentsByPhone }                   = require('../db/appointments');
const { getBusinessBySlug }                        = require('../db/businesses');
const { parseRatingFromMessage, handleRatingReply } = require('./ratings');
const { saveBooking, generateBookingId, checkConflict } = require('./booking');
const en = require('../i18n/en');
const sw = require('../i18n/sw');

function t(lang) {
  return lang === 'sw' ? sw : en;
}

const DEFAULT_BIZ_SLUG = 'glamour-salon';

function sanitizeInput(input, maxLen = 500) {
  return (input || '').replace(/[<>&"'\\]/g, '').trim().slice(0, maxLen);
}

// ── Wrap any string reply into a structured response object ──────────────────

function wrap(text) {
  const options   = parseOptions(text);
  const isHandoff = isHandoffRequired(text);
  const body      = cleanText(text);
  return { text: body, options, isHandoff };
}

// ── Detect booking completion in Rafiki's response and save to JSON ──────────

function extractAndSaveBooking(phone, rawReply) {
  const kbMatch = rawReply.match(/\bKB\d{3}\b/);
  if (!kbMatch) return;

  const id = kbMatch[0];

  // Pull what we can from the reply text (best-effort)
  const serviceMatch  = rawReply.match(/(?:service|appointment|booking)[:\s]+([^\n,]+)/i);
  const branchMatch   = rawReply.match(/(?:branch|location|centre|center)[:\s]+([^\n,]+)/i);
  const datetimeMatch = rawReply.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

  const booking = {
    id,
    phone,
    service:   serviceMatch?.[1]?.trim()  || 'Kenya Services',
    branch:    branchMatch?.[1]?.trim()   || 'Nairobi',
    datetime:  datetimeMatch?.[0]         || new Date().toISOString(),
    status:    'confirmed',
    createdAt: new Date().toISOString(),
  };

  // Avoid saving duplicate IDs
  const { getBookingsByPhone } = require('./booking');
  const existing = getBookingsByPhone(phone).find(b => b.id === id);
  if (!existing) {
    saveBooking(booking);
  }
}

// ── Main router ──────────────────────────────────────────────────────────────

/**
 * Route an incoming WhatsApp message and return a structured reply.
 * @returns {{ text: string, options: string[], isHandoff: boolean }}
 */
async function routeMessage(from, body, bizSlug) {
  const phone = from;
  const input = sanitizeInput(body);
  const slug  = bizSlug || DEFAULT_BIZ_SLUG;

  const business = await getBusinessBySlug(slug);
  if (!business) {
    return wrap('Business not found. Please contact support.');
  }

  let session = await getSession(phone);

  // ── Check for rating reply before anything else ──────────────────────────
  const ratingScore = parseRatingFromMessage(input);
  if (ratingScore !== null) {
    const reply = await handleRatingReply(phone, ratingScore, input);
    return wrap(reply);
  }

  // ── Active structured flow (booking / cancel) ────────────────────────────
  if (session?.flow === 'booking') {
    const lowerInput = input.toLowerCase();
    if (['menu', 'start', 'hello', 'hi', 'habari', 'reset'].includes(lowerInput)) {
      await clearSession(phone);
      clearHistory(phone);
    } else {
      const reply = await handleBookingFlow(phone, input, session, business);
      return wrap(reply);
    }
  }

  if (session?.flow === 'cancel') {
    const lowerInput = input.toLowerCase();
    if (['menu', 'start', 'hello', 'hi', 'habari', 'reset'].includes(lowerInput)) {
      await clearSession(phone);
      clearHistory(phone);
    } else {
      const reply = await handleCancelFlow(phone, input, session, business);
      return wrap(reply);
    }
  }

  // ── Language selection ───────────────────────────────────────────────────
  if (session?.flow === 'lang_select') {
    let chosenLang;
    if (input === '1')      chosenLang = 'en';
    else if (input === '2') chosenLang = 'sw';

    if (chosenLang) {
      await setSession(phone, { flow: null, lang: chosenLang, bizSlug: slug });
      return wrap(t(chosenLang).greeting(business.name));
    }
  }

  // ── Detect intent (keywords first, then Claude) ──────────────────────────
  const lang = session?.lang || business.language || 'en';
  const nlp  = await detectIntent(input, lang);
  const detectedLang = nlp.lang || lang;
  const i18n = t(detectedLang);

  const numericMap = { '1': 'book', '2': 'view_bookings', '3': 'cancel', '4': 'contact' };
  const intent     = numericMap[input] || nlp.intent;

  switch (intent) {
    case 'greeting':
    case 'menu': {
      // Let Rafiki handle the greeting with full personality
      await clearSession(phone);
      clearHistory(phone);
      const rafikiWelcome = await rafikiReply(phone, input);
      extractAndSaveBooking(phone, rafikiWelcome);
      return wrap(rafikiWelcome);
    }

    case 'book': {
      await setSession(phone, {
        flow:    'booking',
        step:    'ask_name',
        lang:    detectedLang,
        bizSlug: slug,
        data:    nlp.date ? { dateFromNlp: nlp.date } : {},
      });
      return wrap(i18n.askName);
    }

    case 'view_bookings': {
      const cleanPhone = phone.replace('whatsapp:', '');
      const bookings   = await getAppointmentsByPhone(cleanPhone);
      return wrap(bookings.length ? i18n.listBookings(bookings) : i18n.noBookings);
    }

    case 'cancel': {
      if (nlp.ref_code) {
        await setSession(phone, {
          flow: 'cancel', step: 'do_cancel', lang: detectedLang, bizSlug: slug,
        });
        const updated = await getSession(phone);
        return wrap(await handleCancelFlow(phone, nlp.ref_code, updated, business));
      }
      await setSession(phone, {
        flow: 'cancel', step: 'ask_ref', lang: detectedLang, bizSlug: slug,
      });
      const updated = await getSession(phone);
      return wrap(await handleCancelFlow(phone, input, updated, business));
    }

    case 'contact': {
      return wrap(i18n.contact({
        name:    business.name,
        address: business.address,
        phone:   business.phone,
        hours:   business.hours,
      }));
    }

    default: {
      // ── Rafiki handles everything else conversationally ────────────────
      if (!session) {
        await setSession(phone, { flow: null, lang: detectedLang, bizSlug: slug });
      }
      const rafikiResponse = await rafikiReply(phone, input);
      extractAndSaveBooking(phone, rafikiResponse);
      return wrap(rafikiResponse);
    }
  }
}

module.exports = { routeMessage };
