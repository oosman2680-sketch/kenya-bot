'use strict';

const axios = require('axios');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;

/**
 * Send a WhatsApp message via Meta Graph API.
 * @param {string} to   - recipient phone number (digits only, e.g. "254712345678")
 * @param {string} body - message text
 */
async function sendMessage(to, body) {
  // Normalize: strip leading +  and whatsapp: prefix if present
  const recipient = to.replace(/^whatsapp:/, '').replace(/^\+/, '');

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[WhatsApp] Sent to ${recipient} | ID: ${res.data.messages?.[0]?.id}`);
    return res.data;
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error(`[WhatsApp] Failed to send to ${recipient}:`, detail);
    throw err;
  }
}

/**
 * Send a WhatsApp interactive button message (2–3 buttons).
 * @param {string}   to      - recipient phone (digits only)
 * @param {string}   bodyText - message body
 * @param {string[]} buttons  - array of button labels (max 3, each max 20 chars)
 */
async function sendButtons(to, bodyText, buttons) {
  const recipient = to.replace(/^whatsapp:/, '').replace(/^\+/, '');

  const data = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((btn, i) => ({
          type:  'reply',
          reply: { id: `btn_${i}`, title: btn.slice(0, 20) },
        })),
      },
    },
  };

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      data,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`[WhatsApp] Buttons sent to ${recipient} | ID: ${res.data.messages?.[0]?.id}`);
    return res.data;
  } catch (err) {
    // Fall back to plain text if interactive message fails (e.g. unsupported number type)
    console.warn(`[WhatsApp] sendButtons failed, falling back to text:`, err.response?.data?.error?.message || err.message);
    const fallback = bodyText + '\n\n' + buttons.map((b, i) => `${i + 1}. ${b}`).join('\n');
    return sendMessage(to, fallback);
  }
}

/**
 * Send a WhatsApp interactive list message (more than 3 options).
 * @param {string} to
 * @param {string} bodyText
 * @param {string} buttonText - label on the list-trigger button (max 20 chars)
 * @param {Array}  sections   - [{ title, rows: [{ id, title, description? }] }]
 */
async function sendList(to, bodyText, buttonText, sections) {
  const recipient = to.replace(/^whatsapp:/, '').replace(/^\+/, '');

  const data = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'list',
      body:   { text: bodyText },
      action: { button: buttonText.slice(0, 20), sections },
    },
  };

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      data,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`[WhatsApp] List sent to ${recipient} | ID: ${res.data.messages?.[0]?.id}`);
    return res.data;
  } catch (err) {
    console.warn(`[WhatsApp] sendList failed, falling back to text:`, err.response?.data?.error?.message || err.message);
    const allRows = sections.flatMap(s => s.rows);
    const fallback = bodyText + '\n\n' + allRows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
    return sendMessage(to, fallback);
  }
}

module.exports = { sendMessage, sendButtons, sendList };
