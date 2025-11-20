const cron = require('node-cron');
const { pool } = require('../database/init');
const { notifyPaymentRequired } = require('../services/notificationService');

/**
 * Проверяет неоплаченные счета и отправляет уведомления
 */
async function checkPendingPayments() {
  try {
    // Находим все неоплаченные транзакции старше 1 дня
    const result = await pool.query(
      `SELECT 
        t.id,
        t.client_id,
        t.amount,
        t.description,
        t.period_end,
        s.name as service_name
      FROM transactions t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE t.type = 'charge'
        AND t.status = 'pending'
        AND t.created_at < NOW() - INTERVAL '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.client_id = t.client_id
            AND n.type = 'payment_required'
            AND n.created_at > t.created_at
            AND n.created_at > NOW() - INTERVAL '1 day'
        )`
    );

    for (const transaction of result.rows) {
      await notifyPaymentRequired(transaction.client_id, transaction);
    }

    console.log(`Checked ${result.rows.length} pending payments`);
  } catch (error) {
    console.error('Payment reminder job error:', error);
  }
}

/**
 * Проверяет низкий баланс и отправляет уведомления
 */
async function checkLowBalance() {
  try {
    const LOW_BALANCE_THRESHOLD = 1000; // Порог низкого баланса

    const result = await pool.query(
      `SELECT id, balance
       FROM clients
       WHERE balance < $1
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.client_id = clients.id
             AND n.type = 'low_balance'
             AND n.created_at > NOW() - INTERVAL '7 days'
         )`,
      [LOW_BALANCE_THRESHOLD]
    );

    for (const client of result.rows) {
      const { notifyLowBalance } = require('../services/notificationService');
      await notifyLowBalance(client.id, client.balance);
    }

    console.log(`Checked ${result.rows.length} clients with low balance`);
  } catch (error) {
    console.error('Low balance check job error:', error);
  }
}

// Запускаем проверку неоплаченных счетов каждый день в 10:00
cron.schedule('0 10 * * *', checkPendingPayments);

// Запускаем проверку низкого баланса каждый день в 9:00
cron.schedule('0 9 * * *', checkLowBalance);

console.log('✅ Payment reminder jobs scheduled');

module.exports = {
  checkPendingPayments,
  checkLowBalance
};

