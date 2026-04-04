'use strict';

require('dotenv').config();

const express   = require('express');
const rateLimit = require('express-rate-limit');
const { routeMessage }         = require('./bot/router');
const { sendMessage, sendButtons, sendList } = require('./messaging/whatsapp');
const { startReminderJob }     = require('./flows/reminder');
const { startDailyReportJob }  = require('./bot/report');
const { startRatingJob }       = require('./bot/ratings');
const { pool, initDb }         = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy so req.ip reflects the real client IP
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Rate limiting: max 60 msgs/min per IP ────────────────────────────────────
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    console.warn(`[RateLimit] Blocked ${req.ip}`);
    res.sendStatus(429);
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── GET /webhook — Meta verification challenge ───────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] Meta verification successful.');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Meta verification failed — token mismatch.');
  res.sendStatus(403);
});

// ── POST /webhook — Incoming messages from Meta ──────────────────────────────
app.post('/webhook', webhookLimiter, async (req, res) => {
  // Always acknowledge immediately — Meta retries if it doesn't get 200 quickly
  res.sendStatus(200);

  const payload = req.body;
  if (payload?.object !== 'whatsapp_business_account') return;

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  // Ignore non-text messages (images, audio, reactions, etc.)
  if (!message || message.type !== 'text') return;

  const from    = message.from;           // e.g. "254712345678" (no +)
  const phone   = `+${from}`;            // normalize to "+254712345678" for session key
  const text    = message.text?.body || '';
  const bizSlug = req.query.biz || null; // e.g. /webhook?biz=glamour-salon

  if (text.length > 1000) {
    await sendMessage(from, 'Message too long. Please send a shorter message.').catch(() => {});
    return;
  }

  console.log(`[Webhook] From: ${phone} | Biz: ${bizSlug || 'default'} | Msg: ${text.slice(0, 80)}`);

  try {
    const result  = await routeMessage(phone, text, bizSlug);
    const replyText = result?.text ?? (typeof result === 'string' ? result : '');
    const options   = result?.options ?? [];
    const isHandoff = result?.isHandoff ?? false;

    if (isHandoff) {
      await sendMessage(from, replyText + '\n\n👥 Connecting you to our team shortly...');
    } else if (options.length >= 2 && options.length <= 3) {
      await sendButtons(from, replyText, options);
    } else if (options.length > 3) {
      const section = {
        title: 'Choose an option',
        rows:  options.map((o, i) => ({ id: `opt_${i}`, title: o.slice(0, 24) })),
      };
      await sendList(from, replyText, 'See options', [section]);
    } else {
      await sendMessage(from, replyText);
    }
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
    await sendMessage(from, 'Sorry, something went wrong. Please try again.').catch(() => {});
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'kenya-bot', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

// ── Admin: list businesses ────────────────────────────────────────────────────
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
  res.sendStatus(500);
});

// ── Process-level safety nets ────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
});

// ── Required env vars ─────────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'DATABASE_URL',
  'ANTHROPIC_API_KEY',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
];

// ── Startup ───────────────────────────────────────────────────────────────────
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
      startDailyReportJob();
      startRatingJob();
    });

    // ── Graceful shutdown ────────────────────────────────────────────────────
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
