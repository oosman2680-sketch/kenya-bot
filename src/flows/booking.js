'use strict';

const { getSession, setSession, clearSession } = require('../bot/session');
const { getServicesByBusiness } = require('../db/businesses');
const { createAppointment, isSlotTaken } = require('../db/appointments');
const { getSectorConfig } = require('../sectors');
const { parseDate } = require('../bot/nlp');
const en = require('../i18n/en');
const sw = require('../i18n/sw');

function t(lang) {
  return lang === 'sw' ? sw : en;
}

// ─── Input sanitization ──────────────────────────────────────────────────────

/** Strip HTML characters and limit length. Returns null if too short. */
function sanitizeName(input) {
  const clean = (input || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 100);
  return clean.length >= 2 ? clean : null;
}

/** Validate a phone number — strips formatting, accepts 7–15 digit patterns. */
function sanitizePhone(input) {
  const clean = (input || '').replace(/[\s\-\(\)\.]/g, '');
  if (!/^\+?\d{7,15}$/.test(clean)) return null;
  return clean;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Returns today as a Date object anchored to midnight in Africa/Nairobi. */
function getTodayNairobi() {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Returns up to 7 upcoming non-Sunday days as selectable date options.
 * Dates are computed in Africa/Nairobi timezone.
 */
function buildDateOptions() {
  const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today  = getTodayNairobi();

  const options = [];
  const cursor  = new Date(today);
  let offset    = 0;

  while (options.length < 7 && offset < 14) {
    const dow = cursor.getDay();
    if (dow !== 0) { // skip Sunday
      const dateStr = cursor.toISOString().slice(0, 10);
      const dayName = DAYS[dow];
      const month   = MONTHS[cursor.getMonth()];
      let label;
      if (offset === 0)      label = `Today (${dayName} ${cursor.getDate()} ${month})`;
      else if (offset === 1) label = `Tomorrow (${dayName} ${cursor.getDate()} ${month})`;
      else                   label = `${dayName}, ${cursor.getDate()} ${month}`;
      options.push({ label, date: dateStr });
    }
    cursor.setDate(cursor.getDate() + 1);
    offset++;
  }
  return options;
}

/**
 * Reduces a slot list to one slot per hour (every other entry),
 * capped at 9 slots so the time menu stays compact.
 */
function condenseSlots(slots) {
  return slots.filter((_, i) => i % 2 === 0).slice(0, 9);
}

// ─── Main flow ───────────────────────────────────────────────────────────────

async function handleBookingFlow(phone, userInput, session, business) {
  const lang  = session.lang || business.language || 'en';
  const i18n  = t(lang);
  const step  = session.step || 'ask_name';
  const input = (userInput || '').trim();
  const data  = session.data || {};

  // ── Step: ask name ──────────────────────────────────────────────────────
  if (step === 'ask_name') {
    const name = sanitizeName(input);
    if (!name) {
      const msg = lang === 'sw'
        ? '⚠️ Tafadhali ingiza jina halali (herufi 2 au zaidi).'
        : '⚠️ Please enter a valid name (at least 2 characters).';
      return msg;
    }
    await setSession(phone, { step: 'ask_phone', data: { ...data, name } });
    return i18n.askPhone;
  }

  // ── Step: ask phone ─────────────────────────────────────────────────────
  if (step === 'ask_phone') {
    const customerPhone = sanitizePhone(input);
    if (!customerPhone) {
      const msg = lang === 'sw'
        ? '⚠️ Nambari ya simu si sahihi. Jaribu tena (mfano 0712345678).'
        : '⚠️ Invalid phone number. Please try again (e.g. 0712345678).';
      return msg;
    }
    const services = await getServicesByBusiness(business.id);
    await setSession(phone, { step: 'ask_service', data: { ...data, customerPhone } });
    return i18n.askService(services);
  }

  // ── Step: ask service ───────────────────────────────────────────────────
  if (step === 'ask_service') {
    const services = await getServicesByBusiness(business.id);
    const idx      = parseInt(input, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= services.length) {
      return i18n.invalidOption + '\n\n' + i18n.askService(services);
    }
    const chosen      = services[idx];
    const dateOptions = buildDateOptions();

    await setSession(phone, {
      step: 'ask_date',
      data: {
        ...data,
        serviceId:    chosen.id,
        serviceName:  chosen.name,
        servicePrice: chosen.price,
        dateOptions,
      },
    });
    return i18n.askDateOptions(dateOptions);
  }

  // ── Step: ask date ──────────────────────────────────────────────────────
  if (step === 'ask_date') {
    const dateOptions = data.dateOptions || [];
    let parsed = null;

    const idx = parseInt(input, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < dateOptions.length) {
      parsed = dateOptions[idx].date;
    } else {
      parsed = parseDate(input) || data.dateFromNlp || null;
    }

    if (!parsed) {
      return i18n.invalidDate + '\n\n' + i18n.askDateOptions(dateOptions);
    }

    // Reject past dates (compared in EAT)
    const todayNairobi = getTodayNairobi();
    if (new Date(parsed + 'T00:00:00') < todayNairobi) {
      const pastMsg = lang === 'sw' ? '⚠️ Tarehe hiyo imepita.' : '⚠️ That date is in the past.';
      return pastMsg + '\n\n' + i18n.askDateOptions(dateOptions);
    }

    const sectorConfig = getSectorConfig(business.sector);
    const allSlots     = sectorConfig.getAvailableSlots(parsed);
    const takenChecks  = await Promise.all(allSlots.map(s => isSlotTaken(business.id, parsed, s)));
    const available    = allSlots.filter((_, i) => !takenChecks[i]);

    if (!available.length) return i18n.noSlotsAvailable;

    const displaySlots = condenseSlots(available);

    await setSession(phone, {
      step: 'ask_time',
      data: { ...data, date: parsed, availableSlots: displaySlots },
    });
    return i18n.askTime(displaySlots, parsed);
  }

  // ── Step: ask time ──────────────────────────────────────────────────────
  if (step === 'ask_time') {
    const slots = data.availableSlots || [];
    const idx   = parseInt(input, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= slots.length) {
      return i18n.invalidOption + '\n\n' + i18n.askTime(slots, data.date);
    }
    const chosenTime = slots[idx];
    await setSession(phone, { step: 'confirm', data: { ...data, time: chosenTime } });
    return i18n.confirmBooking({
      name:    data.name,
      service: data.serviceName,
      date:    data.date,
      time:    chosenTime,
      price:   data.servicePrice,
    });
  }

  // ── Step: confirm ───────────────────────────────────────────────────────
  if (step === 'confirm') {
    const upper = input.toUpperCase();
    if (['YES', 'NDIO', 'Y', '1', '✅'].includes(upper)) {
      const d = data;

      if (await isSlotTaken(business.id, d.date, d.time)) {
        const takenMsg = lang === 'sw' ? '⚠️ Muda huo umechukuliwa.' : '⚠️ That slot was just taken.';
        const dateOptions = buildDateOptions();
        await setSession(phone, { step: 'ask_date', data: { ...d, dateOptions } });
        return takenMsg + '\n\n' + i18n.askDateOptions(dateOptions);
      }

      const { ref } = await createAppointment({
        businessId:    business.id,
        customerName:  d.name,
        customerPhone: d.customerPhone,
        serviceId:     d.serviceId,
        serviceName:   d.serviceName,
        date:          d.date,
        time:          d.time,
      });

      await clearSession(phone);
      return i18n.bookingConfirmed(ref);

    } else if (['NO', 'HAPANA', 'N', '0', 'CANCEL', 'FUTA'].includes(upper)) {
      await clearSession(phone);
      return i18n.bookingCancelled;
    } else {
      return lang === 'sw'
        ? 'Tafadhali jibu *NDIO* au *HAPANA*.'
        : 'Please reply *YES* to confirm or *NO* to cancel.';
    }
  }

  return i18n.fallback;
}

module.exports = { handleBookingFlow };
