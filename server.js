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

  let servicesText = `\n\nHere are the Services we offer:\n` +
    `- Google Ads\n` +
    `- Meta Ads (Facebook & Instagram)\n` +
    `- SEO\n` +
    `- Website Development\n` +
    `- Social Media Marketing\n` +
    `- Graphic Designing\n` +
    `- Video Editing\n`;

  systemInstruction = (process.env.SYSTEM_INSTRUCTION || '') + servicesText + coursesText;
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

            // --- Route via Menu State Machine or Fallback to OpenRouter AI ---
            console.log('Routing message through custom menu and AI...');
            const responseText = await handleMessageRouting(from, textBody);
            console.log(`Generated Response: "${responseText}"`);

            try {
              await sendWhatsAppTextMessage(from, responseText);
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
 * Processes incoming text messages through the menu state machine or fallback to AI.
 */
async function handleMessageRouting(from, textBody) {
  const text = textBody.trim().toLowerCase();
  
  // Initialize session state if not exists
  if (!sessions[from]) {
    sessions[from] = {
      state: 'START',
      history: [
        { role: 'system', content: systemInstruction }
      ]
    };
  }

  // Greeting or reset commands
  const greetings = ['hi', 'hello', 'hey', 'start', 'menu', 'back', 'help', 'interested', 'welcome', 'yo', 'hola', 'hii', 'helo'];
  const isGreeting = greetings.some(g => text === g || text.startsWith(g + ' '));

  if (isGreeting || sessions[from].state === 'START') {
    // If they sent a greeting or they are in START state (first message)
    // and it's not a specific question, show the main menu
    const isQuestion = text.includes('?') || text.includes('fee') || text.includes('price') || text.includes('cost') || text.includes('where') || text.includes('address') || text.includes('location') || text.includes('phone') || text.includes('contact');
    
    if (isGreeting || !isQuestion) {
      sessions[from].state = 'AWAITING_INTEREST';
      return `Are you interested in:
Digital Marketing Services
Digital Marketing Courses

Reply with 1 or 2 to proceed.`;
    }
  }

  const currentState = sessions[from].state;

  if (currentState === 'AWAITING_INTEREST') {
    if (text === '1' || text.includes('service')) {
      sessions[from].state = 'START';
      return `Services Offered:
• Google Ads
• Meta Ads (Facebook & Instagram)
• SEO
• Website Development
• Social Media Marketing
• Graphic Designing
• Video Editing

Thank you for your interest in Digital ORRA. Our admission team will contact you shortly with complete course details, fees, batch timings, and enrollment information.`;
    } else if (text === '2' || text.includes('course')) {
      sessions[from].state = 'AWAITING_COURSE';
      return `👋 Welcome to Digital ORRA Academy!
We offer industry-focused training with practical learning, live projects, internship opportunities, and placement assistance.
Please choose a course:
1️⃣ Basic Digital Marketing (2 Months)
2️⃣ Advanced Digital Marketing (3 Months)
3️⃣ Digital Marketing with AI (3.5–4 Months)
4️⃣ Graphic Designing
5️⃣ Video Editing
6️⃣ Full Stack Web Development
Reply with the course number to learn more.`;
    }
  }

  if (currentState === 'AWAITING_COURSE') {
    if (text === '1') {
      sessions[from].state = 'START';
      return `Basic Digital Marketing:
• Social Media Marketing
• Google & Meta Ads Basics
• SEO Fundamentals
• Content Strategy
• Reporting & Analytics
• Duration: 2 Months

Thank you for your interest in Digital ORRA. Our admission team will contact you shortly with complete course details, fees, batch timings, and enrollment information.`;
    } else if (text === '2') {
      sessions[from].state = 'START';
      return `Advanced Digital Marketing:
• SEO
• Google Ads
• Meta Ads
• Performance Marketing
• Website Audit
• Internship + Placement Assistance
• Duration: 3 Months

Thank you for your interest in Digital ORRA. Our admission team will contact you shortly with complete course details, fees, batch timings, and enrollment information.`;
    } else if (text === '3') {
      sessions[from].state = 'START';
      return `Digital Marketing with AI:
• Advanced Digital Marketing
• ChatGPT
• Gemini
• Canva AI
• Copy.ai
• AI Marketing Automation
• Smart Campaign Planning
• Internship + Placement Assistance
• Duration: 3.5–4 Months

Thank you for your interest in Digital ORRA. Our admission team will contact you shortly with complete course details, fees, batch timings, and enrollment information.`;
    } else if (text === '4') {
      sessions[from].state = 'START';
      return `Graphic Designing:
• Photoshop
• Illustrator
• Canva Pro
• Branding & Logo Design
• Social Media Creatives
• Portfolio Development

Thank you for your interest in Digital ORRA. Our admission team will contact you shortly with complete course details, fees, batch timings, and enrollment information.`;
    } else if (text === '5') {
      sessions[from].state = 'START';
      return `Video Editing:
• Premiere Pro
• After Effects
• CapCut
• Reels & Shorts Editing
• Color Grading
• Sound Design

Thank you for your interest in Digital ORRA. Our admission team will contact you shortly with complete course details, fees, batch timings, and enrollment information.`;
    } else if (text === '6') {
      sessions[from].state = 'START';
      return `Full Stack Web Development:
• HTML, CSS, JavaScript
• React.js Basics
• Node.js
• MySQL
• APIs
• Responsive Website Design
• Real-World Projects

Thank you for your interest in Digital ORRA. Our admission team will contact you shortly with complete course details, fees, batch timings, and enrollment information.`;
    }
  }

  // Fallback to AI (OpenRouter) if no structured menu matches
  console.log('No static menu match. Falling back to OpenRouter AI...');
  return await generateAISessionReply(from, textBody);
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
    sessions[userId] = {
      state: 'START',
      history: [
        { role: 'system', content: systemInstruction }
      ]
    };
  } else if (!sessions[userId].history) {
    sessions[userId].history = [
      { role: 'system', content: systemInstruction }
    ];
  }

  // Add user message
  sessions[userId].history.push({ role: 'user', content: userMessage });

  // Keep last 20 messages + system instruction to avoid token limits
  if (sessions[userId].history.length > 21) {
    sessions[userId].history = [
      sessions[userId].history[0],
      ...sessions[userId].history.slice(sessions[userId].history.length - 20)
    ];
  }

  try {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const payload = {
      model: OPENROUTER_MODEL,
      messages: sessions[userId].history
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
      sessions[userId].history.push({ role: 'assistant', content: aiReply });
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

