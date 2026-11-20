const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  // Optional trigger words/phrases for the smart router (e.g. ["fee", "price", "kitne paise"])
  keywords: {
    type: [String],
    default: [],
  }
}, { timestamps: true });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
