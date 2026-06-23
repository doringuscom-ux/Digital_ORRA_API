const mongoose = require('mongoose');

const AppConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('AppConfig', AppConfigSchema);
