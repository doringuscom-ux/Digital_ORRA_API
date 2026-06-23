const mongoose = require('mongoose');

const broadcastJobSchema = new mongoose.Schema({
  templateName: { type: String, required: true },
  totalNumbers: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BroadcastJob', broadcastJobSchema);
