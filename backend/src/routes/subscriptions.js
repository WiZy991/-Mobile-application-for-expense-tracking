const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');
const { createInvoice } = require('../services/sbisService');

const router = express.Router();

router.use(authenticateToken);

/**
 * GET /api/subscriptions/plans
 * Получить все доступные тарифы подписок
 */
router.get('/plans', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC, price ASC'
    );

    // Убираем дубликаты по code, оставляя только первый
    const uniquePlans = [];
    const seenCodes = new Set();
    
    for (const plan of result.rows) {
      if (!seenCodes.has(plan.code)) {
        seenCodes.add(plan.code);
        uniquePlans.push(plan);
      }
    }

    res.json({
      plans: uniquePlans.map(plan => ({
        ...plan,
        features: typeof plan.features === 'string' 
          ? JSON.parse(plan.features) 
          : plan.features
      }))
    });
  } catch (error) {
    console.error('Get subscription plans error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/subscriptions/my
 * Получить активные подписки клиента
 */
router.get('/my', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cs.*,
        sp.name as plan_name,
        sp.code as plan_code,
        sp.description as plan_description,
        sp.price as plan_price,
        sp.billing_period as plan_billing_period,
        sp.features as plan_features
      FROM client_subscriptions cs
      JOIN subscription_plans sp ON cs.plan_id = sp.id
      WHERE cs.client_id = $1
      ORDER BY cs.created_at DESC
    `, [req.user.id]);

    res.json({
      subscriptions: result.rows.map(sub => ({
        ...sub,
        plan_features: typeof sub.plan_features === 'string'
          ? JSON.parse(sub.plan_features)
          : sub.plan_features,
        days_until_renewal: Math.ceil(
          (new Date(sub.next_billing_date) - new Date()) / (1000 * 60 * 60 * 24)
        )
      }))
    });
  } catch (error) {
    console.error('Get my subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/subscriptions/subscribe
 * Подписаться на тариф
 */
router.post('/subscribe', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { plan_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({ error: 'plan_id is required' });
    }

    // Получаем тариф
    const planResult = await client.query(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
      [plan_id]
    );

    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    const plan = planResult.rows[0];

    // Получаем данные клиента
    const clientResult = await client.query(
      'SELECT balance, inn, kpp, name FROM clients WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientData = clientResult.rows[0];
    const currentBalance = parseFloat(clientData.balance);

    // Проверяем баланс
    if (currentBalance < plan.price) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Insufficient balance',
        required: plan.price,
        current: currentBalance
      });
    }

    // Вычисляем даты в зависимости от периода
    const startDate = new Date();
    const endDate = new Date();
    const nextBillingDate = new Date();

    switch (plan.billing_period) {
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        break;
      case 'half_yearly':
        endDate.setMonth(endDate.getMonth() + 6);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 6);
        break;
      case 'quarterly':
        endDate.setMonth(endDate.getMonth() + 3);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
        break;
      case 'monthly':
      default:
        endDate.setMonth(endDate.getMonth() + 1);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        break;
    }

    // Отменяем предыдущие активные подписки (если есть)
    await client.query(
      `UPDATE client_subscriptions 
       SET status = 'cancelled', updated_at = NOW()
       WHERE client_id = $1 AND status = 'active'`,
      [req.user.id]
    );

    // Создаем новую подписку
    const subscriptionResult = await client.query(
      `INSERT INTO client_subscriptions 
       (client_id, plan_id, start_date, end_date, next_billing_date, auto_renewal, status)
       VALUES ($1, $2, $3, $4, $5, true, 'active')
       RETURNING *`,
      [
        req.user.id,
        plan.id,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        nextBillingDate.toISOString().split('T')[0]
      ]
    );

    const subscription = subscriptionResult.rows[0];

    // Списываем с баланса
    await client.query(
      'UPDATE clients SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [plan.price, req.user.id]
    );

    // Создаем транзакцию
    await client.query(
      `INSERT INTO transactions 
       (client_id, type, amount, description, status, sbis_invoice_id)
       VALUES ($1, 'charge', $2, $3, 'completed', $4)`,
      [
        req.user.id,
        plan.price,
        `Подписка: ${plan.name}`,
        null
      ]
    );

    // Создаем счет в СБИС
    let sbisInvoiceId = null;
    let sbisInvoiceNumber = null;
    
    if (clientData.inn) {
      try {
        const invoiceData = {
          buyerINN: clientData.inn,
          buyerName: clientData.name,
          buyerKPP: clientData.kpp || null,
          sellerINN: process.env.SBIS_SELLER_INN || '2543082240',
          amount: plan.price,
          description: `Подписка: ${plan.name}`,
          items: [{
            name: `Подписка "${plan.name}" (${plan.billing_period === 'yearly' ? 'годовая' : 'месячная'})`,
            quantity: 1,
            price: plan.price,
            total: plan.price,
            unit: 'шт',
          }],
          comment: `Подписка на тариф "${plan.name}" через приложение WorldCashBox`,
        };

        const sbisInvoice = await createInvoice(invoiceData, req.user.id);

        if (sbisInvoice.success) {
          sbisInvoiceId = sbisInvoice.data.id;
          sbisInvoiceNumber = sbisInvoice.data.number;

          // Обновляем транзакцию с ID счета
          await client.query(
            'UPDATE transactions SET sbis_invoice_id = $1, description = $2 WHERE client_id = $3 AND description LIKE $4 ORDER BY created_at DESC LIMIT 1',
            [
              sbisInvoiceId,
              `Подписка: ${plan.name} (Счет СБИС №${sbisInvoiceNumber})`,
              req.user.id,
              `%${plan.name}%`
            ]
          );

          // Обновляем подписку с ID счета СБИС
          await client.query(
            'UPDATE client_subscriptions SET sbis_subscription_id = $1 WHERE id = $2',
            [sbisInvoiceId, subscription.id]
          );
        }
      } catch (sbisError) {
        console.warn('⚠️ Не удалось создать счет в СБИС:', sbisError.message);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      subscription: {
        ...subscription,
        plan: {
          name: plan.name,
          code: plan.code,
          description: plan.description,
          price: plan.price,
          billing_period: plan.billing_period,
          features: typeof plan.features === 'string' 
            ? JSON.parse(plan.features) 
            : plan.features
        },
        sbis_invoice_number: sbisInvoiceNumber
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/subscriptions/:id/cancel
 * Отменить подписку
 */
router.put('/:id/cancel', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE client_subscriptions 
       SET status = 'cancelled', auto_renewal = false, updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND status = 'active'
       RETURNING *`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found or already cancelled' });
    }

    res.json({
      success: true,
      subscription: result.rows[0]
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/subscriptions/:id/auto-renewal
 * Включить/выключить автопродление
 */
router.put('/:id/auto-renewal', async (req, res) => {
  try {
    const { auto_renewal } = req.body;

    const result = await pool.query(
      `UPDATE client_subscriptions 
       SET auto_renewal = $1, updated_at = NOW()
       WHERE id = $2 AND client_id = $3
       RETURNING *`,
      [auto_renewal !== undefined ? auto_renewal : true, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      success: true,
      subscription: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle auto-renewal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
