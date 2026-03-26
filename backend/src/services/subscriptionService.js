const { pool, dbQuery, isMySQL } = require('../database/init');
const { sendNotification } = require('./notificationService');
const { createInvoice } = require('./sbisService');
const axios = require('axios');

/**
 * Сервис для управления подписками и автоматического продления
 */

/**
 * Проверка подписок, требующих продления
 */
async function checkSubscriptionsForRenewal() {
  try {
    const today = new Date();
    const renewalDate = new Date(today);
    renewalDate.setDate(renewalDate.getDate() + 3); // Продлеваем за 3 дня до окончания

    // Находим подписки, которые скоро истекают
    const result = await dbQuery(`
      SELECT 
        cs.*,
        sp.name as plan_name,
        sp.price as plan_price,
        sp.billing_period as plan_billing_period,
        c.id as client_id,
        c.name as client_name,
        c.email,
        c.balance as balance,
        c.inn,
        c.kpp
      FROM client_subscriptions cs
      JOIN subscription_plans sp ON cs.plan_id = sp.id
      JOIN clients c ON cs.client_id = c.id
      WHERE cs.status = 'active'
        AND cs.auto_renewal = true
        AND cs.next_billing_date BETWEEN $1 AND $2
      ORDER BY cs.next_billing_date ASC
    `, [today.toISOString().split('T')[0], renewalDate.toISOString().split('T')[0]]);

    console.log(`🔄 Found ${result.rows.length} subscriptions ready for renewal`);

    for (const subscription of result.rows) {
      try {
        await renewSubscription(subscription);
        console.log(`✅ Auto-renewed subscription ${subscription.id} (${subscription.plan_name})`);
      } catch (error) {
        console.error(`❌ Failed to auto-renew subscription ${subscription.id}:`, error.message);
        
        // Отправляем уведомление об ошибке
        await sendNotification(
          subscription.client_id,
          'subscription_renewal_failed',
          'Ошибка автоматического продления подписки',
          `Не удалось автоматически продлить подписку "${subscription.plan_name}". Пожалуйста, свяжитесь с поддержкой или пополните баланс.`,
          {
            sendEmail: true
          }
        );

        await dbQuery(
          `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            subscription.client_id,
            'subscription_renewal_failed',
            'Ошибка автоматического продления подписки',
            `Не удалось автоматически продлить подписку "${subscription.plan_name}". Пожалуйста, свяжитесь с поддержкой или пополните баланс.`,
            subscription.id,
            'subscription'
          ]
        );
      }
    }

    return result.rows.length;
  } catch (error) {
    console.error('Error checking subscriptions for renewal:', error);
    throw error;
  }
}

/**
 * Продление подписки
 */
async function renewSubscription(subscription) {
  // Транзакции отличаются в MySQL и PostgreSQL
  const client = isMySQL ? await pool.getConnection() : await pool.connect();
  
  try {
    if (isMySQL) {
      await client.beginTransaction();
    } else {
      await client.query('BEGIN');
    }

    // Проверяем баланс еще раз
    const clientResult = await dbQuery(
      'SELECT balance FROM clients WHERE id = $1 FOR UPDATE',
      [subscription.client_id],
      client
    );

    if (clientResult.rows.length === 0) {
      throw new Error('Client not found');
    }

    const currentBalance = parseFloat(clientResult.rows[0].balance);
    const planPrice = parseFloat(subscription.plan_price);

    if (currentBalance < planPrice) {
      throw new Error('Insufficient balance');
    }

    // Вычисляем новые даты в зависимости от периода
    const newStartDate = new Date(subscription.end_date);
    const newEndDate = new Date(subscription.end_date);
    const newNextBillingDate = new Date(subscription.end_date);

    switch (subscription.plan_billing_period) {
      case 'yearly':
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
        newNextBillingDate.setFullYear(newNextBillingDate.getFullYear() + 1);
        break;
      case 'half_yearly':
        newEndDate.setMonth(newEndDate.getMonth() + 6);
        newNextBillingDate.setMonth(newNextBillingDate.getMonth() + 6);
        break;
      case 'quarterly':
        newEndDate.setMonth(newEndDate.getMonth() + 3);
        newNextBillingDate.setMonth(newNextBillingDate.getMonth() + 3);
        break;
      case 'monthly':
      default:
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        newNextBillingDate.setMonth(newNextBillingDate.getMonth() + 1);
        break;
    }

    // Списываем с баланса
    await client.query(
      'UPDATE clients SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [subscription.plan_price, subscription.client_id]
    );

    // Создаем транзакцию
    await dbQuery(
      `INSERT INTO transactions 
       (client_id, type, amount, description, status, sbis_invoice_id)
       VALUES ($1, 'charge', $2, $3, 'completed', $4)`,
      [
        subscription.client_id,
        planPrice,
        `Автоматическое продление подписки: ${subscription.plan_name}`,
        null
      ],
      client
    );

    // Обновляем подписку
    await dbQuery(
      `UPDATE client_subscriptions
       SET 
         start_date = $1,
         end_date = $2,
         next_billing_date = $3,
         updated_at = NOW()
       WHERE id = $4`,
      [
        newStartDate.toISOString().split('T')[0],
        newEndDate.toISOString().split('T')[0],
        newNextBillingDate.toISOString().split('T')[0],
        subscription.id
      ],
      client
    );

    // Создаем счет в СБИС (если есть ИНН)
    if (subscription.inn) {
      try {
        const invoiceData = {
          buyerINN: subscription.inn,
          buyerName: subscription.client_name,
          buyerKPP: subscription.kpp || null,
          sellerINN: process.env.SBIS_SELLER_INN || '2543082240',
          amount: subscription.plan_price,
          description: `Продление подписки: ${subscription.plan_name}`,
          items: [{
            name: `Продление подписки "${subscription.plan_name}" (${subscription.plan_billing_period === 'yearly' ? 'годовая' : 'месячная'})`,
            quantity: 1,
            price: subscription.plan_price,
            total: subscription.plan_price,
            unit: 'шт',
          }],
          comment: `Автоматическое продление подписки "${subscription.plan_name}" через приложение WorldCashBox`,
        };

        const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const invoiceResponse = await axios.post(
          `${apiBaseUrl}/api/sbis-proxy/create-invoice`,
          {
            invoiceData,
            userId: 'default',
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        if (invoiceResponse.data && invoiceResponse.data.id) {
          // Обновляем транзакцию с ID счета
          await client.query(
            'UPDATE transactions SET sbis_invoice_id = $1 WHERE client_id = $2 AND description LIKE $3 ORDER BY created_at DESC LIMIT 1',
            [invoiceResponse.data.id, subscription.client_id, `%${subscription.plan_name}%`]
          );
        }
      } catch (sbisError) {
        console.warn('⚠️ Не удалось создать счет в СБИС:', sbisError.message);
      }
    }

    // Отправляем уведомление об успешном продлении
    const renewalMessage = `Подписка "${subscription.plan_name}" успешно продлена до ${newEndDate.toLocaleDateString('ru-RU')}.\n\nСписано: ${subscription.plan_price.toLocaleString('ru-RU')} ₽`;
    
    await sendNotification(
      subscription.client_id,
      'subscription_renewed',
      '✅ Подписка успешно продлена',
      renewalMessage,
      {
        sendEmail: true
      }
    );

    await pool.query(
      `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        subscription.client_id,
        'subscription_renewed',
        '✅ Подписка успешно продлена',
        renewalMessage,
        subscription.id,
        'subscription'
      ]
    );

    if (isMySQL) {
      await client.commit();
    } else {
      await client.query('COMMIT');
    }
  } catch (error) {
    try {
      if (isMySQL) {
        await client.rollback();
      } else {
        await client.query('ROLLBACK');
      }
    } catch (_) {}
    throw error;
  } finally {
    if (isMySQL) {
      client.release();
    } else {
      client.release();
    }
  }
}

/**
 * Проверка подписок с приближающимся сроком окончания
 */
async function checkExpiringSubscriptions() {
  try {
    const today = new Date();
    const warningDate = new Date(today);
    warningDate.setDate(warningDate.getDate() + 7); // Предупреждение за 7 дней

    const result = await pool.query(`
      SELECT 
        cs.*,
        sp.name as plan_name,
        sp.price::numeric as plan_price,
        c.id as client_id,
        c.name as client_name,
        c.email,
        c.balance::numeric
      FROM client_subscriptions cs
      JOIN subscription_plans sp ON cs.plan_id = sp.id
      JOIN clients c ON cs.client_id = c.id
      WHERE cs.status = 'active'
        AND cs.end_date BETWEEN $1 AND $2
      ORDER BY cs.end_date ASC
    `, [today.toISOString().split('T')[0], warningDate.toISOString().split('T')[0]]);

    console.log(`🔍 Found ${result.rows.length} subscriptions expiring soon`);

    for (const subscription of result.rows) {
      const daysUntilExpiry = Math.ceil(
        (new Date(subscription.end_date) - today) / (1000 * 60 * 60 * 24)
      );

      let title = '';
      let message = '';

      if (daysUntilExpiry <= 3) {
        title = `⚠️ СРОЧНО: Подписка "${subscription.plan_name}" истекает через ${daysUntilExpiry} ${getDayWord(daysUntilExpiry)}`;
        message = `Ваша подписка "${subscription.plan_name}" истекает ${new Date(subscription.end_date).toLocaleDateString('ru-RU')}.\n\n`;
        
        if (subscription.auto_renewal) {
          message += `Автоматическое продление: ${subscription.plan_price.toLocaleString('ru-RU')} ₽\n`;
          message += `Текущий баланс: ${parseFloat(subscription.balance).toLocaleString('ru-RU')} ₽\n\n`;
          
          if (parseFloat(subscription.balance) >= subscription.plan_price) {
            message += `✅ На балансе достаточно средств. Продление произойдет автоматически.`;
          } else {
            message += `❌ Недостаточно средств для автоматического продления. Пополните баланс.`;
          }
        } else {
          message += `Стоимость продления: ${subscription.plan_price.toLocaleString('ru-RU')} ₽\n`;
          message += `Пожалуйста, продлите подписку в ближайшее время.`;
        }
      } else {
        title = `📅 Подписка "${subscription.plan_name}" истекает через ${daysUntilExpiry} ${getDayWord(daysUntilExpiry)}`;
        message = `Ваша подписка "${subscription.plan_name}" истекает ${new Date(subscription.end_date).toLocaleDateString('ru-RU')}.\n\n`;
        message += `Стоимость продления: ${subscription.plan_price.toLocaleString('ru-RU')} ₽`;
      }

      // Отправляем уведомление
      await sendNotification(
        subscription.client_id,
        'subscription_expiring',
        title,
        message,
        {
          sendEmail: true
        }
      );

      await pool.query(
        `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          subscription.client_id,
          'subscription_expiring',
          title,
          message,
          subscription.id,
          'subscription'
        ]
      );

      // Обновляем время последнего уведомления
      await pool.query(
        'UPDATE client_subscriptions SET updated_at = NOW() WHERE id = $1',
        [subscription.id]
      );

      console.log(`✅ Sent notification for subscription ${subscription.id} (${subscription.plan_name})`);
    }

    return result.rows.length;
  } catch (error) {
    console.error('Error checking expiring subscriptions:', error);
    throw error;
  }
}

function getDayWord(days) {
  if (days === 1) return 'день';
  if (days >= 2 && days <= 4) return 'дня';
  return 'дней';
}

module.exports = {
  checkSubscriptionsForRenewal,
  renewSubscription,
  checkExpiringSubscriptions
};
