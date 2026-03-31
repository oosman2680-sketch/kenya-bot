'use strict';

/**
 * Clinic slots: every 20 minutes, 8am–5pm Mon–Fri.
 */
function getAvailableSlots(date) {
  const day = new Date(date).getDay();
  if (day === 0 || day === 6) return []; // closed weekends

  const slots = [];
  for (let h = 8; h < 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:20`);
    slots.push(`${String(h).padStart(2, '0')}:40`);
  }
  return slots;
}

module.exports = {
  sectorName: 'Clinic',
  slotDuration: 20,
  getAvailableSlots,
};
