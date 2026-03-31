'use strict';

function fmt12h(time24) {
  const [hStr, mStr] = time24.split(':');
  const h    = parseInt(hStr, 10);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
}

function friendlyDate(dateStr) {
  const DAYS   = ['Jumapili','Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi'];
  const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ago','Sep','Okt','Nov','Des'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

module.exports = {
  greeting: (bizName) =>
    `👋 Habari! Karibu *${bizName}*.\nNaweza kukusaidia vipi?\n\n` +
    `1️⃣  Panga miadi\n` +
    `2️⃣  Ona miadi yangu\n` +
    `3️⃣  Futa miadi\n` +
    `4️⃣  Wasiliana nasi\n\n` +
    `Jibu na nambari au andika swali lako 😊`,

  askName:  `✏️ Jina lako ni nani?`,
  askPhone: `📱 Nambari yako ya simu? (mfano 0712 345 678)`,

  askService: (services) =>
    `💆 *Unataka huduma gani?*\n\n` +
    services.map((s, i) => `${i + 1}. ${s.name}\n   KES ${s.price} · dakika ${s.duration}`).join('\n\n') +
    `\n\nJibu na nambari 👆`,

  askDateOptions: (days) =>
    `📅 *Unataka kuja lini?*\n\n` +
    days.map((d, i) => `${i + 1}. ${d.label}`).join('\n') +
    `\n\nAu andika tarehe kama *Jumatatu*, *kesho*, au *5 Aprili* ✍️`,

  askTime: (slots, dateStr) => {
    const morning   = slots.filter(s => s < '12:00');
    const afternoon = slots.filter(s => s >= '12:00' && s < '17:00');
    const evening   = slots.filter(s => s >= '17:00');
    const label     = dateStr ? `*${friendlyDate(dateStr)}*` : 'siku hiyo';

    let msg = `⏰ *Chagua muda kwa ${label}:*\n`;
    let n   = 1;
    if (morning.length) {
      msg += `\n🌅 *Asubuhi*\n`;
      morning.forEach(s => { msg += `${n++}. ${fmt12h(s)}\n`; });
    }
    if (afternoon.length) {
      msg += `\n☀️ *Mchana*\n`;
      afternoon.forEach(s => { msg += `${n++}. ${fmt12h(s)}\n`; });
    }
    if (evening.length) {
      msg += `\n🌆 *Jioni*\n`;
      evening.forEach(s => { msg += `${n++}. ${fmt12h(s)}\n`; });
    }
    return msg + `\nJibu na nambari 👆`;
  },

  confirmBooking: (d) =>
    `🗓️ *Karibu kuthibitisha! Tafadhali kagua:*\n\n` +
    `👤 Jina:     ${d.name}\n` +
    `💆 Huduma:   ${d.service}\n` +
    `📅 Tarehe:   ${friendlyDate(d.date)}\n` +
    `⏰ Muda:     ${fmt12h(d.time)}\n` +
    `💰 Bei:      KES ${d.price}\n\n` +
    `Jibu *NDIO* ✅ kuthibitisha au *HAPANA* ❌ kufuta.`,

  bookingConfirmed: (ref) =>
    `🎉 *Umepanga miadi!*\n\n` +
    `Nambari yako ya kumbukumbu: *${ref}*\n\n` +
    `Tutakutumia ukumbusho masaa 24 kabla.\n` +
    `Tutaonana hivi karibuni! 😊`,

  bookingCancelled: `👍 Sawa! Miadi imefutwa.\nAndika *habari* wakati wowote kuanza upya.`,

  noBookings: `📭 Huna miadi inayokuja.\nAndika *weka* kupanga moja!`,

  listBookings: (bookings) =>
    `📋 *Miadi Yako:*\n\n` +
    bookings
      .map(
        (b, i) =>
          `${i + 1}. *${b.service_name}*\n` +
          `   📅 ${friendlyDate(b.appointment_date)} saa ${fmt12h(b.appointment_time)}\n` +
          `   🔖 Kumb: ${b.ref_code} · ${b.status}`
      )
      .join('\n\n'),

  askCancelRef: `🔖 Ingiza nambari ya kumbukumbu ya miadi unayotaka kufuta (mfano *KE-12345*).`,
  cancelSuccess: (ref) => `✅ Miadi *${ref}* imefutwa.`,
  cancelNotFound: (ref) => `❌ Hakuna miadi ilipatikana kwa *${ref}*. Tafadhali angalia kumbukumbu.`,

  reminder: (details) =>
    `⏰ Ukumbusho kutoka *${details.bizName}*\n\n` +
    `Miadi yako ni *kesho!*\n` +
    `💆 Huduma: ${details.service}\n` +
    `📅 Tarehe: ${friendlyDate(details.date)}\n` +
    `⏰ Muda:   ${fmt12h(details.time)}\n\n` +
    `Jibu *FUTA* kukifuta au *THIBITISHA* kuthibitisha.`,

  contact: (biz) =>
    `📍 *${biz.name}*\n\n` +
    `🏠 Anwani: ${biz.address}\n` +
    `📞 Simu:   ${biz.phone}\n` +
    `🕐 Masaa:  ${biz.hours}`,

  fallback:        `🤔 Sikuelewa vizuri.\nAndika *menu* kuona chaguo au niulize swali lolote!`,
  invalidOption:   `❗ Chaguo si sahihi. Tafadhali jibu na moja ya nambari zilizoonyeshwa.`,
  noSlotsAvailable:`😔 Hakuna muda unapatikana kwa siku hiyo. Jaribu siku nyingine!`,
  invalidDate:     `❓ Sikuelewa tarehe hiyo. Jaribu *kesho*, *Jumatatu*, au *5 Aprili*.`,
};
