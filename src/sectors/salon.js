'use strict';

/**
 * Generates available time slots for a salon on a given date.
 * Slots: every 30 minutes, 8am–7pm Mon–Sat.
 */
function getAvailableSlots(date) {
  const day = new Date(date).getDay(); // 0=Sun
  if (day === 0) return []; // closed Sunday

  const slots = [];
  for (let h = 8; h < 19; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

module.exports = {
  sectorName: 'Salon',
  slotDuration: 30,
  getAvailableSlots,
};
