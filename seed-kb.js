require('dotenv').config();
const mongoose = require('mongoose');
const KnowledgeBase = require('./models/KnowledgeBase');

const MONGODB_URI = process.env.MONGODB_URI;

const faqs = [
  {
    question: 'Do you provide placement or job guarantee?',
    answer: 'Haan ji bilkul! Hum 100% practical training dete hain aur course complete hone ke baad placement assistance aur internship dono provide karte hain.'
  },
  {
    question: 'Class ki timing kya hoti hai?',
    answer: 'Hamare paas flexible batch timings hain, morning aur evening dono. Aap apna number de dijiye, hamari team aapse call pe time discuss kar legi.'
  },
  {
    question: 'Classes online hongi ya offline?',
    answer: 'Aap online aur offline dono tarike se classes join kar sakte hain. Dono mein 100% practical learning hoti hai.'
  },
  {
    question: 'Kya mujhe certificate milega course ke baad?',
    answer: 'Yes, course poora hone par aapko proper certification aur internship completion letter diya jayega.'
  },
  {
    question: 'Kya demo class mil sakti hai?',
    answer: 'Haan ji, aap bilkul demo class le sakte hain. Aap apna number share kar dijiye, hum demo class arrange karwa denge.'
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB');
    
    // Optional: clear existing to avoid duplicates if run multiple times
    // await KnowledgeBase.deleteMany({});
    
    for (let faq of faqs) {
      // Avoid duplicate insert by checking if question exists
      const exists = await KnowledgeBase.findOne({ question: faq.question });
      if (!exists) {
        await new KnowledgeBase(faq).save();
        console.log('Inserted:', faq.question);
      }
    }
    
    console.log('Knowledge Base seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
