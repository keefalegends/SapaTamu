require('dotenv').config();

// Mencegah server mati mendadak jika terjadi uncaught exception atau unhandled rejection
process.on('uncaughtException', (err) => {
  console.error('🚨 [FATAL UNCAUGHT EXCEPTION]:', err.message, err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [FATAL UNHANDLED REJECTION]:', reason);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config/env');
const db = require('./src/db/database');
const webhookHandler = require('./src/gateway/webhookHandler');
const adminRoutes = require('./src/admin/routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// No-cache header untuk live development & UI updates
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ─── Static files (Dashboard Admin, Gambar Menu, Foto Kamar, dll.) ───────────
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/public', express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API Routes
app.use('/api/webhook/whatsapp', webhookHandler);
app.use('/webhook', webhookHandler);
app.use('/api/webhook/openkoneksi', webhookHandler); // Backward-compatibility alias
app.use('/api/admin', adminRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    architecture: 'Pure Meta WhatsApp Cloud API (Graph API v20.0 + Webhook)',
    timestamp: new Date().toISOString(),
  });
});

// Fallback to Dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Start Server
app.listen(config.port, () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║               SAPATAMU WABA BACKEND SERVER                   ║');
  console.log('║        Murni Meta WhatsApp Cloud API (Official Graph API)    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ 🚀 Server Running     : http://localhost:${config.port}              ║`);
  console.log(`║ 🖥️  Admin Dashboard   : http://localhost:${config.port}              ║`);
  console.log(`║ 🌐 Webhook Inbound    : http://localhost:${config.port}/api/webhook/whatsapp ║`);
  console.log(`║ 🤖 AI Engine          : Gemini 2.5 Flash (${config.ai.model})   ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Auto-sync WooCommerce Catalog pada startup
  try {
    const { syncCatalogToDatabase } = require('./src/services/woocommerceService');
    syncCatalogToDatabase()
      .then((res) => {
        if (res && res.success) {
          console.log(`🛒 [WOOCOMMERCE] Auto-sync katalog awal sukses: ${res.syncedRooms} kamar, ${res.syncedMenus} menu.`);
        } else {
          console.warn(`⚠️ [WOOCOMMERCE] Auto-sync katalog dilewati / info: ${res ? res.message || res.error : 'Unknown'}`);
        }
      })
      .catch((err) => {
        console.error('⚠️ [WOOCOMMERCE] Auto-sync awal error:', err.message);
      });
  } catch (err) {
    console.error('⚠️ [WOOCOMMERCE] Gagal inisialisasi auto-sync:', err.message);
  }
});
