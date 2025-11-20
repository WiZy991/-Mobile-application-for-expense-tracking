const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');

const router = express.Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Получить информацию о текущем клиенте
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, phone, balance, sbis_contract_id, created_at FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновить информацию о клиенте
router.put('/me', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.user.id);

    const query = `
      UPDATE clients 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING id, email, name, phone, balance, created_at
    `;

    const result = await pool.query(query, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить баланс
router.get('/balance', async (req, res) => {
  try {
    const result = await pool.query('SELECT balance FROM clients WHERE id = $1', [req.user.id]);
    res.json({ balance: result.rows[0].balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

