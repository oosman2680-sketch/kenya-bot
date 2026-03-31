'use strict';

const { getSession, setSession, clearSession } = require('../bot/session');
const { cancelAppointment, getAppointmentByRef } = require('../db/appointments');
const en = require('../i18n/en');
const sw = require('../i18n/sw');

function t(lang) {
  return lang === 'sw' ? sw : en;
}

async function handleCancelFlow(phone, userInput, session, business) {
  const lang = session.lang || business.language || 'en';
  const i18n = t(lang);
  const step = session.step || 'ask_ref';

  if (step === 'ask_ref') {
    setSession(phone, { step: 'do_cancel' });
    return i18n.askCancelRef;
  }

  if (step === 'do_cancel') {
    const ref = userInput.trim().toUpperCase();
    const appointment = getAppointmentByRef(ref);

    if (!appointment) {
      clearSession(phone);
      return i18n.cancelNotFound(ref);
    }

    // Only allow cancellation of own appointments
    const normalizedInput = phone.replace('whatsapp:', '');
    const normalizedCustomer = appointment.customer_phone.replace(/[^0-9+]/g, '');
    const normalizedSender = normalizedInput.replace(/[^0-9+]/g, '');

    // Loose match — last 9 digits
    const last9Customer = normalizedCustomer.slice(-9);
    const last9Sender = normalizedSender.slice(-9);

    if (last9Customer !== last9Sender) {
      clearSession(phone);
      return lang === 'sw'
        ? `Miadi *${ref}* si yako.`
        : `Booking *${ref}* does not belong to your number.`;
    }

    const success = cancelAppointment(ref);
    clearSession(phone);
    return success ? i18n.cancelSuccess(ref) : i18n.cancelNotFound(ref);
  }

  clearSession(phone);
  return t(lang).fallback;
}

module.exports = { handleCancelFlow };
