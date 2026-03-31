'use strict';

/**
 * PostgreSQL-backed session store.
 * Sessions are stored as JSONB in the `sessions` table, keyed by phone number.
 * TTL: 30 minutes of inactivity. The `||` JSONB merge operator performs a
 * shallow merge identical to the previous in-memory { ...existing, ...updates }.
 */

const { pool } = require('../db/database');

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function getSession(phone) {
  try {
    const { rows } = await pool.query(
      'SELECT data, last_active FROM sessions WHERE phone = $1',
      [phone]
    );
    if (!rows.length) return null;

    const age = Date.now() - new Date(rows[0].last_active).getTime();
    if (age > SESSION_TTL_MS) {
      await pool.query('DELETE FROM sessions WHERE phone = $1', [phone]);
      return null;
    }

    return rows[0].data;
  } catch (err) {
    console.error('[Session] getSession error:', err.message);
    return null;
  }
}

async function setSession(phone, updates) {
  try {
    await pool.query(
      `INSERT INTO sessions (phone, data, last_active)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (phone) DO UPDATE
         SET data        = sessions.data || $2::jsonb,
             last_active = NOW()`,
      [phone, JSON.stringify(updates)]
    );
  } catch (err) {
    console.error('[Session] setSession error:', err.message);
  }
}

async function clearSession(phone) {
  try {
    await pool.query('DELETE FROM sessions WHERE phone = $1', [phone]);
  } catch (err) {
    console.error('[Session] clearSession error:', err.message);
  }
}

// Periodic DB-side cleanup of expired sessions every 10 minutes
setInterval(async () => {
  try {
    await pool.query(`DELETE FROM sessions WHERE last_active < NOW() - INTERVAL '30 minutes'`);
  } catch (err) {
    console.error('[Session] Cleanup error:', err.message);
  }
}, 10 * 60 * 1000);

module.exports = { getSession, setSession, clearSession };
