require('dotenv').config();

const express       = require('express');
const path          = require('path');
const config        = require('./src/config/env');
const { getDb }     = require('./src/db/session');
const chatwootRoute = require('./src/routes/chatwootWebhook');

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static files (Gambar Menu, Foto Kamar, dll.) ─────────────────────────────
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service:   'SapaTamu / WazapBro AI Backend',
    status:    'online',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/webhook/chatwoot', chatwootRoute);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  // Init SQLite DB
  getDb();

  app.listen(config.port, () => {
    console.log('\n==================================================');
    console.log(`🚀 SapaTamu / WazapBro AI Backend`);
    console.log(`📡 URL   : http://localhost:${config.port}`);
    console.log(`🤖 Chatwoot Agent Bot Webhook:`);
    console.log(`   POST  http://localhost:${config.port}/webhook/chatwoot`);
    console.log('==================================================\n');
  });
}

start().catch(console.error);
