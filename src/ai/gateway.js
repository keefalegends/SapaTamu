const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/env');

let _client = null;

function getGeminiClient() {
  if (!_client) {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY belum diset di .env!');
    }
    _client = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return _client;
}

module.exports = { getGeminiClient };
