'use strict';

const cron = require('node-cron');

const { getTodaysBookings }  = require('./booking');
const { getAverageRating }   = require('./ratings');
const { sendMessage }        = require('../messaging/whatsapp');

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(isoDatetime) {
  if (!isoDatetime) return '??:??';
  const d = new Date(isoDatetime);
  return d.toLocaleTimeString('en-KE', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Nairobi',
  });
}

function todayLabel() {
  return new Date().toLocaleDateString('en-KE', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    timeZone: 'Africa/Nairobi',
  });
}

// ── Report builder ────────────────────────────────────────────────────────────

function buildReport() {
  const bookings     = getTodaysBookings();
  const confirmed    = bookings.filter(b => b.status === 'confirmed');
  const cancelled    = bookings.filter(b => b.status === 'cancelled');
  const newClients   = new Set(confirmed.map(b => b.phone)).size;
  const avgRating    = getAverageRating() || 'N/A';

  const revenue = confirmed.reduce((sum, b) => sum + (b.price || 0), 0);

  const schedule = confirmed
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
    .slice(0, 10)
    .map(b => `• ${fmtTime(b.datetime)} - ${b.name || 'Customer'} (${b.service || 'N/A'} - ${b.branch || 'N/A'})`)
    .join('\n');

  return (
    `📊 *Daily Report - ${todayLabel()}*\n\n` +
    `📅 Bookings today: ${confirmed.length}\n` +
    `💰 Expected revenue: ${revenue.toLocaleString()} KES\n` +
    `👥 New clients: ${newClients}\n` +
    `⭐ Avg rating: ${avgRating}/5\n` +
    `❌ Cancellations: ${cancelled.length}\n\n` +
    (schedule
      ? `📋 *Today's Schedule:*\n${schedule}`
      : `📋 No appointments scheduled for today.`)
  );
}

// ── Cron job (8 AM Nairobi time) ──────────────────────────────────────────────

function startDailyReportJob() {
  const ownerPhone = process.env.OWNER_PHONE;

  if (!ownerPhone) {
    console.warn('[Report] OWNER_PHONE not set — daily report will only log to console.');
  }

  // "0 8 * * *" = 8:00 AM every day, Africa/Nairobi timezone
  cron.schedule('0 8 * * *', async () => {
    try {
      const report = buildReport();
      console.log('\n' + report + '\n');

      if (ownerPhone) {
        const recipient = ownerPhone.replace(/^\+/, '');
        await sendMessage(recipient, report);
        console.log(`[Report] Daily report sent to owner (${ownerPhone})`);
      }
    } catch (err) {
      console.error('[Report] Failed to send daily report:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });

  console.log('[Report] Daily report job scheduled at 8:00 AM EAT.');
}

module.exports = { startDailyReportJob, buildReport };
