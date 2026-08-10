const config = require('../config/env');

/**
 * Deteksi apakah pesan adalah trigger masuk ke CS flow.
 * Dipanggil saat session masih 'idle'.
 */
function isCsEntry(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return config.csEntryTriggers.some(trigger => lower.includes(trigger));
}

module.exports = { isCsEntry };
