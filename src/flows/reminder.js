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
 * Starts the reminder cron job.
 * Runs every minute, checks for appointments tomorrow that haven't been reminded.
 */
function startReminderJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const appointments = getAppointmentsDueForReminder();
      if (!appointments.length) return;

      console.log(`[Reminder] Found ${appointments.length} appointment(s) to remind.`);

      for (const appt of appointments) {
        const lang = appt.biz_language || 'en';
        const i18n = t(lang);

        const message = i18n.reminder({
          bizName: appt.biz_name,
          service: appt.service_name,
          date: appt.appointment_date,
          time: appt.appointment_time,
        });

        const to = appt.customer_phone.startsWith('whatsapp:')
          ? appt.customer_phone
          : `whatsapp:${appt.customer_phone}`;

        await sendMessage(to, message);
        markReminderSent(appt.id);
        console.log(`[Reminder] Sent reminder for appointment ${appt.ref_code} to ${to}`);
      }
    } catch (err) {
      console.error('[Reminder] Error in cron job:', err.message);
    }
  });

  console.log('[Reminder] 24h reminder cron job started.');
}

module.exports = { startReminderJob };
