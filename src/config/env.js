require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),

  whatsapp: {
    metaToken: process.env.META_WA_TOKEN || process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
    wabaId: process.env.META_WABA_ID || '',
    apiVersion: process.env.META_API_VERSION || 'v20.0',
    verifyToken: process.env.META_VERIFY_TOKEN || 'sapatamu_waba_secret_2026',
  },

  ai: {
    baseUrl: process.env.NINER_ROUTER_URL || 'https://riwxk5s.abc-tunnel.us/v1',
    apiKey: process.env.NINER_ROUTER_KEY || 'sk-fb2a60ff904fde93-x7l7jq-86f104ed',
    model: process.env.NINER_ROUTER_MODEL || 'gc/gemini-2.5-flash',
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
};
