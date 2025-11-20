const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');
const { syncClientData, syncInvoices, mapSbisService } = require('../services/sbisService');

const router = express.Router();

router.use(authenticateToken);

// Синхронизация данных клиента со СБИС
router.post('/sync', async (req, res) => {
  try {
    const clientId = req.user.id;

    // Получаем contract_id клиента
    const clientResult = await pool.query(
      'SELECT sbis_contract_id FROM clients WHERE id = $1',
      [clientId]
    );

    if (!clientResult.rows[0]?.sbis_contract_id) {
      return res.status(400).json({ error: 'SBIS contract ID not configured for this client' });
    }

    // Синхронизируем услуги
    await syncClientData(clientId, clientResult.rows[0].sbis_contract_id);

    // Синхронизируем счета
    await syncInvoices(clientId, clientResult.rows[0].sbis_contract_id);

    res.json({ message: 'Synchronization completed successfully' });
  } catch (error) {
    console.error('SBIS sync error:', error);
    res.status(500).json({ error: error.message || 'Synchronization failed' });
  }
});

// Получить логи синхронизации
router.get('/sync-logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await pool.query(
      `SELECT * FROM sbis_sync_log 
       WHERE client_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get sync logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

