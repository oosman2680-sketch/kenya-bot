'use strict';

function fmt12h(time24) {
  const [hStr, mStr] = time24.split(':');
  const h    = parseInt(hStr, 10);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
}

function friendlyDate(dateStr) {
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

module.exports = {
  greeting: (bizName) =>
    `👋 Hello! Welcome to *${bizName}*.\nHow can I help you today?\n\n` +
    `1️⃣  Book an appointment\n` +
    `2️⃣  View my bookings\n` +
    `3️⃣  Cancel a booking\n` +
    `4️⃣  Contact us\n\n` +
    `Reply with a number or just type your question 😊`,

  askName:  `✏️ What's your full name?`,
  askPhone: `📱 What's your phone number? (e.g. 0712 345 678)`,

  askService: (services) =>
    `💆 *What service would you like?*\n\n` +
    services.map((s, i) => `${i + 1}. ${s.name}\n   KES ${s.price} · ${s.duration} min`).join('\n\n') +
    `\n\nReply with a number 👆`,

  askDateOptions: (days) =>
    `📅 *When would you like to come?*\n\n` +
    days.map((d, i) => `${i + 1}. ${d.label}`).join('\n') +
    `\n\nOr type a date like *Monday*, *next Friday*, or *5 April* ✍️`,

  askTime: (slots, dateStr) => {
    const morning   = slots.filter(s => s < '12:00');
    const afternoon = slots.filter(s => s >= '12:00' && s < '17:00');
    const evening   = slots.filter(s => s >= '17:00');
    const label     = dateStr ? `*${friendlyDate(dateStr)}*` : 'that day';

    let msg = `⏰ *Pick a time for ${label}:*\n`;
    let n   = 1;
    if (morning.length) {
      msg += `\n🌅 *Morning*\n`;
      morning.forEach(s => { msg += `${n++}. ${fmt12h(s)}\n`; });
    }
    if (afternoon.length) {
      msg += `\n☀️ *Afternoon*\n`;
      afternoon.forEach(s => { msg += `${n++}. ${fmt12h(s)}\n`; });
    }
    if (evening.length) {
      msg += `\n🌆 *Evening*\n`;
      evening.forEach(s => { msg += `${n++}. ${fmt12h(s)}\n`; });
    }
    return msg + `\nReply with a number 👆`;
  },

  confirmBooking: (d) =>
    `🗓️ *Almost done! Please confirm:*\n\n` +
    `👤 Name:     ${d.name}\n` +
    `💆 Service:  ${d.service}\n` +
    `📅 Date:     ${friendlyDate(d.date)}\n` +
    `⏰ Time:     ${fmt12h(d.time)}\n` +
    `💰 Price:    KES ${d.price}\n\n` +
    `Reply *YES* ✅ to confirm or *NO* ❌ to cancel.`,

  bookingConfirmed: (ref) =>
    `🎉 *You're booked!*\n\n` +
    `Your reference: *${ref}*\n\n` +
    `We'll send you a reminder 24 hours before.\n` +
    `See you soon! 😊`,

  bookingCancelled: `👍 No problem! Booking cancelled.\nType *hi* anytime to start again.`,

  noBookings: `📭 You have no upcoming bookings.\nType *book* to schedule one!`,

  listBookings: (bookings) =>
    `📋 *Your Bookings:*\n\n` +
    bookings
      .map(
        (b, i) =>
          `${i + 1}. *${b.service_name}*\n` +
          `   📅 ${friendlyDate(b.appointment_date)} at ${fmt12h(b.appointment_time)}\n` +
          `   🔖 Ref: ${b.ref_code} · ${b.status}`
      )
      .join('\n\n'),

  askCancelRef: `🔖 Enter the booking reference to cancel (e.g. *KE-12345*).`,
  cancelSuccess: (ref) => `✅ Booking *${ref}* has been cancelled.`,
  cancelNotFound: (ref) => `❌ No booking found for *${ref}*. Please double-check the reference.`,

  reminder: (details) =>
    `⏰ Reminder from *${details.bizName}*\n\n` +
    `Your appointment is *tomorrow!*\n` +
    `💆 Service: ${details.service}\n` +
    `📅 Date:    ${friendlyDate(details.date)}\n` +
    `⏰ Time:    ${fmt12h(details.time)}\n\n` +
    `Reply *CANCEL* to cancel or *CONFIRM* to confirm.`,

  contact: (biz) =>
    `📍 *${biz.name}*\n\n` +
    `🏠 Address: ${biz.address}\n` +
    `📞 Phone:   ${biz.phone}\n` +
    `🕐 Hours:   ${biz.hours}`,

  fallback:        `🤔 I didn't quite get that.\nType *menu* to see options or ask me anything!`,
  invalidOption:   `❗ Invalid choice. Please reply with one of the numbers shown.`,
  noSlotsAvailable:`😔 No slots available for that date. Try another day!`,
  invalidDate:     `❓ I couldn't understand that date. Try *tomorrow*, *Monday*, or *5 April*.`,
};
