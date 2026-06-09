require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const Session = require('./models/Session');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_API_VERSION = process.env.META_API_VERSION || 'v25.0';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas successfully.'))
  .catch((err) => console.error('Error connecting to MongoDB:', err.message));

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

if (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'your_openrouter_api_key_here') {
  console.log(`Initializing OpenRouter AI engine with model: ${OPENROUTER_MODEL}`);
} else {
  console.warn('\n⚠️ WARNING: OPENROUTER_API_KEY is not set in .env. The chatbot will use fallback messages instead of AI replies.\n');
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Root Route - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * WEBHOOK VERIFICATION (GET /webhook)
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED successfully');
      res.status(200).send(challenge);
    } else {
      console.log('Verification failed. Tokens do not match.');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

/**
 * WEBHOOK MESSAGE HANDLER (POST /webhook)
 */
app.post('/webhook', async (req, res) => {
  console.log('Incoming Webhook Event:', JSON.stringify(req.body, null, 2));

  if (req.body.object === 'whatsapp_business_account') {
    try {
      const entry = req.body.entry;
      if (entry && entry[0].changes && entry[0].changes[0].value) {
        const value = entry[0].changes[0].value;
        
        if (value.messages && value.messages[0]) {
          const message = value.messages[0];
          const from = message.from; 
          const messageId = message.id;
          const messageType = message.type;
          
          console.log(`Received message ID: ${messageId} of type ${messageType} from: ${from}`);

          if (messageType === 'text') {
            const textBody = message.text.body;
            console.log(`Message content: "${textBody}"`);

            // Find or create session in DB
            let session = await Session.findOne({ phone: from });
            if (!session) {
              session = new Session({
                phone: from,
                aiEnabled: true,
                pausedUntil: null,
                history: [{ role: 'system', content: systemInstruction }]
              });
            } else if (!session.history || session.history.length === 0) {
              session.history = [{ role: 'system', content: systemInstruction }];
            }

            session.history.push({ role: 'user', content: textBody });
            session.markModified('history');
            await session.save();

            const isAIEnabled = session.aiEnabled;
            const isPaused = session.pausedUntil && session.pausedUntil > new Date();

            if (isAIEnabled && !isPaused) {
              console.log('Generating automated response using OpenRouter AI with session memory...');
              const aiReply = await generateAISessionReply(from, textBody);
              console.log(`Generated Response: "${aiReply}"`);

              try {
                await sendWhatsAppTextMessage(from, aiReply);
                console.log(`Auto-reply sent successfully to: ${from}`);
              } catch (sendError) {
                console.error('Error sending auto-reply to WhatsApp:', sendError.response ? sendError.response.data : sendError.message);
              }
            } else {
              console.log(`AI Response skipped for ${from}. AI Enabled: ${isAIEnabled}, Paused: ${!!isPaused}`);
            }
          }
        }

        if (value.statuses && value.statuses[0]) {
          const status = value.statuses[0];
          console.log(`Message Status Update - ID: ${status.id}, Status: ${status.status}, Recipient: ${status.recipient_id}`);
        }
      }
      
      res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      console.error('Error handling webhook event:', error.message);
      res.status(500).send('ERROR');
    }
  } else {
    res.sendStatus(404);
  }
});

/**
 * API ENDPOINTS FOR FRONTEND DASHBOARD
 */

// 1. Get all active sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const dbSessions = await Session.find({});
    const list = dbSessions.map(session => ({
      phone: session.phone,
      aiEnabled: session.aiEnabled,
      pausedUntil: session.pausedUntil,
      lastMessage: session.history && session.history.length > 1 ? session.history[session.history.length - 1].content : ''
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 2. Get chat history for specific phone number
app.get('/api/chats/:phone', async (req, res) => {
  try {
    const session = await Session.findOne({ phone: req.params.phone });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      phone: session.phone,
      aiEnabled: session.aiEnabled,
      pausedUntil: session.pausedUntil,
      history: session.history || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 3. Pause AI for a specific phone number
app.post('/api/pause', async (req, res) => {
  try {
    const { to, durationMinutes } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, history: [{ role: 'system', content: systemInstruction }] });
    }

    const minutes = parseInt(durationMinutes) || 5;
    session.pausedUntil = new Date(Date.now() + minutes * 60 * 1000);
    await session.save();

    res.json({ success: true, pausedUntil: session.pausedUntil });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 4. Resume AI for a specific phone number
app.post('/api/resume', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (session) {
      session.pausedUntil = null;
      await session.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 5. Toggle AI ON/OFF for a specific phone number
app.post('/api/toggle-ai', async (req, res) => {
  try {
    const { to, aiEnabled } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, history: [{ role: 'system', content: systemInstruction }] });
    }
    session.aiEnabled = !!aiEnabled;
    await session.save();

    res.json({ success: true, aiEnabled: session.aiEnabled });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * API ENDPOINT TO SEND MESSAGES (POST /send-message)
 */
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'Please provide both "to" (phone number) and "message" body.' });
  }

  try {
    const response = await sendWhatsAppTextMessage(to, message);
    
    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, history: [{ role: 'system', content: systemInstruction }] });
    }
    if (!session.history || session.history.length === 0) {
      session.history = [{ role: 'system', content: systemInstruction }];
    }

    session.history.push({ role: 'assistant', content: message });
    session.pausedUntil = new Date(Date.now() + 5 * 60 * 1000);
    
    session.markModified('history');
    await session.save();

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

  const session = await Session.findOne({ phone: userId });
  if (!session || !session.history) {
    return "Thank you for your message. We will get back to you shortly!";
  }

  // Keep last 20 messages + system instruction to avoid token limits
  let history = session.history;
  if (history.length > 21) {
    history = [
      history[0],
      ...history.slice(history.length - 20)
    ];
  }

  try {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const payload = {
      model: OPENROUTER_MODEL,
      messages: history
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
      
      session.history.push({ role: 'assistant', content: aiReply });
      session.markModified('history');
      await session.save();

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
