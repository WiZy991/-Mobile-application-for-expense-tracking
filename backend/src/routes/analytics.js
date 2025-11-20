const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');

const router = express.Router();

router.use(authenticateToken);

// Получить аналитику за год
router.get('/yearly/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Общая сумма за год
    const totalResult = await pool.query(
      `SELECT 
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE client_id = $1 
        AND type = 'charge'
        AND status = 'completed'
        AND created_at >= $2 
        AND created_at <= $3`,
      [req.user.id, startDate, endDate]
    );

    // Разбивка по сервисам
    const byServiceResult = await pool.query(
      `SELECT 
        s.name as service_name,
        s.code as service_code,
        COALESCE(SUM(t.amount), 0) as total_amount,
        COUNT(*) as transaction_count
      FROM transactions t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE t.client_id = $1 
        AND t.type = 'charge'
        AND t.status = 'completed'
        AND t.created_at >= $2 
        AND t.created_at <= $3
      GROUP BY s.id, s.name, s.code
      ORDER BY total_amount DESC`,
      [req.user.id, startDate, endDate]
    );

    // Разбивка по месяцам
    const byMonthResult = await pool.query(
      `SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE client_id = $1 
        AND type = 'charge'
        AND status = 'completed'
        AND created_at >= $2 
        AND created_at <= $3
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month`,
      [req.user.id, startDate, endDate]
    );

    res.json({
      year,
      total: parseFloat(totalResult.rows[0].total),
      transaction_count: parseInt(totalResult.rows[0].transaction_count),
      by_service: byServiceResult.rows.map(row => ({
        service_name: row.service_name || 'Другое',
        service_code: row.service_code || 'other',
        total_amount: parseFloat(row.total_amount),
        transaction_count: parseInt(row.transaction_count)
      })),
      by_month: byMonthResult.rows.map(row => ({
        month: row.month,
        total_amount: parseFloat(row.total_amount),
        transaction_count: parseInt(row.transaction_count)
      }))
    });
  } catch (error) {
    console.error('Get yearly analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить аналитику за текущий год
router.get('/current-year', async (req, res) => {
  const currentYear = new Date().getFullYear();
  req.params.year = currentYear;
  return router.handle({ ...req, params: { year: currentYear } }, res);
});

module.exports = router;

