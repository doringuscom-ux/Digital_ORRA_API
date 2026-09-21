const mongoose = require('mongoose');

const stepOptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' }
}, { _id: false });

const flowStepSchema = new mongoose.Schema({
  stepNumber: { type: Number, required: true },
  stepKey: { type: String, required: true },
  title: { type: String, required: true },
  messageType: { 
    type: String, 
    enum: ['interactive_button', 'interactive_list', 'text'], 
    default: 'text' 
  },
  headerText: { type: String, default: '' },
  bodyText: { type: String, required: true },
  footerText: { type: String, default: '' },
  actionButtonText: { type: String, default: 'Choose Option' },
  options: [stepOptionSchema]
}, { _id: false });

const botFlowSchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true, 
    unique: true, 
    default: 'welcome_flow' 
  },
  isEnabled: { 
    type: Boolean, 
    default: true 
  },
  steps: [flowStepSchema]
}, { timestamps: true });

module.exports = mongoose.model('BotFlow', botFlowSchema);
