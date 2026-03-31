'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id          SERIAL      PRIMARY KEY,
        slug        TEXT        NOT NULL UNIQUE,
        name        TEXT        NOT NULL,
        sector      TEXT        NOT NULL,
        phone       TEXT,
        address     TEXT,
        hours       TEXT,
        language    TEXT        NOT NULL DEFAULT 'en',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS services (
        id           SERIAL  PRIMARY KEY,
        business_id  INTEGER NOT NULL REFERENCES businesses(id),
        name         TEXT    NOT NULL,
        price        INTEGER NOT NULL,
        duration     INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id                SERIAL      PRIMARY KEY,
        business_id       INTEGER     NOT NULL REFERENCES businesses(id),
        customer_name     TEXT        NOT NULL,
        customer_phone    TEXT        NOT NULL,
        service_id        INTEGER     NOT NULL REFERENCES services(id),
        service_name      TEXT        NOT NULL,
        appointment_date  TEXT        NOT NULL,
        appointment_time  TEXT        NOT NULL,
        status            TEXT        NOT NULL DEFAULT 'confirmed',
        ref_code          TEXT        NOT NULL UNIQUE,
        reminder_sent     BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        phone       TEXT        PRIMARY KEY,
        data        JSONB       NOT NULL DEFAULT '{}',
        last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_appointments_phone
        ON appointments(customer_phone);
      CREATE INDEX IF NOT EXISTS idx_appointments_date
        ON appointments(appointment_date);
      CREATE INDEX IF NOT EXISTS idx_appointments_reminder
        ON appointments(reminder_sent, appointment_date, status);
    `);

    await seedDefaultBusinesses(client);
    console.log('[DB] Schema ready.');
  } finally {
    client.release();
  }
}

async function seedDefaultBusinesses(client) {
  const { rows } = await client.query('SELECT COUNT(*) AS c FROM businesses');
  if (parseInt(rows[0].c, 10) > 0) return;

  try {
    await client.query('BEGIN');

    const insertBiz = async (slug, name, sector, phone, address, hours, language) => {
      const res = await client.query(
        `INSERT INTO businesses (slug, name, sector, phone, address, hours, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [slug, name, sector, phone, address, hours, language]
      );
      return res.rows[0].id;
    };

    const insertSvc = (bizId, name, price, duration) =>
      client.query(
        'INSERT INTO services (business_id, name, price, duration) VALUES ($1, $2, $3, $4)',
        [bizId, name, price, duration]
      );

    const salonId = await insertBiz('glamour-salon', 'Glamour Salon Nairobi', 'salon',
      '+254700000001', 'Westlands, Nairobi', 'Mon-Sat 8am-7pm', 'en');
    for (const s of [
      { name: 'Haircut', price: 500, duration: 30 },
      { name: 'Hair Braiding', price: 1500, duration: 120 },
      { name: 'Manicure', price: 700, duration: 45 },
      { name: 'Pedicure', price: 800, duration: 45 },
      { name: 'Full Makeup', price: 2500, duration: 60 },
    ]) await insertSvc(salonId, s.name, s.price, s.duration);

    const clinicId = await insertBiz('afya-clinic', 'Afya Community Clinic', 'clinic',
      '+254700000002', 'Kibera, Nairobi', 'Mon-Fri 8am-5pm', 'sw');
    for (const s of [
      { name: 'General Consultation', price: 500, duration: 20 },
      { name: 'Dental Checkup', price: 1000, duration: 30 },
      { name: 'Eye Examination', price: 800, duration: 25 },
      { name: 'Blood Test', price: 600, duration: 15 },
      { name: 'Vaccination', price: 400, duration: 15 },
    ]) await insertSvc(clinicId, s.name, s.price, s.duration);

    const restaurantId = await insertBiz('safari-grill', 'Safari Grill & Restaurant', 'restaurant',
      '+254700000003', 'Karen, Nairobi', 'Daily 11am-10pm', 'en');
    for (const s of [
      { name: 'Table for 2', price: 0, duration: 90 },
      { name: 'Table for 4', price: 0, duration: 90 },
      { name: 'Table for 6', price: 0, duration: 120 },
      { name: 'Private Dining (up to 10)', price: 5000, duration: 180 },
    ]) await insertSvc(restaurantId, s.name, s.price, s.duration);

    const retailId = await insertBiz('tech-hub', 'Tech Hub Kenya', 'retail',
      '+254700000004', 'CBD, Nairobi', 'Mon-Sat 9am-6pm', 'en');
    for (const s of [
      { name: 'Phone Repair Consultation', price: 200, duration: 20 },
      { name: 'Laptop Service', price: 500, duration: 60 },
      { name: 'Device Setup & Config', price: 300, duration: 45 },
      { name: 'Data Recovery', price: 1500, duration: 60 },
    ]) await insertSvc(retailId, s.name, s.price, s.duration);

    await client.query('COMMIT');
    console.log('[DB] Default businesses seeded.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

module.exports = { pool, initDb };
