require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require('@google/generative-ai');

cloudinary.config({ 
  cloud_name: 'djdbtfjlz', 
  api_key: '562942733763668', 
  api_secret: 'kh6LEU7RNU9y9S-SLHrDqOorhv0' 
});

const upload = multer({ dest: '/tmp' });

const Session = require('./models/Session');
const AdminToken = require('./models/AdminToken');
const BroadcastJob = require('./models/BroadcastJob');
const BroadcastRecipient = require('./models/BroadcastRecipient');
const AppConfig = require('./models/AppConfig');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const BUSINESS_ACCOUNT_ID = process.env.BUSINESS_ACCOUNT_ID;
const META_API_VERSION = process.env.META_API_VERSION || 'v25.0';
const MONGODB_URI = process.env.MONGODB_URI;

let isConnected;
const connectDB = async () => {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(MONGODB_URI);
    isConnected = db.connections[0].readyState;
    console.log('Connected to MongoDB Atlas successfully.');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    throw error;
  }
};

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
   - Greet users warmly. If they greet you, introduce Digital ORRA ("👋 Welcome to Digital ORRA! Hum practical learning, live projects aur placement assistance provide karte hain. \n\nKya aap apne liye koi course dekh rahe hain ya phir apne business ko grow karne ke liye services search kar rahe hain?") and ask if they are looking for courses to learn or services for their business.
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

