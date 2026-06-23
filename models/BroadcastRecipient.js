const mongoose = require('mongoose');

const broadcastRecipientSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'BroadcastJob', required: true },
  phone: { type: String, required: true },
  messageId: { type: String, default: null }, // from Meta API on success
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'], 
    default: 'pending' 
  },
  errorMessage: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BroadcastRecipient', broadcastRecipientSchema);
