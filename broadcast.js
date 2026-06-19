require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const META_API_VERSION = process.env.META_API_VERSION || 'v25.0';

if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error("Error: WHATSAPP_TOKEN or PHONE_NUMBER_ID not found in .env file.");
  process.exit(1);
}

// 1. Load numbers from JSON
let numbers = [];
try {
  const data = fs.readFileSync('./numbers.json', 'utf-8');
  numbers = JSON.parse(data);
} catch (error) {
  console.error("Error reading numbers.json. Make sure the file exists and is valid JSON array.");
  process.exit(1);
}

// 2. The Template Name from your Meta Dashboard (e.g., "summer_camp_offer")
const TEMPLATE_NAME = 'summer_camp_offer';
// Language code that you selected in Meta Dashboard for this template
const TEMPLATE_LANGUAGE = 'en'; 

console.log(`Starting broadcast for ${numbers.length} numbers using template "${TEMPLATE_NAME}"...`);

const delay = ms => new Promise(res => setTimeout(res, ms));

async function startBroadcast() {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < numbers.length; i++) {
    const toPhone = numbers[i];
    console.log(`[${i+1}/${numbers.length}] Sending to ${toPhone}...`);

    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
      
      const payload = {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: {
            code: TEMPLATE_LANGUAGE
          },
          // IF your template has variables (like {{1}} for Name), you add them below:
          // components: [
          //   {
          //     type: "body",
          //     parameters: [
          //       { type: "text", text: "Student Name or Value" }
          //     ]
          //   }
          // ]
        }
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`  -> Success! Message ID: ${response.data.messages[0].id}`);
      successCount++;
    } catch (error) {
      failCount++;
      console.log(`  -> Failed!`);
      if (error.response && error.response.data) {
        console.error("  Error Details:", JSON.stringify(error.response.data, null, 2));
      } else {
        console.error("  Error:", error.message);
      }
    }

    // Rate limiting: wait 1 second before sending the next one to avoid Meta blocks
    await delay(1000); 
  }

  console.log(`\nBroadcast Finished!`);
  console.log(`Successfully sent: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

startBroadcast();
