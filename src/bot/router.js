'use strict';

const { getSession, setSession, clearSession } = require('./session');
const { detectIntent, generateSmartReply, parseDate } = require('./nlp');
const { handleBookingFlow } = require('../flows/booking');
const { handleCancelFlow } = require('../flows/cancel');
const { getAppointmentsByPhone } = require('../db/appointments');
const { getBusinessBySlug, getBusinessById } = require('../db/businesses');
const en = require('../i18n/en');
const sw = require('../i18n/sw');

function t(lang) {
  return lang === 'sw' ? sw : en;
}

const LANGUAGE_PROMPT =
  `🌍 *Choose your language / Chagua lugha:*\n\n` +
  `1️⃣ English\n` +
  `2️⃣ Kiswahili`;

/**
 * Default business slug — used when no specific business is embedded in the webhook URL.
 * In production each business gets its own webhook URL with ?biz=their-slug.
 */
const DEFAULT_BIZ_SLUG = 'glamour-salon';

/**
 * Main message router.
 * @param {string} from       - sender phone e.g. 'whatsapp:+254712345678'
 * @param {string} body       - message text
 * @param {string} bizSlug    - business slug from query param
 * @returns {string}          - reply message
 */
async function routeMessage(from, body, bizSlug) {
  const phone = from;
  const input = (body || '').trim();
  const slug = bizSlug || DEFAULT_BIZ_SLUG;

  const business = getBusinessBySlug(slug);
  if (!business) {
    return 'Business not found. Please contact support.';
  }

  let session = getSession(phone);

  // New conversation — show language picker
  if (!session) {
    setSession(phone, { flow: 'lang_select', bizSlug: slug });
    return LANGUAGE_PROMPT;
  }

  // Handle language selection
  if (session.flow === 'lang_select') {
    let chosenLang;
    if (input === '1') chosenLang = 'en';
    else if (input === '2') chosenLang = 'sw';
    else return LANGUAGE_PROMPT; // invalid — re-prompt

    setSession(phone, { flow: null, lang: chosenLang, bizSlug: slug });
    return t(chosenLang).greeting(business.name);
  }

  // Determine language — use session lang, else business default
  const lang = session.lang || business.language || 'en';
  const i18n = t(lang);

  // If user is mid-flow, continue that flow
  if (session.flow) {
    // Escape words restart the conversation — go back to language picker
    const lowerInput = input.toLowerCase();
    if (['menu', 'start', 'hello', 'hi', 'habari', 'hujambo', 'reset'].includes(lowerInput)) {
      clearSession(phone);
      setSession(phone, { flow: 'lang_select', bizSlug: slug });
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

  // Update lang if NLP detected different language
  const detectedLang = nlp.lang || lang;
  const i18nFinal = t(detectedLang);

  // Handle numeric menu shortcuts first (before NLP for speed)
  const numericMap = { '1': 'book', '2': 'view_bookings', '3': 'cancel', '4': 'contact' };
  const intent = numericMap[input] || nlp.intent;

  switch (intent) {
    case 'greeting':
    case 'menu': {
      clearSession(phone);
      setSession(phone, { flow: 'lang_select', bizSlug: slug });
      return LANGUAGE_PROMPT;
    }

    case 'book': {
      setSession(phone, {
        flow: 'booking',
        step: 'ask_name',
        lang: detectedLang,
        bizSlug: slug,
        data: {},
        // Pre-fill date if NLP extracted one
        ...(nlp.date ? { data: { dateFromNlp: nlp.date } } : {}),
      });
      return i18nFinal.askName;
    }

    case 'view_bookings': {
      const cleanPhone = phone.replace('whatsapp:', '');
      const bookings = getAppointmentsByPhone(cleanPhone);
      if (!bookings.length) return i18nFinal.noBookings;
      return i18nFinal.listBookings(bookings);
    }

    case 'cancel': {
      // If NLP already extracted a ref code, jump straight to cancellation
      if (nlp.ref_code) {
        setSession(phone, {
          flow: 'cancel',
          step: 'do_cancel',
          lang: detectedLang,
          bizSlug: slug,
        });
        return await handleCancelFlow(phone, nlp.ref_code, getSession(phone), business);
      }
      setSession(phone, {
        flow: 'cancel',
        step: 'ask_ref',
        lang: detectedLang,
        bizSlug: slug,
      });
      return await handleCancelFlow(phone, input, getSession(phone), business);
    }

    case 'contact': {
      return i18nFinal.contact({
        name: business.name,
        address: business.address,
        phone: business.phone,
        hours: business.hours,
      });
    }

    default: {
      // Fall back to Gemini smart reply
      const smart = await generateSmartReply(input, business.name, detectedLang);
      return smart;
    }
  }
}

module.exports = { routeMessage };
