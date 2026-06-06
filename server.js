require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_API_VERSION = process.env.META_API_VERSION || 'v25.0';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';

let systemInstruction = '';
// Construct dynamic system instruction using courses.json if available
try {
  const coursesData = require('./courses.json');
  let coursesText = '\n\nCourses Offered & Details:\n';
  coursesData.forEach((course, index) => {
    coursesText += `${index + 1}. **${course.name}**\n`;
    coursesText += `   - Duration: ${course.duration}\n`;
    coursesText += `   - Syllabus: ${course.syllabus.join(', ')}\n`;
    coursesText += `   - Program Fees: Original fee ₹${course.original_fee}, Discounted fee ₹${course.discounted_fee}\n`;
    if (course.includes && course.includes.length > 0) {
      coursesText += `   - Includes: ${course.includes.join(', ')}\n`;
    }
  });

  let servicesText = `\n\nServices Offered:\n` +
    `- Google Ads\n` +
    `- Meta Ads (Facebook & Instagram)\n` +
    `- SEO\n` +
    `- Website Development\n` +
    `- Social Media Marketing\n` +
    `- Graphic Designing\n` +
    `- Video Editing\n`;

  const flowInstructions = `
You are a friendly, natural, and polite human career counselor and sales representative from Digital ORRA (Panchkula).
Your primary goal is to help users find the best solution for their business or career growth, while naturally collecting their contact details for our admissions/sales team to follow up.

### CONVERSATION STYLE & PERSONALITY:
- **Be Human & Natural**: Do NOT sound like an AI or a bot. Converse like a warm, supportive, and understanding person. Avoid robotic lists or repeating template texts in every single message.
- **Language**: Converse comfortably in Hinglish (mixed Hindi and English, code-switching naturally, e.g. "Haan ji, bilkul! Hamare paas bahut accha video editing course hai...", "Aap abhi kya kar rahe hain?").
- **Stay on Topic (Immediate Context)**: Always prioritize and analyze the last 1-2 messages in the chat history. Make sure you reply directly to what the user just asked/said in their most recent message. Do not drift away from the immediate topic or bring up unrelated details unless requested. Keep the talk easy to follow and relevant.
- **Message Length**: Keep your responses short and interactive (2-3 sentences max). Instead of sending a massive block of text, share a bit of information and ask a question to keep them talking.

### SALES & COUNSELING GUIDELINES:
1. **Welcome & Qualify**:
   - Greet users warmly. If they greet you, introduce Digital ORRA Academy ("👋 Welcome to Digital ORRA Academy! We offer industry-focused training with practical learning, live projects, internships, and placements.") and ask if they are looking for courses to learn or services for their business.
   - Ask about their current background (student, freelancer, job-seeker, business owner) to customize your recommendation.

2. **Transparent Fees & Selling Value**:
   - If they ask about fees, disclose the fees transparently (mention both the original fee and the discounted fee from the database).
   - Sell the value: explain that the pricing is highly affordable and mention benefits like 100% practical training, working on live projects, installments option, internship, and placement assistance.

3. **Lead Capture (Name & Phone Number)**:
   - Ask for their name and contact number naturally during the conversation.
   - E.g., "Aapka naam aur phone number kya hai? Hamari team aapse call pe contact karke details aur batch timings share kar degi, and special discount offer bhi secure kar degi."
   - Keep it friendly: "Mujhe aapka contact number mil sakta hai taaki hum clear details call pe share kar sakein?"

4. **Win-Win Solutions (Profit for both User & Digital ORRA)**:
   - Help the user see how this benefits them (career growth, job placement, portfolio building, or business growth if they want services).
   - If they are a business owner looking for growth, recommend our services or advanced digital marketing courses.
   - If they want to learn, recommend our premium programs (e.g. Digital Marketing with AI, Full Stack Web Development) because they offer internship & placement assistance.

5. **Closing / Concluding**:
   - When appropriate (after sharing details, or once they share their contact number), conclude with a variation of: "Thank you for your interest in Digital ORRA. Our team will contact you shortly with complete details, fees, batch timings, and enrollment information."
`;

  systemInstruction = flowInstructions + servicesText + coursesText;
} catch (error) {
  console.error('Error loading courses.json for system instruction:', error.message);
  systemInstruction = process.env.SYSTEM_INSTRUCTION || '';
}

const sessions = {}; // In-memory session store to maintain conversation history per user

if (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'your_openrouter_api_key_here') {
  console.log(`Initializing OpenRouter AI engine with model: ${OPENROUTER_MODEL}`);
} else {
  console.warn('\n⚠️ WARNING: OPENROUTER_API_KEY is not set in .env. The chatbot will use fallback messages instead of AI replies.\n');
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

            // --- OpenRouter AI Auto-Reply with Conversational Memory ---
            console.log('Generating automated response using OpenRouter AI with session memory...');
            const aiReply = await generateAISessionReply(from, textBody);
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
 * Helper function to generate response using OpenRouter AI with session memory
 */
async function generateAISessionReply(userId, userMessage) {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
    console.log('OpenRouter key not configured. Using fallback response.');
    return "Thank you for contacting Digital ORRA. Our AI Assistant is undergoing setup. Please leave your requirement details and a team member will reach out to you shortly!";
  }

  // Initialize session history if it doesn't exist
  if (!sessions[userId]) {
    console.log(`Creating new chat session memory for user: ${userId}`);
    sessions[userId] = [
      { role: 'system', content: systemInstruction }
    ];
  }

  // Add user message
  sessions[userId].push({ role: 'user', content: userMessage });

  // Keep last 20 messages + system instruction to avoid token limits
  if (sessions[userId].length > 21) {
    sessions[userId] = [
      sessions[userId][0],
      ...sessions[userId].slice(sessions[userId].length - 20)
    ];
  }

  try {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const payload = {
      model: OPENROUTER_MODEL,
      messages: sessions[userId]
    };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://digital-orra-api.vercel.app',
      'X-Title': 'Digital ORRA WhatsApp Bot'
    };

    const response = await axios.post(url, payload, { headers });
    
    if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
      const aiReply = response.data.choices[0].message.content.trim();
      sessions[userId].push({ role: 'assistant', content: aiReply });
      return aiReply;
    } else {
      console.error('Unexpected OpenRouter response structure:', JSON.stringify(response.data));
      return "Thank you for your message. We will get back to you shortly!";
    }
  } catch (error) {
    console.error(`Error calling OpenRouter API for session ${userId}:`, error.response ? error.response.data : error.message);
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