if (process.env.OPENROUTER_API_KEY) {
  console.log(`Initializing OpenRouter AI engine`);
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
 * AUTHENTICATION MIDDLEWARE
 * Secures all /api/* routes except webhook
 */
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    const providedPassword = req.headers['x-api-password'];
    
    // Fetch stored password
    let config = await AppConfig.findOne({ key: 'api_password' });
    let currentPassword = '1234'; // Default
    if (config) {
      currentPassword = config.value;
    }
    
    // Check if provided password matches
    if (!providedPassword || providedPassword !== currentPassword) {
      console.warn(`Unauthorized API access attempt. Path: ${req.path}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid API Password' });
    }
    
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    res.status(500).json({ error: 'Server Error in Auth Middleware' });
  }
});

/**
 * CHANGE PASSWORD ENDPOINT
 */
app.post('/api/change-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim() === '') {
      return res.status(400).json({ error: 'New password cannot be empty' });
    }
    
    await AppConfig.findOneAndUpdate(
      { key: 'api_password' },
      { value: newPassword.trim() },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change Password Error:', error.message);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

/**
 * WEBHOOK MESSAGE HANDLER (POST /webhook)
 */
app.post('/webhook', async (req, res) => {
  console.log('Incoming Webhook Event:', JSON.stringify(req.body, null, 2));

  if (req.body.object === 'whatsapp_business_account') {
    try {
      await connectDB();
      const entry = req.body.entry;
      if (entry && entry[0].changes && entry[0].changes[0].value) {
        const value = entry[0].changes[0].value;
        
        if (value.messages && value.messages[0]) {
          const message = value.messages[0];
          const from = message.from; 
          const messageId = message.id;
          const messageType = message.type;
          
          console.log(`Received message ID: ${messageId} of type ${messageType} from: ${from}`);

          let profileName = '';
          if (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) {
            profileName = value.contacts[0].profile.name;
          }

          if (messageType === 'text' || messageType === 'interactive') {
            let textBody = '';
            let interactiveId = null;

            if (messageType === 'text') {
              textBody = message.text.body;
            } else if (messageType === 'interactive' && message.interactive.type === 'list_reply') {
              textBody = message.interactive.list_reply.title;
              interactiveId = message.interactive.list_reply.id;
            }

            if (!textBody) {
              return res.status(200).send('EVENT_RECEIVED');
            }

            console.log(`Message content: "${textBody}"`);

            // Find or create session in DB
            let session = await Session.findOne({ phone: from });
            if (!session) {
              session = new Session({
                phone: from,
                name: profileName,
                aiEnabled: true,
                pausedUntil: null,
                language: null,
                history: [{ role: 'system', content: systemInstruction }]
              });
            } else {
              if (profileName && !session.name) {
                session.name = profileName;
              }
              if (!session.history || session.history.length === 0) {
                session.history = [{ role: 'system', content: systemInstruction }];
              }
            }

            // Deduplication check
            const isDuplicate = session.history.some(msg => msg.messageId === messageId);
            if (isDuplicate) {
              console.log(`Ignoring duplicate message ID: ${messageId}`);
              return res.status(200).send('EVENT_RECEIVED');
            }

            // Handle keywords for Menu or Language Change
            if (messageType === 'text') {
              const lowerText = textBody.toLowerCase().trim();
              if (['menu', 'language', 'change language', 'bhasha', 'options'].includes(lowerText)) {
                console.log(`User ${from} requested menu/language change.`);
                try {
                  await sendLanguageSelectionMenu(from);
                } catch (err) {
                  console.error('Error sending language menu:', err.message);
                }
                return res.status(200).send('EVENT_RECEIVED');
              }
            }

            // Handle Language Selection Reply
            if (messageType === 'interactive' && interactiveId && interactiveId.startsWith('lang_')) {
              session.language = textBody;
              await session.save();
              console.log(`User ${from} selected language: ${session.language}`);
            }

            session.history.push({ role: 'user', content: textBody, timestamp: new Date().toISOString(), messageId: messageId });
            session.unreadCount = (session.unreadCount || 0) + 1;
            session.markModified('history');
            await session.save();

            // Send Push Notification
            try {
              const tokens = await AdminToken.find({});
              const pushTokens = tokens.map(t => t.token);
              if (pushTokens.length > 0) {
                await axios.post('https://exp.host/--/api/v2/push/send', {
                  to: pushTokens,
                  sound: 'default',
                  title: session.name ? session.name : from,
                  body: textBody,
                  data: { phone: from }
                });
                console.log(`Push notification sent to ${pushTokens.length} devices.`);
              }
            } catch (pushErr) {
              console.error('Failed to send push notification:', pushErr.message);
            }

            // --- LANGUAGE SELECTION INTERCEPT ---
            if (!session.language) {
              console.log(`User ${from} has no language set. Sending language selection menu.`);
              try {
                await sendLanguageSelectionMenu(from);
              } catch (err) {
                console.error('Error sending language menu:', err.message);
              }
              return res.status(200).send('EVENT_RECEIVED'); // Wait for selection
            }
            // ------------------------------------

            const isAIEnabled = session.aiEnabled;
            const isPaused = session.pausedUntil && session.pausedUntil > new Date();

            if (isAIEnabled && !isPaused) {
              console.log('Generating automated response using OpenRouter AI...');
              try {
                const aiReply = await generateAISessionReply(from, textBody);
                console.log(`Generated Response: "${aiReply}"`);
                const response = await sendWhatsAppTextMessage(from, aiReply);
                let metaMsgId = null;
                if (response.messages && response.messages.length > 0) metaMsgId = response.messages[0].id;
                
                session.history.push({ 
                  role: 'assistant', 
                  content: aiReply, 
                  timestamp: new Date().toISOString(),
                  messageId: metaMsgId,
                  status: 'sent'
                });
                session.markModified('history');
                await session.save();
                console.log(`Auto-reply sent successfully to: ${from}`);
              } catch (sendError) {
                console.error('Error sending AI response:', sendError.message);
              }
            } else {
              console.log(`AI Response skipped for ${from}. AI Enabled: ${isAIEnabled}, Paused: ${!!isPaused}`);
            }
          }
        }

        if (value.statuses && value.statuses[0]) {
          const status = value.statuses[0];
          console.log(`Message Status Update - ID: ${status.id}, Status: ${status.status}, Recipient: ${status.recipient_id}`);
          
          try {
            const updateData = { status: status.status, updatedAt: Date.now() };
            if (status.errors && status.errors.length > 0) {
              updateData.errorMessage = JSON.stringify(status.errors[0].message || status.errors[0].error_data?.details || status.errors);
            }
            await BroadcastRecipient.findOneAndUpdate(
              { messageId: status.id },
              updateData
            );
            
            const sessionToUpdate = await Session.findOne({ "history.messageId": status.id });
            if (sessionToUpdate) {
              const historyItem = sessionToUpdate.history.find(h => h.messageId === status.id);
              if (historyItem) {
                historyItem.status = status.status;
                sessionToUpdate.markModified('history');
                await sessionToUpdate.save();
              }
            }
          } catch (dbErr) {
            console.error('Failed to update recipient status from webhook', dbErr.message);
          }
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

app.post('/api/admin/push-token', async (req, res) => {
  try {
    await connectDB();
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await AdminToken.findOneAndUpdate({ token }, { token }, { upsert: true, new: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    await connectDB();
    const dbSessions = await Session.find({}).sort({ updatedAt: -1 });
    const list = dbSessions.map(session => ({
      phone: session.phone,
      name: session.name || '',
      unreadCount: session.unreadCount || 0,
      aiEnabled: session.aiEnabled,
      pausedUntil: session.pausedUntil,
      lastMessage: session.history && session.history.length > 1 ? session.history[session.history.length - 1].content : ''
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/chats/:phone', async (req, res) => {
  try {
    await connectDB();
    const session = await Session.findOne({ phone: req.params.phone });
    if (!session) {
      return res.json({
        phone: req.params.phone,
        name: '',
        unreadCount: 0,
        aiEnabled: true,
        pausedUntil: null,
        history: []
      });
    }

    if (session.unreadCount > 0) {
      session.unreadCount = 0;
      await session.save();
    }

    res.json({
      phone: session.phone,
      name: session.name || '',
      unreadCount: session.unreadCount || 0,
      aiEnabled: session.aiEnabled,
      pausedUntil: session.pausedUntil,
      history: session.history || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/sessions/name', async (req, res) => {
  try {
    await connectDB();
    const { to, name } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, name, history: [{ role: 'system', content: systemInstruction }] });
    } else {
      session.name = name;
    }
    await session.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/pause', async (req, res) => {
  try {
    await connectDB();
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

app.post('/api/resume', async (req, res) => {
  try {
    await connectDB();
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

app.post('/api/toggle-ai', async (req, res) => {
  try {
    await connectDB();
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

app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'Please provide both "to" (phone number) and "message" body.' });
  }

  console.log(`[MANUAL SEND] Request received. To: ${to}, Message: ${message}`);
  
  try {
    await connectDB();
    const response = await sendWhatsAppTextMessage(to, message);
    
    if (!response) {
      return res.status(400).json({ 
        success: false, 
        error: "Message failed to send. This usually happens if the 24-hour window has expired or the number is invalid." 
      });
    }

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, history: [{ role: 'system', content: systemInstruction }] });
    }
    if (!session.history || session.history.length === 0) {
      session.history = [{ role: 'system', content: systemInstruction }];
    }

    let metaMsgId = null;
    if (response.messages && response.messages.length > 0) metaMsgId = response.messages[0].id;

    session.history.push({ 
      role: 'assistant', 
      content: message, 
      timestamp: new Date().toISOString(),
      messageId: metaMsgId,
      status: 'sent'
    });
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

app.post('/api/chats/:phone/reply', async (req, res) => {
  const { to, message } = req.body;
  const phone = req.params.phone || to;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Please provide both phone number and message body.' });
  }
  
  try {
    await connectDB();
    const response = await sendWhatsAppTextMessage(phone, message);
    
    if (!response) {
      return res.status(400).json({ 
        success: false, 
        error: "Message failed to send. This usually happens if the 24-hour window has expired or the number is invalid." 
      });
    }

    let session = await Session.findOne({ phone: phone });
    if (!session) {
      session = new Session({ phone: phone, history: [{ role: 'system', content: systemInstruction }] });
    }
    
    let metaMsgId = null;
    if (response.messages && response.messages.length > 0) metaMsgId = response.messages[0].id;

    session.history.push({ 
      role: 'assistant', 
      content: message, 
      timestamp: new Date().toISOString(),
      messageId: metaMsgId,
      status: 'sent'
    });
    session.pausedUntil = new Date(Date.now() + 5 * 60 * 1000);
    
    session.markModified('history');
    await session.save();

    res.status(200).json({ success: true, meta_response: response });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.response ? error.response.data : error.message 
    });
  }
});

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

  try {
    const response = await axios.post(url, payload, { headers });
    return response.data;
  } catch (error) {
    console.error('Error sending WhatsApp text message:', error.message);
    return null;
  }
}

async function sendLanguageSelectionMenu(to) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Choose Language' },
      body: { text: 'Please select your preferred language to continue / कृपया जारी रखने के लिए अपनी भाषा चुनें:' },
      footer: { text: 'Digital ORRA' },
      action: {
        button: 'Select Language',
        sections: [
          {
            title: 'Languages',
            rows: [
              { id: 'lang_english', title: 'English' },
              { id: 'lang_hindi', title: 'Hindi' },
              { id: 'lang_hinglish', title: 'Hinglish' },
              { id: 'lang_punjabi', title: 'Punjabi' }
            ]
          }
        ]
      }
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
  };

  try {
    const response = await axios.post(url, payload, { headers });
    return response.data;
  } catch (error) {
    console.error('Error sending Language Selection Menu:', error.message);
    return null;
  }
}

/**
 * Helper function to generate response using OpenRouter AI with session memory
 */
async function generateAISessionReply(userId, userMessage) {
  const fallbackMessage = "Thank you for your message! Our AI is taking a moment to process. Please leave your requirement details and a team member will reach out to you shortly.";

  if (!process.env.OPENROUTER_API_KEY) {
    console.log('OpenRouter key not configured. Using fallback response.');
    return fallbackMessage;
  }

  const session = await Session.findOne({ phone: userId });
  if (!session || !session.history) {
    return fallbackMessage;
  }

  // Keep last 20 messages + system instruction to avoid token limits
  let history = session.history;
  if (history.length > 21) {
    history = [
      history[0],
      ...history.slice(history.length - 20)
    ];
  }

  // Inject language preference if set
  if (session.language) {
    history[0] = {
      role: 'system',
      content: history[0].content + `\n\nCRITICAL INSTRUCTION: The user has selected to converse in ${session.language}. You MUST reply ONLY in ${session.language}. Do not use any other language.`
    };
  }

  try {
    const openRouterMessages = history.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : (msg.role === 'system' ? 'system' : 'user'),
      content: msg.content
    }));

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
        messages: openRouterMessages,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://digitalorra.com',
          'X-Title': 'Digital ORRA WhatsApp Bot'
        }
      }
    );

    const aiReply = response.data.choices[0].message.content.trim();
    
    session.history.push({ role: 'assistant', content: aiReply, timestamp: new Date().toISOString() });
    session.markModified('history');
    await session.save();

    return aiReply;
  } catch (error) {
    console.error(`Error calling OpenRouter API for session ${userId}:`, error.response ? error.response.data : error.message);
    console.log(`OpenRouter failed, falling back to Gemini API...`);
    
    try {
      if (!process.env.GEMINI_API_KEY) throw new Error('No GEMINI_API_KEY available.');

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const geminiPrompt = history.map(msg => `${msg.role === 'assistant' ? 'Assistant' : (msg.role === 'system' ? 'System' : 'User')}: ${msg.content}`).join('\\n') + '\\nAssistant: ';
      
      const result = await model.generateContent(geminiPrompt);
      const aiReply = result.response.text().trim();
      
      session.history.push({ role: 'assistant', content: aiReply, timestamp: new Date().toISOString() });
      session.markModified('history');
      await session.save();
      
      return aiReply;
    } catch (geminiError) {
      console.error(`Error calling Gemini API for session ${userId}:`, geminiError.message);
      return fallbackMessage;
    }
  }
}

// 6. Get all approved WhatsApp Message Templates
app.get('/api/templates', async (req, res) => {
  try {
    if (!BUSINESS_ACCOUNT_ID || !WHATSAPP_TOKEN) {
      return res.status(500).json({ error: 'BUSINESS_ACCOUNT_ID or WHATSAPP_TOKEN is missing' });
    }
    
    const url = `https://graph.facebook.com/${META_API_VERSION}/${BUSINESS_ACCOUNT_ID}/message_templates`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });
    
    // Filter out only APPROVED templates
    const templates = response.data.data.filter(t => t.status === 'APPROVED');
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch templates from Meta API' });
  }
});

