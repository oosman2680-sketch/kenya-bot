'use strict';

require('dotenv').config();

const express = require('express');
const { routeMessage } = require('./bot/router');
const { twimlReply } = require('./messaging/twilio');
const { startReminderJob } = require('./flows/reminder');

// Initialize DB (creates tables + seeds default businesses on first run)
require('./db/database').getDb();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

/**
 * POST /webhook
 * Twilio sends incoming WhatsApp messages here.
 *
 * Optional query param: ?biz=<slug>  (e.g. /webhook?biz=afya-clinic)
 * This lets you run multiple businesses from one server — each business
 * gets its own Twilio webhook URL pointing here with their slug.
 */
app.post('/webhook', async (req, res) => {
  const from = req.body.From || '';
  const body = req.body.Body || '';
  const bizSlug = req.query.biz || null;

  console.log(`[Webhook] From: ${from} | Biz: ${bizSlug || 'default'} | Message: ${body}`);

  try {
    const reply = await routeMessage(from, body, bizSlug);
    res.type('text/xml').send(twimlReply(reply));
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    res.type('text/xml').send(twimlReply('Sorry, something went wrong. Please try again.'));
  }
});

/**
 * GET /health
 * Simple health check.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kenya-bot', timestamp: new Date().toISOString() });
});

/**
 * GET /businesses
 * Lists all registered businesses (for admin/debug).
 */
app.get('/businesses', (req, res) => {
  const { listBusinesses } = require('./db/businesses');
  res.json(listBusinesses());
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║    Kenya Bot — WhatsApp Booking      ║`);
  console.log(`║    Server running on port ${PORT}        ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
  console.log(`Webhook URL: ${process.env.BASE_URL}/webhook`);
  console.log(`Multi-biz:   ${process.env.BASE_URL}/webhook?biz=<slug>\n`);

  // Start the 24h reminder cron
  startReminderJob();
});
