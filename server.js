require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_API_VERSION = process.env.META_API_VERSION || 'v25.0';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Gemini AI SDK if API Key is configured
let genAI;
let aiModel;
const sessions = {}; // In-memory session store to maintain conversation history per user

if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_google_gemini_api_key_here') {
  console.log('Initializing Gemini AI engine with custom system instruction...');
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  
  // Construct dynamic system instruction using courses.json if available
  let systemInstruction = process.env.SYSTEM_INSTRUCTION || '';
  try {
    const coursesData = require('./courses.json');
    let coursesText = '\n\nHere are the detailed courses we offer at Digital ORRA Training Academy:\n';
    coursesData.forEach(course => {
      coursesText += `- **Course Name**: ${course.name}\n`;
      coursesText += `  - **Duration**: ${course.duration}\n`;
      coursesText += `  - **Program Fees**: Original fee ₹${course.original_fee}, Discounted fee ₹${course.discounted_fee}\n`;
      coursesText += `  - **Ideal For**: ${course.ideal_for}\n`;
      if (course.includes && course.includes.length > 0) {
        coursesText += `  - **Includes**: ${course.includes.join(', ')}\n`;
      }
      coursesText += `  - **Syllabus/Topics**: ${course.syllabus.join(', ')}\n`;
    });
    systemInstruction += coursesText;
  } catch (error) {
    console.error('Error loading courses.json for system instruction:', error.message);
  }

  aiModel = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction: systemInstruction
  });
} else {
  console.warn('\n⚠️ WARNING: GEMINI_API_KEY is not set in .env. The chatbot will use fallback messages instead of AI replies. Get a free key at https://aistudio.google.com/\n');
}

// Root Route
app.get('/', (req, res) => {
  res.send('WhatsApp Business API Webhook Server is running!');
});

/**
 * WEBHOOK VERIFICATION (GET /webhook)
 * Meta calls this endpoint to verify the authenticity of your server.
 * When setting up Webhooks on Meta Developer Console, you specify:
 * 1. Callback URL: e.g., https://your-domain.ngrok-free.app/webhook
 * 2. Verify Token: must match process.env.VERIFY_TOKEN
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if mode and token are in the query string
  if (mode && token) {
    // Check if the mode and token match yours
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED successfully');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      console.log('Verification failed. Tokens do not match.');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

/**
 * WEBHOOK MESSAGE HANDLER (POST /webhook)
 * Meta calls this endpoint whenever a WhatsApp event occurs (e.g. message received, delivered, read).
 */
app.post('/webhook', async (req, res) => {
  // Log incoming webhook data for debugging
  console.log('Incoming Webhook Event:', JSON.stringify(req.body, null, 2));

  // Verify this is a WhatsApp API webhook event
  if (req.body.object === 'whatsapp_business_account') {
    try {
      const entry = req.body.entry;
      if (entry && entry[0].changes && entry[0].changes[0].value) {
        const value = entry[0].changes[0].value;
        
        // Check if there are messages in the payload
        if (value.messages && value.messages[0]) {
          const message = value.messages[0];
          const from = message.from; // Sender's phone number
          const messageId = message.id;
          const messageType = message.type;
          
          console.log(`Received message ID: ${messageId} of type ${messageType} from: ${from}`);

          // Process text messages
          if (messageType === 'text') {
            const textBody = message.text.body;
            console.log(`Message content: "${textBody}"`);

            // --- Gemini AI Auto-Reply with Conversational Memory ---
            console.log('Generating automated response using Gemini AI with session memory...');
            const aiReply = await generateGeminiSessionReply(from, textBody);
            console.log(`Generated Response: "${aiReply}"`);

            try {
              await sendWhatsAppTextMessage(from, aiReply);
              console.log(`Auto-reply sent successfully to: ${from}`);
            } catch (sendError) {
              console.error('Error sending auto-reply to WhatsApp:', sendError.response ? sendError.response.data : sendError.message);
            }
          }
        }

        // Check if there are message status updates (sent, delivered, read)
        if (value.statuses && value.statuses[0]) {
          const status = value.statuses[0];
          console.log(`Message Status Update - ID: ${status.id}, Status: ${status.status}, Recipient: ${status.recipient_id}`);
        }
      }
      
      // Responds to Meta with 200 OK so they know we processed the event
      res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      console.error('Error handling webhook event:', error.message);
      res.status(500).send('ERROR');
    }
  } else {
    // Return a 404 if the event is not from WhatsApp
    res.sendStatus(404);
  }
});

/**
 * API ENDPOINT TO SEND MESSAGES (POST /send-message)
 * Send a custom text message to any phone number from your backend.
 * Payload: { "to": "919876543210", "message": "Hello World" }
 */
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'Please provide both "to" (phone number) and "message" body.' });
  }

  try {
    const response = await sendWhatsAppTextMessage(to, message);
    res.status(200).json({ success: true, meta_response: response });
  } catch (error) {
    console.error('Error sending message API:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response ? error.response.data : error.message 
    });
  }
});

/**
 * Helper function to send text message via WhatsApp Cloud API
 */
async function sendWhatsAppTextMessage(to, text) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: text
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
  };

  const response = await axios.post(url, payload, { headers });
  return response.data;
}

/**
 * Helper function to generate response using Google Gemini AI with session memory
 */
async function generateGeminiSessionReply(userId, userMessage) {
  if (!aiModel) {
    console.log('Gemini model not initialized. Using fallback response.');
    return "Thank you for contacting Digital ORRA. Our AI Assistant is undergoing setup. Please leave your requirement details and a team member will reach out to you shortly!";
  }
  
  try {
    // If no active session exists for this user, start a new chat session
    if (!sessions[userId]) {
      console.log(`Creating new chat session memory for user: ${userId}`);
      sessions[userId] = aiModel.startChat({
        history: []
      });
    }

    const chatSession = sessions[userId];
    const result = await chatSession.sendMessage(userMessage);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error(`Error calling Gemini API for session ${userId}:`, error.message);
    return "Thank you for your message. We will get back to you shortly!";
  }
}

// Start Server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
  console.log(`Webhook URL for Meta Dashboard: http://<your-public-url>/webhook`);
  console.log(`Verify Token is: ${VERIFY_TOKEN}`);
});

module.exports = app;