// 7. Send Broadcast
app.post('/api/broadcast', async (req, res) => {
  try {
    const { templateName, languageCode, numbers, components } = req.body;
    
    if (!templateName || !numbers || !Array.isArray(numbers)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // CREATE BROADCAST JOB
    const job = new BroadcastJob({
      templateName,
      totalNumbers: numbers.length
    });
    await job.save();

    // CREATE PENDING RECIPIENTS
    const recipients = numbers.map(phone => ({
      jobId: job._id,
      phone: phone,
      status: 'pending'
    }));
    await BroadcastRecipient.insertMany(recipients);

    res.json({ success: true, message: `Broadcast started for ${numbers.length} numbers.`, jobId: job._id });

    // Run broadcast asynchronously in the background so request doesn't timeout
    setTimeout(async () => {
      let successCount = 0;
      let failCount = 0;
      
      // Add Cloudinary compression transformations to the image URLs to prevent 5MB limits
      if (components && Array.isArray(components)) {
        components.forEach(comp => {
          if (comp.type === 'header' && comp.parameters) {
            comp.parameters.forEach(param => {
              if (param.type === 'image' && param.image && param.image.link) {
                let link = param.image.link;
                if (link.includes('res.cloudinary.com') && !link.includes('/upload/w_800,q_auto,f_auto/')) {
                  link = link.replace('/upload/', '/upload/w_800,q_auto,f_auto/');
                  param.image.link = link;
                }
              }
            });
          }
        });
      }

      for (const toPhone of numbers) {
        try {
          const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: toPhone,
            type: 'template',
            template: {
              name: templateName,
              language: { code: languageCode || 'en' }
            }
          };
          
          if (components && Array.isArray(components) && components.length > 0) {
            payload.template.components = components;
          }

          const response = await axios.post(url, payload, {
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json'
            }
          });
          
          let metaMessageId = null;
          if (response.data && response.data.messages && response.data.messages.length > 0) {
            metaMessageId = response.data.messages[0].id;
          }

          // Update Recipient to SENT
          await BroadcastRecipient.findOneAndUpdate(
            { jobId: job._id, phone: toPhone },
            { status: 'sent', messageId: metaMessageId, updatedAt: Date.now() }
          );

          successCount++;

          // --- Create Session and Log Broadcast Message ---
          try {
            let session = await Session.findOne({ phone: toPhone });
            if (!session) {
              session = new Session({
                phone: toPhone,
                aiEnabled: true,
                pausedUntil: null,
                language: null,
                history: []
              });
            }
            if (!session.history) {
              session.history = [];
            }
            
            let broadcastDesc = `[Broadcast Template: ${templateName}]`;
            session.history.push({ 
              role: 'assistant', 
              content: broadcastDesc, 
              timestamp: new Date().toISOString(),
              messageId: metaMessageId,
              status: 'sent'
            });
            session.markModified('history');
            await session.save();
            console.log(`Saved broadcast history for ${toPhone}`);
          } catch (dbErr) {
            console.error(`Failed to save broadcast history for ${toPhone}:`, dbErr.message);
          }
          // ----------------------------------------------
        } catch (error) {
          failCount++;
          const errData = error.response ? JSON.stringify(error.response.data.error.message || error.response.data) : error.message;
          console.error(`Broadcast failed for ${toPhone}:`, errData);
          
          // Update Recipient to FAILED
          await BroadcastRecipient.findOneAndUpdate(
            { jobId: job._id, phone: toPhone },
            { status: 'failed', errorMessage: errData, updatedAt: Date.now() }
          );
        }
        // Rate limit 1 sec
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log(`Broadcast finished. Success: ${successCount}, Fail: ${failCount}`);
    }, 0);

  } catch (error) {
    res.status(500).json({ error: 'Broadcast failed to start' });
  }
});

