'use strict';

const { pool } = require('./database');

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KE-';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Returns tomorrow's date string (YYYY-MM-DD) in Africa/Nairobi timezone (EAT, UTC+3). */
function getTomorrowNairobi() {
  const todayNairobi = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const d = new Date(todayNairobi + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function createAppointment({ businessId, customerName, customerPhone, serviceId, serviceName, date, time }) {
  let ref;
  for (let attempts = 0; attempts < 10; attempts++) {
    const candidate = generateRef();
    const { rows } = await pool.query('SELECT id FROM appointments WHERE ref_code = $1', [candidate]);
    if (rows.length === 0) { ref = candidate; break; }
  }
  if (!ref) throw new Error('Failed to generate a unique booking reference. Please try again.');

  const { rows } = await pool.query(
    `INSERT INTO appointments
       (business_id, customer_name, customer_phone, service_id, service_name,
        appointment_date, appointment_time, ref_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [businessId, customerName, customerPhone, serviceId, serviceName, date, time, ref]
  );
  return { id: rows[0].id, ref };
}

async function getAppointmentsByPhone(phone) {
  const { rows } = await pool.query(
    `SELECT * FROM appointments
     WHERE customer_phone = $1 AND status = 'confirmed'
     ORDER BY appointment_date, appointment_time`,
    [phone]
  );
  return rows;
}

async function getAppointmentByRef(ref) {
  const { rows } = await pool.query(
    'SELECT * FROM appointments WHERE ref_code = $1',
    [ref]
  );
  return rows[0] || null;
}

async function cancelAppointment(ref) {
  const { rowCount } = await pool.query(
    `UPDATE appointments SET status = 'cancelled'
     WHERE ref_code = $1 AND status = 'confirmed'`,
    [ref]
  );
  return rowCount > 0;
}

/** Returns confirmed appointments for tomorrow (EAT) that haven't been reminded yet. */
async function getAppointmentsDueForReminder() {
  const dateStr = getTomorrowNairobi();
  const { rows } = await pool.query(
    `SELECT a.*, b.name AS biz_name, b.language AS biz_language
     FROM appointments a
     JOIN businesses b ON b.id = a.business_id
     WHERE a.appointment_date = $1
       AND a.status = 'confirmed'
       AND a.reminder_sent = false`,
    [dateStr]
  );
  return rows;
}

async function markReminderSent(appointmentId) {
  await pool.query(
    'UPDATE appointments SET reminder_sent = true WHERE id = $1',
    [appointmentId]
  );
}

async function isSlotTaken(businessId, date, time) {
  const { rows } = await pool.query(
    `SELECT id FROM appointments
     WHERE business_id = $1
       AND appointment_date = $2
       AND appointment_time = $3
       AND status = 'confirmed'`,
    [businessId, date, time]
  );
  return rows.length > 0;
}

module.exports = {
  createAppointment,
  getAppointmentsByPhone,
  getAppointmentByRef,
  cancelAppointment,
  getAppointmentsDueForReminder,
  markReminderSent,
  isSlotTaken,
};
