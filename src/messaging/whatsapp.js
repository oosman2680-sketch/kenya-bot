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

module.exports = { sendMessage };
