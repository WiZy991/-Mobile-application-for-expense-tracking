const admin = require('firebase-admin');
const { dbQuery } = require('../database/init');

let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return true;
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccount) {
      console.warn('[Push] FIREBASE_SERVICE_ACCOUNT_JSON not set, push notifications disabled');
      return false;
    }
    const parsed = JSON.parse(serviceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
    firebaseInitialized = true;
    console.log('[Push] Firebase Admin initialized');
    return true;
  } catch (err) {
    console.error('[Push] Firebase init error:', err.message);
    return false;
  }
}

async function getTokensForUser(userId, userType) {
  const result = await dbQuery(
    'SELECT token FROM device_tokens WHERE user_id = $1 AND user_type = $2',
    [userId, userType]
  );
  return result.rows.map(r => r.token);
}

async function getTokensForUsers(users) {
  const allTokens = [];
  for (const { userId, userType } of users) {
    const tokens = await getTokensForUser(userId, userType);
    allTokens.push(...tokens);
  }
  return [...new Set(allTokens)];
}

async function sendPush(tokens, data) {
  if (!firebaseInitialized && !initFirebase()) return;
  if (!tokens || tokens.length === 0) return;

  const invalidTokens = [];

  for (const token of tokens) {
    try {
      await admin.messaging().send({
        token,
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        android: {
          priority: 'high',
          notification: {
            channelId: data.type === 'chat_message' ? 'chat_messages' : 'ticket_updates',
            title: data.title || 'WorldCashBox',
            body: data.body || '',
            sound: 'default',
          },
        },
      });
    } catch (err) {
      console.error(`[Push] Error sending to token ${token.substring(0, 20)}...:`, err.code || err.message);
      if (err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token') {
        invalidTokens.push(token);
      }
    }
  }

  if (invalidTokens.length > 0) {
    for (const t of invalidTokens) {
      await dbQuery('DELETE FROM device_tokens WHERE token = $1', [t]);
    }
    console.log(`[Push] Removed ${invalidTokens.length} invalid token(s)`);
  }
}

async function notifyChatMessage({ conversationId, senderId, senderType, senderName, message, conversationTitle }) {
  try {
    const participants = await dbQuery(
      'SELECT user_id, user_type FROM conversation_participants WHERE conversation_id = $1',
      [conversationId]
    );

    const recipients = participants.rows.filter(
      p => !(p.user_id === senderId && p.user_type === senderType)
    );

    const tokens = await getTokensForUsers(
      recipients.map(r => ({ userId: r.user_id, userType: r.user_type }))
    );

    await sendPush(tokens, {
      type: 'chat_message',
      title: senderName || 'Новое сообщение',
      body: message.length > 200 ? message.substring(0, 200) + '...' : message,
      conversation_id: String(conversationId),
      conversation_title: conversationTitle || 'Чат',
    });
  } catch (err) {
    console.error('[Push] notifyChatMessage error:', err.message);
  }
}

async function notifyTicketReply({ ticketId, senderId, senderType, senderName, message, subject }) {
  try {
    const ticket = await dbQuery('SELECT client_id, assigned_to FROM support_tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) return;

    const t = ticket.rows[0];
    const recipients = [];

    if (senderType === 'staff' || senderType === 'support') {
      recipients.push({ userId: t.client_id, userType: 'client' });
    } else {
      if (t.assigned_to) {
        recipients.push({ userId: t.assigned_to, userType: 'staff' });
      }
      const managers = await dbQuery("SELECT id FROM staff WHERE role IN ('manager', 'director') AND is_active = true");
      for (const m of managers.rows) {
        recipients.push({ userId: m.id, userType: 'staff' });
      }
    }

    const tokens = await getTokensForUsers(recipients);

    await sendPush(tokens, {
      type: 'ticket_reply',
      title: `Тикет: ${subject || '#' + ticketId}`,
      body: `${senderName || 'Ответ'}: ${message.length > 150 ? message.substring(0, 150) + '...' : message}`,
      ticket_id: String(ticketId),
    });
  } catch (err) {
    console.error('[Push] notifyTicketReply error:', err.message);
  }
}

async function notifyTicketStatus({ ticketId, newStatus, subject }) {
  try {
    const ticket = await dbQuery('SELECT client_id FROM support_tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) return;

    const statusLabels = {
      to_do: 'Новый', in_progress: 'В работе', in_review: 'На проверке',
      done: 'Выполнен', closed: 'Закрыт'
    };

    const tokens = await getTokensForUser(ticket.rows[0].client_id, 'client');
    await sendPush(tokens, {
      type: 'ticket_status',
      title: `Тикет: ${subject || '#' + ticketId}`,
      body: `Статус изменён на: ${statusLabels[newStatus] || newStatus}`,
      ticket_id: String(ticketId),
    });
  } catch (err) {
    console.error('[Push] notifyTicketStatus error:', err.message);
  }
}

initFirebase();

module.exports = { sendPush, getTokensForUser, getTokensForUsers, notifyChatMessage, notifyTicketReply, notifyTicketStatus };
