'use strict';

const cron = require('node-cron');
const { getAppointmentsDueForReminder, markReminderSent } = require('../db/appointments');
const { sendMessage } = require('../messaging/twilio');
const en = require('../i18n/en');
const sw = require('../i18n/sw');

function t(lang) {
  return lang === 'sw' ? sw : en;
}

/**
 * Starts the 24h reminder cron job.
 * Runs every minute; checks for appointments due tomorrow (Africa/Nairobi / EAT)
 * that haven't been reminded yet. The timezone-aware "tomorrow" calculation lives
 * in appointments.js so reminders trigger correctly even on a UTC server.
 */
function startReminderJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const appointments = await getAppointmentsDueForReminder();
      if (!appointments.length) return;

      console.log(`[Reminder] Sending ${appointments.length} reminder(s)...`);

      for (const appt of appointments) {
        try {
          const lang = appt.biz_language || 'en';
          const message = t(lang).reminder({
            bizName: appt.biz_name,
            service: appt.service_name,
            date:    appt.appointment_date,
            time:    appt.appointment_time,
          });

          const to = appt.customer_phone.startsWith('whatsapp:')
            ? appt.customer_phone
            : `whatsapp:${appt.customer_phone}`;

          await sendMessage(to, message);
          await markReminderSent(appt.id);
          console.log(`[Reminder] Sent for ${appt.ref_code} → ${to}`);
        } catch (err) {
          // Log per-appointment errors but continue processing others
          console.error(`[Reminder] Failed for ${appt.ref_code}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Reminder] Cron error:', err.message);
    }
  });

  console.log('[Reminder] 24h reminder cron job started (EAT timezone).');
}

module.exports = { startReminderJob };
