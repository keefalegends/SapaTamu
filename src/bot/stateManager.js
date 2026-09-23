const db = require('../db/database');
const axios = require('axios');

const RASA_URL = process.env.RASA_API_URL || 'http://localhost:5005/webhooks/rest/webhook';

/**
 * StateManager: Manajemen status sesi pengguna (SQLite WAL + Rasa AI Sync)
 * Menjamin state direset ke 'idle' begitu transaksi selesai atau dibatalkan,
 * serta membersihkan tracker memori di Rasa agar tidak terjadi context leak.
 */
const StateManager = {
  /**
   * Mengambil sesi aktif pengguna
   * @param {string} phone 
   * @returns {{ status: string, draft: object }}
   */
  get(phone) {
    const cleanPhone = String(phone).replace(/\D/g, '');
    return db.getSession(cleanPhone);
  },

  /**
   * Mengubah status sesi pengguna
   * @param {string} phone 
   * @param {string} status 
   * @param {object} draft 
   */
  set(phone, status, draft = {}) {
    const cleanPhone = String(phone).replace(/\D/g, '');
    db.setSession(cleanPhone, status, draft);
  },

  /**
   * Reset total sesi ke 'idle' dan restart tracker Rasa AI
   * @param {string} phone 
   * @param {string} reason 
   */
  async reset(phone, reason = 'general_reset') {
    const cleanPhone = String(phone).replace(/\D/g, '');
    
    // 1. Reset status sesi di SQLite lokal
    db.clearSession(cleanPhone);

    // 2. Reset memori active_loop dan slots di Rasa AI Server
    try {
      await axios.post(
        RASA_URL,
        {
          sender: cleanPhone,
          message: '/restart',
        },
        { timeout: 1500 }
      );
      console.log(`🔄 [STATE MANAGER] Reset sesi +${cleanPhone} ➔ IDLE & Rasa /restart (Alasan: ${reason})`);
    } catch (err) {
      // Non-blocking jika Rasa sedang offline
      console.log(`🔄 [STATE MANAGER] Reset lokal +${cleanPhone} ➔ IDLE (Rasa unreachable: ${err.message})`);
    }
  },
};

module.exports = StateManager;
