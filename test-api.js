const axios = require('axios');
require('dotenv').config();

console.log('Testing OpenRouter API Key:', process.env.OPENROUTER_API_KEY ? 'Found' : 'Not Found');

axios.post('https://openrouter.ai/api/v1/chat/completions', {
  model: process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
  messages: [{ role: 'user', content: 'Say Hello World in exactly two words.' }]
}, {
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json'
  }
}).then(res => {
  console.log('\n✅ API is WORKING! Reply from AI:', res.data.choices[0].message.content);
}).catch(err => {
  console.error('\n❌ API Error:', err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
});
