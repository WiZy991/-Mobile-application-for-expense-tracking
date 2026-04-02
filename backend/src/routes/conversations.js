const express = require('express');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../database/init');
const { emitConversationMessage } = require('../socket');
const { notifyChatMessage } = require('../services/pushService');

const router = express.Router();

function shortenName(name) {
  if (!name) return name;
  return name
    .replace(/ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ/gi, 'ООО')
    .replace(/ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО/gi, 'ЗАО')
    .replace(/ОТКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО/gi, 'ОАО')
    .replace(/ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО/gi, 'ПАО')
    .replace(/ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ/gi, 'ИП')
    .trim();
}

// Universal auth: detects client or staff from JWT
async function authenticateAny(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Токен не предоставлен' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const staffResult = await dbQuery(
      'SELECT id, name, role FROM staff WHERE id = $1 AND is_active = true',
      [userId]
    );
    if (staffResult.rows.length > 0) {
      req.authUser = { id: staffResult.rows[0].id, type: 'staff', role: staffResult.rows[0].role, name: staffResult.rows[0].name };
      return next();
    }

    const clientResult = await dbQuery('SELECT id, name FROM clients WHERE id = $1', [userId]);
    if (clientResult.rows.length > 0) {
      req.authUser = { id: clientResult.rows[0].id, type: 'client', role: 'client', name: clientResult.rows[0].name };
      return next();
    }

    return res.status(403).json({ error: 'Пользователь не найден' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истек', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

// Create a conversation
// Staff: creates with a specific clientId
// Client: creates a support chat (auto-assigns to available support staff)
router.post('/', authenticateAny, async (req, res) => {
  try {
    const clientId = req.body.clientId || req.body.client_id;
    const title = req.body.title;

    if (req.authUser.type === 'staff') {
      if (!clientId) return res.status(400).json({ error: 'clientId обязателен' });

      const existingResult = await dbQuery(`
        SELECT c.id FROM conversations c
        WHERE c.type = 'direct'
          AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = $1 AND p.user_type = 'staff' AND p.role = 'member')
          AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = $2 AND p.user_type = 'client' AND p.role = 'member')
      `, [req.authUser.id, clientId]);

      if (existingResult.rows.length > 0) {
        return res.json({ conversation_id: existingResult.rows[0].id, existing: true });
      }

      const clientRes = await dbQuery('SELECT name FROM clients WHERE id = $1', [clientId]);
      const clientName = shortenName(clientRes.rows[0]?.name) || 'Клиент';
      const convTitle = title || clientName;

      const convResult = await dbQuery(
        `INSERT INTO conversations (type, title) VALUES ('direct', $1) RETURNING id`,
        [convTitle]
      );
      const conversationId = convResult.rows[0].id;

      await dbQuery(
        `INSERT INTO conversation_participants (conversation_id, user_id, user_type, role) VALUES ($1, $2, 'staff', 'member')`,
        [conversationId, req.authUser.id]
      );
      await dbQuery(
        `INSERT INTO conversation_participants (conversation_id, user_id, user_type, role) VALUES ($1, $2, 'client', 'member')`,
        [conversationId, clientId]
      );

      const managers = await dbQuery(`SELECT id FROM staff WHERE role = 'manager' AND is_active = true`);
      for (const mgr of managers.rows) {
        await dbQuery(
          `INSERT INTO conversation_participants (conversation_id, user_id, user_type, role) VALUES ($1, $2, 'staff', 'observer')`,
          [conversationId, mgr.id]
        );
      }

      res.json({ conversation_id: conversationId, existing: false });

    } else {
      // Client creates a support chat
      // Check if client already has an active support chat
      const existingResult = await dbQuery(`
        SELECT c.id FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE cp.user_id = $1 AND cp.user_type = 'client' AND cp.role = 'member'
          AND c.type = 'direct'
        ORDER BY c.updated_at DESC
        LIMIT 1
      `, [req.authUser.id]);

      // Return existing if there is one without any messages, or create new
      if (existingResult.rows.length > 0) {
        const lastConvId = existingResult.rows[0].id;
        const msgCount = await dbQuery(
          `SELECT COUNT(*) as cnt FROM direct_messages WHERE conversation_id = $1`,
          [lastConvId]
        );
        // If last conversation has no messages, reuse it
        if (parseInt(msgCount.rows[0].cnt) === 0) {
          return res.json({ conversation_id: lastConvId, existing: true });
        }
      }

      const clientRes = await dbQuery('SELECT name FROM clients WHERE id = $1', [req.authUser.id]);
      const clientName = clientRes.rows[0]?.name || 'Клиент';
      const convTitle = title || `Чат с поддержкой`;

      const convResult = await dbQuery(
        `INSERT INTO conversations (type, title) VALUES ('direct', $1) RETURNING id`,
        [convTitle]
      );
      const conversationId = convResult.rows[0].id;

      // Add client as member
      await dbQuery(
        `INSERT INTO conversation_participants (conversation_id, user_id, user_type, role) VALUES ($1, $2, 'client', 'member')`,
        [conversationId, req.authUser.id]
      );

      // Add all support/engineer staff as members so they can all respond
      const staffResult = await dbQuery(
        `SELECT id FROM staff WHERE role IN ('support', 'engineer') AND is_active = true`
      );
      for (const s of staffResult.rows) {
        await dbQuery(
          `INSERT INTO conversation_participants (conversation_id, user_id, user_type, role) VALUES ($1, $2, 'staff', 'member')`,
          [conversationId, s.id]
        );
      }

      // Add managers as observers
      const managers = await dbQuery(`SELECT id FROM staff WHERE role = 'manager' AND is_active = true`);
      for (const mgr of managers.rows) {
        await dbQuery(
          `INSERT INTO conversation_participants (conversation_id, user_id, user_type, role) VALUES ($1, $2, 'staff', 'observer')`,
          [conversationId, mgr.id]
        );
      }

      res.json({ conversation_id: conversationId, existing: false });
    }
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// List conversations for current user
router.get('/', authenticateAny, async (req, res) => {
  try {
    const { id, type } = req.authUser;

    const result = await dbQuery(`
      SELECT c.id, c.type, c.title, c.updated_at,
        (SELECT COUNT(*) FROM direct_messages dm 
         WHERE dm.conversation_id = c.id AND dm.is_read = false 
         AND NOT (dm.sender_id = $1 AND dm.sender_type = $2)
        ) as unread_count,
        (SELECT dm.message FROM direct_messages dm WHERE dm.conversation_id = c.id ORDER BY dm.created_at DESC LIMIT 1) as last_message,
        (SELECT dm.created_at FROM direct_messages dm WHERE dm.conversation_id = c.id ORDER BY dm.created_at DESC LIMIT 1) as last_message_at
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1 AND cp.user_type = $2
      ORDER BY COALESCE(
        (SELECT dm.created_at FROM direct_messages dm WHERE dm.conversation_id = c.id ORDER BY dm.created_at DESC LIMIT 1),
        c.created_at
      ) DESC
    `, [id, type]);

    // Enrich with participant names
    const conversations = [];
    for (const conv of result.rows) {
      const participantsResult = await dbQuery(`
        SELECT cp.user_id, cp.user_type, cp.role,
          CASE 
            WHEN cp.user_type = 'client' THEN (SELECT name FROM clients WHERE id = cp.user_id)
            WHEN cp.user_type = 'staff' THEN (SELECT name FROM staff WHERE id = cp.user_id)
          END as name
        FROM conversation_participants cp
        WHERE cp.conversation_id = $1
      `, [conv.id]);

      conversations.push({
        ...conv,
        title: shortenName(conv.title),
        unread_count: parseInt(conv.unread_count) || 0,
        participants: participantsResult.rows.map(p => ({ ...p, name: shortenName(p.name) })),
      });
    }

    res.json({ conversations });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a conversation
router.get('/:id/messages', authenticateAny, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { limit = 50, offset = 0 } = req.query;

    // Verify participant
    const check = await dbQuery(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND user_type = $3`,
      [conversationId, req.authUser.id, req.authUser.type]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Вы не участник этого чата' });
    }

    const result = await dbQuery(`
      SELECT dm.*,
        CASE
          WHEN dm.sender_type = 'client' THEN (SELECT name FROM clients WHERE id = dm.sender_id)
          WHEN dm.sender_type = 'staff' THEN
            CASE
              WHEN (SELECT role FROM staff WHERE id = dm.sender_id) = 'manager'
              THEN 'Менеджер'
              ELSE (SELECT name FROM staff WHERE id = dm.sender_id)
            END
        END as sender_name
      FROM direct_messages dm
      WHERE dm.conversation_id = $1
      ORDER BY dm.created_at ASC
      LIMIT $2 OFFSET $3
    `, [conversationId, parseInt(limit), parseInt(offset)]);

    // Mark messages as read
    await dbQuery(`
      UPDATE direct_messages SET is_read = true
      WHERE conversation_id = $1 AND is_read = false
        AND NOT (sender_id = $2 AND sender_type = $3)
    `, [conversationId, req.authUser.id, req.authUser.type]);

    const messages = result.rows.map(m => ({ ...m, sender_name: shortenName(m.sender_name) }));
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a message in a conversation
router.post('/:id/messages', authenticateAny, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }

    // Verify participant
    const check = await dbQuery(
      `SELECT role FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND user_type = $3`,
      [conversationId, req.authUser.id, req.authUser.type]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Вы не участник этого чата' });
    }

    const result = await dbQuery(
      `INSERT INTO direct_messages (conversation_id, sender_id, sender_type, message) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, req.authUser.id, req.authUser.type, message.trim()]
    );

    // Update conversation timestamp
    await dbQuery(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    const newMsg = result.rows[0];
    const senderLabel = req.authUser.role === 'manager' ? 'Менеджер' : (req.authUser.name || 'Сотрудник');
    emitConversationMessage(conversationId, {
      ...newMsg,
      senderName: senderLabel,
    });

    // Push-уведомление участникам чата
    const convInfo = await dbQuery('SELECT title FROM conversations WHERE id = $1', [conversationId]);
    notifyChatMessage({
      conversationId,
      senderId: req.authUser.id,
      senderType: req.authUser.type,
      senderName: senderLabel,
      message: message.trim(),
      conversationTitle: shortenName(convInfo.rows[0]?.title) || 'Чат',
    });

    res.json({ success: true, message: newMsg });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
