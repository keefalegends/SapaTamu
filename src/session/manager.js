const { getDb } = require('../db/session');

/**
 * Ambil status session percakapan.
 * Default: 'idle' jika belum ada record.
 * Status valid: 'idle' | 'cs_active' | 'escalated'
 */
function getStatus(conversationId) {
  const db  = getDb();
  const row = db.prepare('SELECT status FROM session_state WHERE conversation_id = ?').get(conversationId);
  return row ? row.status : 'idle';
}

/**
 * Set / update status session percakapan.
 */
function setStatus(conversationId, newStatus) {
  const db = getDb();
  db.prepare(`
    INSERT INTO session_state (conversation_id, status, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(conversation_id) DO UPDATE
      SET status     = excluded.status,
          updated_at = excluded.updated_at
  `).run(conversationId, newStatus);
}

module.exports = { getStatus, setStatus };
