'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../data/bookings.json');

// ── File I/O ─────────────────────────────────────────────────────────────────

function ensureFile() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir))  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]', 'utf8');
}

function loadBookings() {
  try {
    ensureFile();
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function persistBookings(bookings) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(bookings, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a booking ID in format KB + 3 digits (e.g. KB089).
 */
function generateBookingId() {
  const bookings = loadBookings();
  const existing = new Set(bookings.map(b => b.id));
  let id;
  do {
    id = 'KB' + String(Math.floor(Math.random() * 900) + 100);
  } while (existing.has(id));
  return id;
}

/**
 * Save a new booking to bookings.json.
 * @param {object} booking
 */
function saveBooking(booking) {
  const bookings = loadBookings();
  bookings.push(booking);
  persistBookings(bookings);
  console.log(`[Booking] Saved ${booking.id} for ${booking.phone}`);
}

/**
 * Get all bookings for a phone number.
 * @param {string} phone - e.g. "+254712345678"
 */
function getBookingsByPhone(phone) {
  return loadBookings().filter(b => b.phone === phone);
}

/**
 * Check if a branch has a conflicting booking at a given datetime.
 * @param {string} branch
 * @param {string} datetime - ISO string e.g. "2026-04-05T10:00:00"
 */
function checkConflict(branch, datetime) {
  return loadBookings().some(
    b => b.branch === branch && b.datetime === datetime && b.status === 'confirmed'
  );
}

/**
 * Update booking status (e.g. to 'completed', 'cancelled').
 * @param {string} id - booking ID like "KB089"
 * @param {string} status
 */
function updateBookingStatus(id, status) {
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx !== -1) {
    bookings[idx].status = status;
    persistBookings(bookings);
  }
}

/**
 * Get bookings for today in Africa/Nairobi timezone.
 */
function getTodaysBookings() {
  const todayNairobi = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  return loadBookings().filter(b => b.datetime && b.datetime.startsWith(todayNairobi));
}

/**
 * Get bookings whose appointment time was 2+ hours ago and are still 'confirmed'.
 * Used to trigger rating requests.
 */
function getBookingsDueForRating() {
  const now = Date.now();
  return loadBookings().filter(b => {
    if (b.status !== 'confirmed' || b.ratingRequested) return false;
    const apptTime = new Date(b.datetime).getTime();
    return now - apptTime >= 2 * 60 * 60 * 1000; // 2 hours past
  });
}

/**
 * Mark a booking as having had its rating request sent.
 * @param {string} id
 */
function markRatingRequested(id) {
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx !== -1) {
    bookings[idx].ratingRequested = true;
    persistBookings(bookings);
  }
}

module.exports = {
  generateBookingId,
  saveBooking,
  getBookingsByPhone,
  checkConflict,
  updateBookingStatus,
  getTodaysBookings,
  getBookingsDueForRating,
  markRatingRequested,
};
