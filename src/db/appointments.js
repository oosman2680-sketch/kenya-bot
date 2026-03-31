'use strict';

const { getDb } = require('./database');

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KE-';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createAppointment({ businessId, customerName, customerPhone, serviceId, serviceName, date, time }) {
  const db = getDb();
  let ref;
  // ensure unique ref
  do {
    ref = generateRef();
  } while (db.prepare('SELECT id FROM appointments WHERE ref_code = ?').get(ref));

  const stmt = db.prepare(`
    INSERT INTO appointments
      (business_id, customer_name, customer_phone, service_id, service_name,
       appointment_date, appointment_time, ref_code)
    VALUES
      (@businessId, @customerName, @customerPhone, @serviceId, @serviceName,
       @date, @time, @ref)
  `);
  const result = stmt.run({ businessId, customerName, customerPhone, serviceId, serviceName, date, time, ref });
  return { id: result.lastInsertRowid, ref };
}

function getAppointmentsByPhone(phone) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM appointments
       WHERE customer_phone = ? AND status = 'confirmed'
       ORDER BY appointment_date, appointment_time`
    )
    .all(phone);
}

function getAppointmentByRef(ref) {
  const db = getDb();
  return db.prepare('SELECT * FROM appointments WHERE ref_code = ?').get(ref);
}

function cancelAppointment(ref) {
  const db = getDb();
  const result = db
    .prepare(`UPDATE appointments SET status = 'cancelled' WHERE ref_code = ? AND status = 'confirmed'`)
    .run(ref);
  return result.changes > 0;
}

// Returns appointments where date is tomorrow and reminder not yet sent
function getAppointmentsDueForReminder() {
  const db = getDb();
  // tomorrow's date in YYYY-MM-DD
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  return db
    .prepare(
      `SELECT a.*, b.name AS biz_name, b.language AS biz_language
       FROM appointments a
       JOIN businesses b ON b.id = a.business_id
       WHERE a.appointment_date = ?
         AND a.status = 'confirmed'
         AND a.reminder_sent = 0`
    )
    .all(dateStr);
}

function markReminderSent(appointmentId) {
  const db = getDb();
  db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(appointmentId);
}

// Check if a slot is already taken
function isSlotTaken(businessId, date, time) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM appointments
       WHERE business_id = ? AND appointment_date = ? AND appointment_time = ?
         AND status = 'confirmed'`
    )
    .get(businessId, date, time);
  return !!row;
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
