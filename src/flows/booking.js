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

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns up to 7 upcoming non-Sunday days as selectable date options.
 */
function buildDateOptions() {
  const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const options = [];
  const cursor = new Date(today);
  let offset = 0;

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
 * Reduces a 30-min slot list to one slot per hour (every other entry),
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

  // ── Step: ask name ──────────────────────────────────────────────────────
  if (step === 'ask_name') {
    setSession(phone, { step: 'ask_phone', data: { ...session.data, name: input } });
    return i18n.askPhone;
  }

  // ── Step: ask phone ─────────────────────────────────────────────────────
  if (step === 'ask_phone') {
    const customerPhone = input.replace(/\s+/g, '');
    const services      = getServicesByBusiness(business.id);
    setSession(phone, { step: 'ask_service', data: { ...session.data, customerPhone } });
    return i18n.askService(services);
  }

  // ── Step: ask service ───────────────────────────────────────────────────
  if (step === 'ask_service') {
    const services = getServicesByBusiness(business.id);
    const idx      = parseInt(input, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= services.length) {
      return i18n.invalidOption + '\n\n' + i18n.askService(services);
    }
    const chosen      = services[idx];
    const dateOptions = buildDateOptions();

    setSession(phone, {
      step: 'ask_date',
      data: {
        ...session.data,
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
    const dateOptions = session.data.dateOptions || [];
    let parsed = null;

    // Accept numbered choice first
    const idx = parseInt(input, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < dateOptions.length) {
      parsed = dateOptions[idx].date;
    } else {
      // Fall back to natural language / ISO parsing
      parsed = parseDate(input) || session.data.dateFromNlp || null;
    }

    if (!parsed) {
      return i18n.invalidDate + '\n\n' + i18n.askDateOptions(dateOptions);
    }

    // Reject past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(parsed) < today) {
      const pastMsg = lang === 'sw' ? '⚠️ Tarehe hiyo imepita.' : '⚠️ That date is in the past.';
      return pastMsg + '\n\n' + i18n.askDateOptions(dateOptions);
    }

    const sectorConfig = getSectorConfig(business.sector);
    const allSlots     = sectorConfig.getAvailableSlots(parsed);
    const available    = allSlots.filter((s) => !isSlotTaken(business.id, parsed, s));

    if (!available.length) return i18n.noSlotsAvailable;

    const displaySlots = condenseSlots(available);

    setSession(phone, {
      step: 'ask_time',
      data: { ...session.data, date: parsed, availableSlots: displaySlots },
    });
    return i18n.askTime(displaySlots, parsed);
  }

  // ── Step: ask time ──────────────────────────────────────────────────────
  if (step === 'ask_time') {
    const slots = session.data.availableSlots || [];
    const idx   = parseInt(input, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= slots.length) {
      return i18n.invalidOption + '\n\n' + i18n.askTime(slots, session.data.date);
    }
    const chosenTime = slots[idx];
    setSession(phone, { step: 'confirm', data: { ...session.data, time: chosenTime } });
    return i18n.confirmBooking({
      name:    session.data.name,
      service: session.data.serviceName,
      date:    session.data.date,
      time:    chosenTime,
      price:   session.data.servicePrice,
    });
  }

  // ── Step: confirm ───────────────────────────────────────────────────────
  if (step === 'confirm') {
    const upper = input.toUpperCase();
    if (['YES', 'NDIO', 'Y', '1', '✅'].includes(upper)) {
      const d = session.data;

      if (isSlotTaken(business.id, d.date, d.time)) {
        const takenMsg = lang === 'sw' ? '⚠️ Muda huo umechukuliwa.' : '⚠️ That slot was just taken.';
        const dateOptions = buildDateOptions();
        setSession(phone, { step: 'ask_date', data: { ...d, dateOptions } });
        return takenMsg + '\n\n' + i18n.askDateOptions(dateOptions);
      }

      const { ref } = createAppointment({
        businessId:    business.id,
        customerName:  d.name,
        customerPhone: d.customerPhone,
        serviceId:     d.serviceId,
        serviceName:   d.serviceName,
        date:          d.date,
        time:          d.time,
      });

      clearSession(phone);
      return i18n.bookingConfirmed(ref);

    } else if (['NO', 'HAPANA', 'N', '0', 'CANCEL', 'FUTA'].includes(upper)) {
      clearSession(phone);
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
