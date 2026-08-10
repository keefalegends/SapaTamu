require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  // WhatsApp Cloud API
  whatsappToken:   process.env.WHATSAPP_TOKEN   || '',
  phoneNumberId:   process.env.PHONE_NUMBER_ID  || '',
  metaApiVersion:  process.env.META_API_VERSION || 'v20.0',
  verifyToken:     process.env.VERIFY_TOKEN     || 'sapatamu_secret_token_123',

  // Chatwoot
  chatwootBaseUrl:        process.env.CHATWOOT_BASE_URL         || 'http://localhost:3001',
  chatwootApiToken:       process.env.CHATWOOT_API_TOKEN        || '',
  chatwootAccountId:      parseInt(process.env.CHATWOOT_ACCOUNT_ID || '2', 10),
  chatwootWebhookSecret:  process.env.CHATWOOT_WEBHOOK_SECRET   || '',
  chatwootEscalationTeam: parseInt(process.env.CHATWOOT_ESCALATION_TEAM_ID || '1', 10),

  // Google Gemini AI (legacy)
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel:  process.env.GEMINI_MODEL   || 'gemini-2.0-flash',

  // OpenRouter AI (active)
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel:  process.env.OPENROUTER_MODEL   || 'google/gemini-2.0-flash-exp:free',

  // Escalation & Entry keywords
  escalationKeywords: (process.env.ESCALATION_KEYWORDS || 'alergi,komplain,darurat,refund,bicara sama orang,urgent,marah')
    .split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
  csEntryTriggers: (process.env.CS_ENTRY_TRIGGERS || 'cs,bantuan,halo,hi,hello,hai,start,menu')
    .split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
};

module.exports = config;
