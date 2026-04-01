const axios = require('axios');
const { dbQuery } = require('../database/init');
const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');

// Настройка email
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// Настройка Telegram бота (если токен указан)
let telegramBot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * Создать уведомление в БД
 */
async function createNotification(clientId, type, title, message) {
  const result = await dbQuery(
    `INSERT INTO notifications (client_id, type, title, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [clientId, type, title, message]
  );

  return result.rows[0];
}

async function sendPushNotification(clientId, title, message, data = {}) {
  if (!process.env.FIREBASE_SERVER_KEY) {
    return;
  }

  try {
    const tokensResult = await dbQuery(
      `SELECT fcm_token
       FROM client_push_tokens
       WHERE client_id = $1 AND is_active = true`,
      [clientId]
    );

    if (!tokensResult.rows.length) {
      return;
    }

    for (const row of tokensResult.rows) {
      const token = row.fcm_token;
      try {
        const response = await axios.post(
          'https://fcm.googleapis.com/fcm/send',
          {
            to: token,
            priority: 'high',
            notification: {
              title,
              body: message,
              sound: 'default'
            },
            data: {
              ...data,
              type: String(data.type || ''),
              relatedId: String(data.relatedId || ''),
              relatedType: String(data.relatedType || '')
            }
          },
          {
            headers: {
              Authorization: `key=${process.env.FIREBASE_SERVER_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        const resultItem = response.data?.results?.[0];
        if (resultItem?.error === 'NotRegistered' || resultItem?.error === 'InvalidRegistration') {
          await dbQuery(
            'UPDATE client_push_tokens SET is_active = false, updated_at = NOW() WHERE client_id = $1 AND fcm_token = $2',
            [clientId, token]
          );
        }
      } catch (pushError) {
        console.error('Push send error:', pushError.response?.data || pushError.message);
      }
    }
  } catch (error) {
    console.error('Push notification error:', error.message);
  }
}

/**
 * Отправить уведомление клиенту
 */
async function sendNotification(clientId, type, title, message, options = {}) {
  try {
    // Создаём уведомление в БД
    const notification = await createNotification(clientId, type, title, message);

    // Получаем данные клиента
    const clientResult = await dbQuery(
      'SELECT email, phone FROM clients WHERE id = $1',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      throw new Error('Client not found');
    }

    const client = clientResult.rows[0];

    // Отправляем email
    if (client.email && options.sendEmail !== false) {
      try {
        await emailTransporter.sendMail({
          from: process.env.SMTP_USER,
          to: client.email,
          subject: title,
          text: message,
          html: `<p>${message.replace(/\n/g, '<br>')}</p>`
        });
      } catch (error) {
        console.error('Email send error:', error);
      }
    }

    // Отправляем Telegram (если настроен)
    if (telegramBot && options.telegramChatId) {
      try {
        await telegramBot.sendMessage(options.telegramChatId, `*${title}*\n\n${message}`, {
          parse_mode: 'Markdown'
        });
      } catch (error) {
        console.error('Telegram send error:', error);
      }
    }

    if (options.sendPush !== false) {
      await sendPushNotification(clientId, title, message, {
        type,
        relatedId: options.relatedId || '',
        relatedType: options.relatedType || ''
      });
    }

    return notification;
  } catch (error) {
    console.error('Send notification error:', error);
    throw error;
  }
}

/**
 * Уведомление о необходимости оплаты
 */
async function notifyPaymentRequired(clientId, transaction) {
  const serviceName = transaction.service_name || 'Услуга';
  const amount = transaction.amount;
  const period = transaction.period_end 
    ? `за период до ${new Date(transaction.period_end).toLocaleDateString('ru-RU')}`
    : '';

  const title = 'Требуется оплата';
  const message = `Необходимо оплатить ${serviceName} на сумму ${amount} ₽ ${period}. Пожалуйста, произведите оплату.`;

  return await sendNotification(clientId, 'payment_required', title, message);
}

/**
 * Уведомление о начислении
 */
async function notifyCharge(clientId, transaction) {
  const serviceName = transaction.service_name || 'Услуга';
  const amount = transaction.amount;

  const title = 'Произведено начисление';
  const message = `По услуге "${serviceName}" произведено начисление на сумму ${amount} ₽.`;

  return await sendNotification(clientId, 'charge', title, message);
}

/**
 * Уведомление о низком балансе
 */
async function notifyLowBalance(clientId, balance) {
  const title = 'Низкий баланс';
  const message = `Ваш баланс составляет ${balance} ₽. Рекомендуем пополнить счёт.`;

  return await sendNotification(clientId, 'low_balance', title, message);
}

module.exports = {
  sendNotification,
  createNotification,
  sendPushNotification,
  notifyPaymentRequired,
  notifyCharge,
  notifyLowBalance
};

