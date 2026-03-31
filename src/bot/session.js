'use strict';

/**
 * In-memory session store keyed by user phone number.
 * Each session tracks the current conversation flow state.
 *
 * Shape:
 * {
 *   step: string,          // current step in the flow
 *   bizId: number,         // active business
 *   bizSlug: string,
 *   lang: string,          // 'en' | 'sw'
 *   data: object,          // accumulated booking data
 *   lastActive: number,    // timestamp for TTL cleanup
 * }
 */

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSession(phone) {
  const session = sessions.get(phone);
  if (!session) return null;

  // Expire stale sessions
  if (Date.now() - session.lastActive > SESSION_TTL_MS) {
    sessions.delete(phone);
    return null;
  }

  session.lastActive = Date.now();
  return session;
}

function setSession(phone, data) {
  const existing = sessions.get(phone) || {};
  sessions.set(phone, {
    ...existing,
    ...data,
    lastActive: Date.now(),
  });
}

function clearSession(phone) {
  sessions.delete(phone);
}

// Periodic cleanup of expired sessions (every 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of sessions.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(phone);
    }
  }
}, 10 * 60 * 1000);

module.exports = { getSession, setSession, clearSession };
