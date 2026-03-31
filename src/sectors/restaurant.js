'use strict';

/**
 * Restaurant reservation slots: every 30 minutes, 11am–9pm daily.
 */
function getAvailableSlots(date) {
  const slots = [];
  for (let h = 11; h < 21; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

module.exports = {
  sectorName: 'Restaurant',
  slotDuration: 90,
  getAvailableSlots,
};
