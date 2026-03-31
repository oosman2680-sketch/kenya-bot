'use strict';

const { DatabaseSync: Database } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/kenya_bot.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT    NOT NULL UNIQUE,
      name        TEXT    NOT NULL,
      sector      TEXT    NOT NULL,
      phone       TEXT,
      address     TEXT,
      hours       TEXT,
      language    TEXT    NOT NULL DEFAULT 'en',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS services (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id  INTEGER NOT NULL REFERENCES businesses(id),
      name         TEXT    NOT NULL,
      price        INTEGER NOT NULL,
      duration     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id       INTEGER NOT NULL REFERENCES businesses(id),
      customer_name     TEXT    NOT NULL,
      customer_phone    TEXT    NOT NULL,
      service_id        INTEGER NOT NULL REFERENCES services(id),
      service_name      TEXT    NOT NULL,
      appointment_date  TEXT    NOT NULL,
      appointment_time  TEXT    NOT NULL,
      status            TEXT    NOT NULL DEFAULT 'confirmed',
      ref_code          TEXT    NOT NULL UNIQUE,
      reminder_sent     INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_phone
      ON appointments(customer_phone);

    CREATE INDEX IF NOT EXISTS idx_appointments_date
      ON appointments(appointment_date);

    CREATE INDEX IF NOT EXISTS idx_appointments_reminder
      ON appointments(reminder_sent, appointment_date, status);
  `);

  seedDefaultBusinesses();
}

function seedDefaultBusinesses() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM businesses').get();
  if (count.c > 0) return;

  const insertBiz = db.prepare(`
    INSERT INTO businesses (slug, name, sector, phone, address, hours, language)
    VALUES (@slug, @name, @sector, @phone, @address, @hours, @language)
  `);
  const insertSvc = db.prepare(`
    INSERT INTO services (business_id, name, price, duration)
    VALUES (@business_id, @name, @price, @duration)
  `);

  db.exec('BEGIN');
  try {
    const salon = insertBiz.run({
      slug: 'glamour-salon',
      name: 'Glamour Salon Nairobi',
      sector: 'salon',
      phone: '+254700000001',
      address: 'Westlands, Nairobi',
      hours: 'Mon-Sat 8am-7pm',
      language: 'en',
    });
    [
      { name: 'Haircut', price: 500, duration: 30 },
      { name: 'Hair Braiding', price: 1500, duration: 120 },
      { name: 'Manicure', price: 700, duration: 45 },
      { name: 'Pedicure', price: 800, duration: 45 },
      { name: 'Full Makeup', price: 2500, duration: 60 },
    ].forEach((s) => insertSvc.run({ business_id: salon.lastInsertRowid, ...s }));

    const clinic = insertBiz.run({
      slug: 'afya-clinic',
      name: 'Afya Community Clinic',
      sector: 'clinic',
      phone: '+254700000002',
      address: 'Kibera, Nairobi',
      hours: 'Mon-Fri 8am-5pm',
      language: 'sw',
    });
    [
      { name: 'General Consultation', price: 500, duration: 20 },
      { name: 'Dental Checkup', price: 1000, duration: 30 },
      { name: 'Eye Examination', price: 800, duration: 25 },
      { name: 'Blood Test', price: 600, duration: 15 },
      { name: 'Vaccination', price: 400, duration: 15 },
    ].forEach((s) => insertSvc.run({ business_id: clinic.lastInsertRowid, ...s }));

    const restaurant = insertBiz.run({
      slug: 'safari-grill',
      name: 'Safari Grill & Restaurant',
      sector: 'restaurant',
      phone: '+254700000003',
      address: 'Karen, Nairobi',
      hours: 'Daily 11am-10pm',
      language: 'en',
    });
    [
      { name: 'Table for 2', price: 0, duration: 90 },
      { name: 'Table for 4', price: 0, duration: 90 },
      { name: 'Table for 6', price: 0, duration: 120 },
      { name: 'Private Dining (up to 10)', price: 5000, duration: 180 },
    ].forEach((s) => insertSvc.run({ business_id: restaurant.lastInsertRowid, ...s }));

    const retail = insertBiz.run({
      slug: 'tech-hub',
      name: 'Tech Hub Kenya',
      sector: 'retail',
      phone: '+254700000004',
      address: 'CBD, Nairobi',
      hours: 'Mon-Sat 9am-6pm',
      language: 'en',
    });
    [
      { name: 'Phone Repair Consultation', price: 200, duration: 20 },
      { name: 'Laptop Service', price: 500, duration: 60 },
      { name: 'Device Setup & Config', price: 300, duration: 45 },
      { name: 'Data Recovery', price: 1500, duration: 60 },
    ].forEach((s) => insertSvc.run({ business_id: retail.lastInsertRowid, ...s }));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getDb };
