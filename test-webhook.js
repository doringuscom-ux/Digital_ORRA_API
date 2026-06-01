/**
 * Local Testing Script for WhatsApp API Backend
 * Run this script with: node test-webhook.js
 */

const axios = require('axios');

const LOCAL_SERVER_URL = 'http://localhost:3000';
const VERIFY_TOKEN = 'whatsapp_webhook_secret_verify_token_123';

async function runTests() {
  console.log('=== STARTING LOCAL WEBHOOK TESTING ===\n');

  // Test 1: Root Route
  try {
    console.log('Test 1: Pinging Root...');
    const res = await axios.get(`${LOCAL_SERVER_URL}/`);
    console.log(`Response: "${res.data}" (Expected: "WhatsApp Business API Webhook Server is running!")\n`);
  } catch (err) {
    console.error('Test 1 Failed: Server might not be running.', err.message);
    return;
  }

  // Test 2: Webhook GET Verification
  try {
    console.log('Test 2: Verifying Webhook Token...');
    const url = `${LOCAL_SERVER_URL}/webhook?hub.mode=subscribe&hub.challenge=test_challenge_code_999&hub.verify_token=${VERIFY_TOKEN}`;
    const res = await axios.get(url);
    console.log(`Response Code: ${res.status}`);
    console.log(`Response Body: "${res.data}" (Expected: "test_challenge_code_999")\n`);
  } catch (err) {
    console.error('Test 2 Failed:', err.message);
  }

  // Test 3: Simulating an Incoming WhatsApp Text Message
  try {
    console.log('Test 3: Simulating an Incoming WhatsApp message...');
    
    // Mock Meta WhatsApp webhook payload
    const mockPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '16505551111',
                  phone_number_id: '1234567890'
                },
                contacts: [
                  {
                    profile: { name: 'Test User' },
                    wa_id: '919876543210'
                  }
                ],
                messages: [
                  {
                    from: '919876543210',
                    id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAERgSQjU1RjREQkQ3NDc0QTMzMDk1AA==',
                    timestamp: '1652987654',
                    text: { body: 'Hello Antigravity! Testing my local setup.' },
                    type: 'text'
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const res = await axios.post(`${LOCAL_SERVER_URL}/webhook`, mockPayload);
    console.log(`Response Code: ${res.status}`);
    console.log(`Response Body: "${res.data}" (Expected: "EVENT_RECEIVED")`);
    console.log('Check your server console/logs. You should see the incoming message log printed there!\n');
  } catch (err) {
    console.error('Test 3 Failed:', err.message);
  }

  console.log('=== TESTING FINISHED ===');
}

runTests();
