/**
 * Script to test sending a real WhatsApp message via your local server.
 * Run this script with: node send-test-msg.js <phone_number> "<your_message>"
 * Example: node send-test-msg.js 919876543210 "Hello, this is a test message!"
 */

const axios = require('axios');

const args = process.argv.slice(2);
const toPhone = args[0];
const messageText = args[1] || 'Hello from my custom WhatsApp API backend!';

if (!toPhone) {
  console.error('Error: Please provide a recipient phone number (including country code, e.g. 919876543210).');
  console.log('Usage: node send-test-msg.js <phone_number> "<message>"');
  process.exit(1);
}

const LOCAL_SERVER_URL = 'http://localhost:3000';

async function sendTest() {
  console.log(`Sending message to ${toPhone}...`);
  try {
    const response = await axios.post(`${LOCAL_SERVER_URL}/send-message`, {
      to: toPhone,
      message: messageText
    });
    console.log('\nSuccess! Meta API Response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('\nError sending message:');
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
      console.log('\nTip: Make sure the recipient number is registered as a test recipient in your Meta Developer Dashboard under "To" phone number list, and that you have sent a message from that phone number to your WhatsApp Business number within the last 24 hours.');
    } else {
      console.error(error.message);
    }
  }
}

sendTest();
