'use strict';

require('dotenv').config();

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const twilio     = require('twilio');
const { routeMessage }    = require('./bot/router');
const { twimlReply }      = require('./messaging/twilio');
const { startReminderJob } = require('./flows/reminder');
const { pool, initDb }    = require('./db/database');

const app = express();

// Trust Render's proxy so req.ip reflects the real client IP
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── Rate limiting: max 20 msgs/min per phone number ──────────────────────────
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.body?.From || req.ip,
  handler: (req, res) => {
    console.warn(`[RateLimit] Blocked ${req.body?.From || req.ip}`);
    res.type('text/xml').send(
      twimlReply('Too many messages. Please wait a moment before trying again.')
    );
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Twilio webhook signature validation ──────────────────────────────────────
function validateTwilioSignature(req, res, next) {
  // Skip in development — set NODE_ENV=production on Render
  if (process.env.NODE_ENV !== 'production') return next();

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return next();

  const signature = req.headers['x-twilio-signature'] || '';
  const url       = `${process.env.BASE_URL}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, signature, url, req.body || {});
  if (!isValid) {
    console.warn(`[Security] Invalid Twilio signature | IP: ${req.ip} | URL: ${url}`);
    return res.status(403).type('text/plain').send('Forbidden');
  }
  next();
}

// ── Webhook ──────────────────────────────────────────────────────────────────
app.post('/webhook', webhookLimiter, validateTwilioSignature, async (req, res) => {
  const from    = req.body.From || '';
  const body    = req.body.Body || '';
  const bizSlug = req.query.biz || null;

  // Hard cap on message length
  if (body.length > 1000) {
    return res.type('text/xml').send(
      twimlReply('Message too long. Please send a shorter message.')
    );
  }

  console.log(`[Webhook] From: ${from} | Biz: ${bizSlug || 'default'} | Msg: ${body.slice(0, 80)}`);

  try {
    const reply = await routeMessage(from, body, bizSlug);
    res.type('text/xml').send(twimlReply(reply));
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
    res.type('text/xml').send(twimlReply('Sorry, something went wrong. Please try again.'));
  }
});

// ── Health check (includes DB ping) ─────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'kenya-bot', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

// ── Admin: list businesses ───────────────────────────────────────────────────
app.get('/businesses', async (req, res) => {
  try {
    const { listBusinesses } = require('./db/businesses');
    res.json(await listBusinesses());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Global Express error handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Express] Unhandled middleware error:', err);
  res.type('text/xml').send(twimlReply('Sorry, something went wrong. Please try again.'));
});

// ── Process-level safety nets ────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
  // Log but keep serving — Render will restart on fatal crashes
});

// ── Startup ───────────────────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];

async function main() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[Startup] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    await initDb();

    const server = app.listen(PORT, () => {
      const base = process.env.BASE_URL || `http://localhost:${PORT}`;
      console.log(`\n╔══════════════════════════════════════╗`);
      console.log(`║    Kenya Bot — WhatsApp Booking      ║`);
      console.log(`║    Server running on port ${PORT}        ║`);
      console.log(`╚══════════════════════════════════════╝\n`);
      console.log(`Webhook URL: ${base}/webhook`);
      console.log(`Multi-biz:   ${base}/webhook?biz=<slug>\n`);
      startReminderJob();
    });

    // ── Graceful shutdown (SIGTERM from Render, SIGINT from Ctrl-C) ──────────
    async function gracefulShutdown(signal) {
      console.log(`\n[Shutdown] ${signal} received — shutting down gracefully...`);
      server.close(async () => {
        console.log('[Shutdown] HTTP server closed.');
        try {
          await pool.end();
          console.log('[Shutdown] DB pool closed. Exiting cleanly.');
        } catch (err) {
          console.error('[Shutdown] Error closing pool:', err.message);
        }
        process.exit(0);
      });

      // Force exit after 10 s to avoid hanging
      setTimeout(() => {
        console.error('[Shutdown] Forced exit after 10 s timeout.');
        process.exit(1);
      }, 10_000).unref();
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  } catch (err) {
    console.error('[Startup] Fatal error — cannot start server:', err);
    process.exit(1);
  }
}

main();
