const { pool } = require('../database/init');
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
  const result = await pool.query(
    `INSERT INTO notifications (client_id, type, title, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [clientId, type, title, message]
  );

  return result.rows[0];
}

/**
 * Отправить уведомление клиенту
 */
async function sendNotification(clientId, type, title, message, options = {}) {
  try {
    // Создаём уведомление в БД
    const notification = await createNotification(clientId, type, title, message);

    // Получаем данные клиента
    const clientResult = await pool.query(
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

    // Push-уведомления будут отправляться через мобильное приложение
    // Здесь можно добавить интеграцию с FCM (Firebase Cloud Messaging)

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
  notifyPaymentRequired,
  notifyCharge,
  notifyLowBalance
};

