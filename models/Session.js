const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    default: ''
  },
  unreadCount: {
    type: Number,
    default: 0
  },
  aiEnabled: {
    type: Boolean,
    default: true
  },
  pausedUntil: {
    type: Date,
    default: null
  },
  history: {
    type: Array,
    default: []
  },
  language: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
