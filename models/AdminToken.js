const mongoose = require('mongoose');

const AdminTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  }
}, { timestamps: true });

module.exports = mongoose.model('AdminToken', AdminTokenSchema);
