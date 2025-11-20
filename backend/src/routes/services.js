const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');

const router = express.Router();

router.use(authenticateToken);

// Получить все услуги клиента
router.get('/my-services', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        cs.id,
        cs.start_date,
        cs.end_date,
        cs.is_active,
        s.id as service_id,
        s.name,
        s.code,
        s.description,
        s.price,
        s.billing_period
      FROM client_services cs
      JOIN services s ON cs.service_id = s.id
      WHERE cs.client_id = $1
      ORDER BY cs.start_date DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get client services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить все доступные услуги
router.get('/available', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM services WHERE is_active = true ORDER BY name'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get available services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

