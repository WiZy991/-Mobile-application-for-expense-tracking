const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');

const router = express.Router();

router.use(authenticateToken);

// Получить историю транзакций
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 50, type, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        t.id,
        t.type,
        t.amount,
        t.description,
        t.period_start,
        t.period_end,
        t.status,
        t.created_at,
        s.name as service_name,
        s.code as service_code
      FROM transactions t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE t.client_id = $1
    `;

    const params = [req.user.id];
    let paramCount = 2;

    if (type) {
      query += ` AND t.type = $${paramCount++}`;
      params.push(type);
    }

    if (start_date) {
      query += ` AND t.created_at >= $${paramCount++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND t.created_at <= $${paramCount++}`;
      params.push(end_date);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Получаем общее количество
    const countQuery = `
      SELECT COUNT(*) as total
      FROM transactions
      WHERE client_id = $1
      ${type ? `AND type = $2` : ''}
    `;
    const countParams = type ? [req.user.id, type] : [req.user.id];
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить детали транзакции
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        t.*,
        s.name as service_name,
        s.code as service_code,
        s.description as service_description
      FROM transactions t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE t.id = $1 AND t.client_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

