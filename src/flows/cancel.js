'use strict';

const { setSession, clearSession } = require('../bot/session');
const { cancelAppointment, getAppointmentByRef } = require('../db/appointments');
const en = require('../i18n/en');
const sw = require('../i18n/sw');

function t(lang) {
  return lang === 'sw' ? sw : en;
}

/** Validates that input looks like a KE-XXXXX reference code. */
function isValidRefFormat(ref) {
  return /^KE-[A-Z0-9]{5}$/.test(ref);
}

async function handleCancelFlow(phone, userInput, session, business) {
  const lang = session.lang || business.language || 'en';
  const i18n = t(lang);
  const step = session.step || 'ask_ref';

  if (step === 'ask_ref') {
    await setSession(phone, { step: 'do_cancel' });
    return i18n.askCancelRef;
  }

  if (step === 'do_cancel') {
    const ref = (userInput || '').trim().toUpperCase();

    // Basic format check before hitting the DB
    if (!isValidRefFormat(ref)) {
      await clearSession(phone);
      return i18n.cancelNotFound(ref);
    }

    const appointment = await getAppointmentByRef(ref);

    if (!appointment) {
      await clearSession(phone);
      return i18n.cancelNotFound(ref);
    }

    // Only allow cancellation of the user's own appointments
    const normalizedCustomer = appointment.customer_phone.replace(/[^0-9+]/g, '');
    const normalizedSender   = phone.replace('whatsapp:', '').replace(/[^0-9+]/g, '');

    // Loose match — compare last 9 digits
    if (normalizedCustomer.slice(-9) !== normalizedSender.slice(-9)) {
      await clearSession(phone);
      return lang === 'sw'
        ? `Miadi *${ref}* si yako.`
        : `Booking *${ref}* does not belong to your number.`;
    }

    const success = await cancelAppointment(ref);
    await clearSession(phone);
    return success ? i18n.cancelSuccess(ref) : i18n.cancelNotFound(ref);
  }

  await clearSession(phone);
  return t(lang).fallback;
}

module.exports = { handleCancelFlow };