// 8. Upload Image to Cloudinary (Base64)
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    
    const result = await cloudinary.uploader.upload(image, {
      folder: 'whatsapp_broadcasts'
    });
    
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// 9. Get Broadcast Jobs
app.get('/api/broadcasts', async (req, res) => {
  try {
    await connectDB();
    const jobs = await BroadcastJob.find({}).sort({ createdAt: -1 });
    
    // For each job, count the status totals (optional optimization, but good for UI)
    const jobsWithStats = await Promise.all(jobs.map(async (job) => {
      const stats = await BroadcastRecipient.aggregate([
        { $match: { jobId: job._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const statusCounts = stats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
      
      return {
        ...job.toObject(),
        stats: statusCounts
      };
    }));

    res.json(jobsWithStats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch broadcasts' });
  }
});

// 10. Get Broadcast Recipients for a Job
app.get('/api/broadcasts/:jobId', async (req, res) => {
  try {
    await connectDB();
    const recipients = await BroadcastRecipient.find({ jobId: req.params.jobId }).sort({ updatedAt: -1 });
    res.json(recipients);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});
// 11. Delete chat history
app.delete('/api/chats/:phone', async (req, res) => {
  try {
    await connectDB();
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ error: 'Missing phone number' });

    await Session.deleteOne({ phone });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 12. Delete single message
app.delete('/api/chats/:phone/messages/:index', async (req, res) => {
  try {
    await connectDB();
    const { phone, index } = req.params;
    let session = await Session.findOne({ phone });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const msgIndex = parseInt(index, 10);
    if (msgIndex >= 0 && msgIndex < session.history.length) {
      session.history.splice(msgIndex, 1);
      session.markModified('history');
      await session.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 13. Bulk delete messages
app.post('/api/chats/:phone/messages/bulk-delete', async (req, res) => {
  try {
    await connectDB();
    const { phone } = req.params;
    const { indices } = req.body;
    
    if (!indices || !Array.isArray(indices)) {
      return res.status(400).json({ error: 'Invalid indices array' });
    }

    let session = await Session.findOne({ phone });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sortedIndices = indices.sort((a, b) => b - a);

    for (let msgIndex of sortedIndices) {
      if (msgIndex >= 0 && msgIndex < session.history.length) {
        session.history.splice(msgIndex, 1);
      }
    }

    session.markModified('history');
    await session.save();
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error in bulk-delete:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * START SERVER
 */
app.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`);
  console.log(`Webhook URL for Meta Dashboard: http://<your-public-url>/webhook`);
  console.log(`Verify Token is: ${VERIFY_TOKEN}`);

  // Connect to DB immediately on startup
  try {
    await connectDB();
  } catch (err) {
    console.error("Initial DB Connection failed", err);
  }

  // Heartbeat to prevent Render from sleeping
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || process.env.PING_URL;
  if (RENDER_EXTERNAL_URL) {
    console.log(`Setting up heartbeat to ${RENDER_EXTERNAL_URL} every 14 minutes.`);
    setInterval(async () => {
      try {
        await axios.get(RENDER_EXTERNAL_URL);
        console.log(`[Heartbeat] Ping sent to ${RENDER_EXTERNAL_URL} to keep server awake.`);
      } catch (err) {
        console.error('[Heartbeat] Ping failed:', err.message);
      }
    }, 14 * 60 * 1000); // 14 minutes
  }
});

module.exports = app;
