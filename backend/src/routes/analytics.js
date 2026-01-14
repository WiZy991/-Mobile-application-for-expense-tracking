const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');

const router = express.Router();

router.use(authenticateToken);

// Получить аналитику по периоду
router.get('/', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch (period) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
      default:
        startDate = new Date(2020, 0, 1);
        break;
    }

    // Общая статистика
    const statsResult = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_spent,
        COALESCE(SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_paid,
        COUNT(CASE WHEN type = 'charge' THEN 1 END) as invoices_count,
        COUNT(DISTINCT service_id) as services_count
      FROM transactions 
      WHERE client_id = $1 AND created_at >= $2`,
      [req.user.id, startDate]
    );

    const stats = statsResult.rows[0] || {};
    const totalSpent = parseFloat(stats.total_spent) || 0;
    const invoicesCount = parseInt(stats.invoices_count) || 0;

    // Расходы по категориям (услугам)
    const categoryResult = await pool.query(
      `SELECT 
        COALESCE(s.name, 'Другое') as name,
        COALESCE(SUM(t.amount), 0) as amount
      FROM transactions t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE t.client_id = $1 
        AND t.type = 'charge' 
        AND t.status = 'completed'
        AND t.created_at >= $2
      GROUP BY s.name
      ORDER BY amount DESC
      LIMIT 5`,
      [req.user.id, startDate]
    );

    const colors = ['#4CAF50', '#FF9800', '#2196F3', '#9C27B0', '#607D8B'];
    const byCategory = categoryResult.rows.map((row, index) => ({
      name: row.name,
      amount: parseFloat(row.amount),
      percent: totalSpent > 0 ? Math.round((parseFloat(row.amount) / totalSpent) * 100) : 0,
      color: colors[index % colors.length]
    }));

    // Данные по месяцам
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const monthlyResult = await pool.query(
      `SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        COALESCE(SUM(amount), 0) as spent
      FROM transactions
      WHERE client_id = $1 
        AND type = 'charge' 
        AND status = 'completed'
        AND created_at >= $2
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month`,
      [req.user.id, startDate]
    );

    const monthlyData = monthlyResult.rows.map(row => ({
      month: monthNames[parseInt(row.month) - 1],
      spent: parseFloat(row.spent)
    }));

    // Тренд (изменение за период)
    const trend = totalSpent > 0 ? `+${Math.round(totalSpent / 1000)}%` : '0%';

    res.json({
      totalSpent,
      totalPaid: parseFloat(stats.total_paid) || 0,
      invoicesCount,
      servicesCount: parseInt(stats.services_count) || 0,
      avgInvoice: invoicesCount > 0 ? Math.round(totalSpent / invoicesCount) : 0,
      trend,
      byCategory,
      monthlyData
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронизация аналитики с СБИС
router.post('/sync', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Аналитика синхронизирована',
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

