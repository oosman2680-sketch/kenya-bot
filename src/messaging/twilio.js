'use strict';

require('dotenv').config();
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_WHATSAPP_FROM;

/**
 * Send a WhatsApp message via Twilio.
 * @param {string} to   - recipient in format 'whatsapp:+254...'
 * @param {string} body - message text
 */
async function sendMessage(to, body) {
  try {
    const msg = await client.messages.create({ from: FROM, to, body });
    console.log(`[Twilio] Sent to ${to} | SID: ${msg.sid}`);
    return msg;
  } catch (err) {
    console.error(`[Twilio] Failed to send to ${to}:`, err.message);
    throw err;
  }
}

/**
 * Build a TwiML response for synchronous webhook reply.
 * @param {string} body - message to reply
 * @returns {string} TwiML XML string
 */
function twimlReply(body) {
  const { twiml } = twilio;
  const resp = new twiml.MessagingResponse();
  resp.message(body);
  return resp.toString();
}

module.exports = { sendMessage, twimlReply };
