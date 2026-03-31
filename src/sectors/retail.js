'use strict';

/**
 * Retail service slots: every 30 minutes, 9am–6pm Mon–Sat.
 */
function getAvailableSlots(date) {
  const day = new Date(date).getDay();
  if (day === 0) return []; // closed Sunday

  const slots = [];
  for (let h = 9; h < 18; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

module.exports = {
  sectorName: 'Retail',
  slotDuration: 30,
  getAvailableSlots,
};
