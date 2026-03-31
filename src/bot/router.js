'use strict';

const { getSession, setSession, clearSession } = require('./session');
const { detectIntent, generateSmartReply } = require('./nlp');
const { handleBookingFlow } = require('../flows/booking');
const { handleCancelFlow } = require('../flows/cancel');
const { getAppointmentsByPhone } = require('../db/appointments');
const { getBusinessBySlug } = require('../db/businesses');
const en = require('../i18n/en');
const sw = require('../i18n/sw');

function t(lang) {
  return lang === 'sw' ? sw : en;
}

const LANGUAGE_PROMPT =
  `🌍 *Choose your language / Chagua lugha:*\n\n` +
  `1️⃣ English\n` +
  `2️⃣ Kiswahili`;

const DEFAULT_BIZ_SLUG = 'glamour-salon';

/** Strip HTML/injection characters and cap length. */
function sanitizeInput(input, maxLen = 500) {
  return (input || '').replace(/[<>&"'\\]/g, '').trim().slice(0, maxLen);
}

/**
 * Main message router.
 * @param {string} from     - sender phone e.g. 'whatsapp:+254712345678'
 * @param {string} body     - message text
 * @param {string} bizSlug  - business slug from webhook query param
 * @returns {Promise<string>} - reply message
 */
async function routeMessage(from, body, bizSlug) {
  const phone = from;
  const input = sanitizeInput(body);
  const slug  = bizSlug || DEFAULT_BIZ_SLUG;

  const business = await getBusinessBySlug(slug);
  if (!business) {
    return 'Business not found. Please contact support.';
  }

  let session = await getSession(phone);

  // New conversation — show language picker
  if (!session) {
    await setSession(phone, { flow: 'lang_select', bizSlug: slug });
    return LANGUAGE_PROMPT;
  }

  // Handle language selection
  if (session.flow === 'lang_select') {
    let chosenLang;
    if (input === '1') chosenLang = 'en';
    else if (input === '2') chosenLang = 'sw';
    else return LANGUAGE_PROMPT;

    await setSession(phone, { flow: null, lang: chosenLang, bizSlug: slug });
    return t(chosenLang).greeting(business.name);
  }

  const lang = session.lang || business.language || 'en';

  // Escape words always restart the conversation
  if (session.flow) {
    const lowerInput = input.toLowerCase();
    if (['menu', 'start', 'hello', 'hi', 'habari', 'hujambo', 'reset'].includes(lowerInput)) {
      await clearSession(phone);
      await setSession(phone, { flow: 'lang_select', bizSlug: slug });
      return LANGUAGE_PROMPT;
    }

    if (session.flow === 'booking') {
      return await handleBookingFlow(phone, input, session, business);
    }
    if (session.flow === 'cancel') {
      return await handleCancelFlow(phone, input, session, business);
    }
  }

  // Detect intent via NLP
  const nlp = await detectIntent(input, lang);
  const detectedLang = nlp.lang || lang;
  const i18n = t(detectedLang);

  // Numeric menu shortcuts take priority
  const numericMap = { '1': 'book', '2': 'view_bookings', '3': 'cancel', '4': 'contact' };
  const intent = numericMap[input] || nlp.intent;

  switch (intent) {
    case 'greeting':
    case 'menu': {
      await clearSession(phone);
      await setSession(phone, { flow: 'lang_select', bizSlug: slug });
      return LANGUAGE_PROMPT;
    }

    case 'book': {
      await setSession(phone, {
        flow:    'booking',
        step:    'ask_name',
        lang:    detectedLang,
        bizSlug: slug,
        data:    nlp.date ? { dateFromNlp: nlp.date } : {},
      });
      return i18n.askName;
    }

    case 'view_bookings': {
      const cleanPhone = phone.replace('whatsapp:', '');
      const bookings   = await getAppointmentsByPhone(cleanPhone);
      return bookings.length ? i18n.listBookings(bookings) : i18n.noBookings;
    }

    case 'cancel': {
      if (nlp.ref_code) {
        await setSession(phone, {
          flow: 'cancel', step: 'do_cancel', lang: detectedLang, bizSlug: slug,
        });
        const updated = await getSession(phone);
        return await handleCancelFlow(phone, nlp.ref_code, updated, business);
      }
      await setSession(phone, {
        flow: 'cancel', step: 'ask_ref', lang: detectedLang, bizSlug: slug,
      });
      const updated = await getSession(phone);
      return await handleCancelFlow(phone, input, updated, business);
    }

    case 'contact': {
      return i18n.contact({
        name:    business.name,
        address: business.address,
        phone:   business.phone,
        hours:   business.hours,
      });
    }

    default: {
      return await generateSmartReply(input, business.name, detectedLang);
    }
  }
}

module.exports = { routeMessage };
