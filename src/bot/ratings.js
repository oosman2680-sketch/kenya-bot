'use strict';

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');

const { getBookingsDueForRating, markRatingRequested } = require('./booking');
const { sendButtons } = require('../messaging/whatsapp');

const FILE = path.join(__dirname, '../../data/ratings.json');

// ── File I/O ─────────────────────────────────────────────────────────────────

function ensureFile() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir))  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]', 'utf8');
}

function loadRatings() {
  try {
    ensureFile();
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function persistRatings(ratings) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(ratings, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a rating submitted by a customer.
 * @param {object} rating - { bookingId, phone, score, label, createdAt }
 */
function saveRating(rating) {
  const ratings = loadRatings();
  ratings.push(rating);
  persistRatings(ratings);
  console.log(`[Ratings] Saved rating ${rating.score} for booking ${rating.bookingId}`);
}

/**
 * Get average rating across all stored ratings.
 * Returns null if no ratings exist.
 */
function getAverageRating() {
  const ratings = loadRatings();
  if (!ratings.length) return null;
  const total = ratings.reduce((sum, r) => sum + (r.score || 0), 0);
  return (total / ratings.length).toFixed(1);
}

// ── Rating request cron (every 5 min) ────────────────────────────────────────

function startRatingJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const due = getBookingsDueForRating();
      if (!due.length) return;

      console.log(`[Ratings] Sending ${due.length} rating request(s)...`);

      for (const booking of due) {
        try {
          const phone = booking.phone.replace(/^\+/, ''); // strip leading +

          await sendButtons(
            phone,
            `⭐ How was your experience at Kenya Services?\n\nBooking ${booking.id} · ${booking.service || 'your appointment'}`,
            ['⭐⭐⭐⭐⭐ Excellent', '⭐⭐⭐⭐ Good', '⭐⭐⭐ Average']
          );

          markRatingRequested(booking.id);
          console.log(`[Ratings] Sent request for ${booking.id} → ${booking.phone}`);
        } catch (err) {
          console.error(`[Ratings] Failed for ${booking.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Ratings] Cron error:', err.message);
    }
  });

  console.log('[Ratings] Rating request job started (every 5 min).');
}

// ── Handle incoming rating reply ──────────────────────────────────────────────

const RATING_SCORES = {
  'excellent': 5,
  '⭐⭐⭐⭐⭐': 5,
  'good': 4,
  '⭐⭐⭐⭐': 4,
  'average': 3,
  '⭐⭐⭐': 3,
};

/**
 * Detect if a message is a rating reply and return the score, or null.
 * @param {string} text
 * @returns {number|null}
 */
function parseRatingFromMessage(text) {
  const lower = text.toLowerCase().trim();
  for (const [key, score] of Object.entries(RATING_SCORES)) {
    if (lower.includes(key)) return score;
  }
  return null;
}

/**
 * Handle a rating reply from a user. Saves it and alerts owner if score < 3.
 * @param {string} phone
 * @param {number} score
 * @param {string} label - original button text
 */
async function handleRatingReply(phone, score, label) {
  const { sendMessage } = require('../messaging/whatsapp');

  // Find the most recent booking for this phone
  const { getBookingsByPhone } = require('./booking');
  const bookings = getBookingsByPhone(phone);
  const latest   = bookings.reverse().find(b => b.ratingRequested);

  saveRating({
    bookingId:  latest?.id || 'unknown',
    phone,
    score,
    label,
    createdAt:  new Date().toISOString(),
  });

  // Alert owner if low rating
  const ownerPhone = process.env.OWNER_PHONE;
  if (score < 3 && ownerPhone) {
    try {
      await sendMessage(
        ownerPhone.replace(/^\+/, ''),
        `⚠️ Low rating alert!\n\nCustomer: ${phone}\nBooking: ${latest?.id || 'N/A'}\nRating: ${score}/5 (${label})\n\nPlease follow up ASAP.`
      );
      console.log(`[Ratings] Low-rating alert sent to owner for ${phone}`);
    } catch (err) {
      console.error('[Ratings] Failed to alert owner:', err.message);
    }
  }

  return score >= 3
    ? 'Asante sana! 🙏 Your feedback means a lot to us. See you next time! 😊'
    : 'Pole sana for the experience. 😔 Our team will reach out to make it right. Asante for the feedback!';
}

module.exports = {
  saveRating,
  getAverageRating,
  startRatingJob,
  parseRatingFromMessage,
  handleRatingReply,
};
