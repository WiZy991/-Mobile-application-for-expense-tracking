const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbQuery, isMySQL } = require('../database/init');
const { sendNotification } = require('../services/notificationService');

const router = express.Router();
let pushTokensTableReady = false;

async function ensurePushTokensTable() {
  if (pushTokensTableReady) return;

  if (isMySQL) {
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS client_push_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        fcm_token VARCHAR(512) NOT NULL,
        device_id VARCHAR(191) NULL,
        platform VARCHAR(20) DEFAULT 'android',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_client_token (client_id, fcm_token)
      )
    `);
  } else {
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS client_push_tokens (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        fcm_token VARCHAR(512) NOT NULL,
        device_id VARCHAR(191),
        platform VARCHAR(20) DEFAULT 'android',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (client_id, fcm_token)
      )
    `);
  }

  pushTokensTableReady = true;
}

// Конвертируем MySQL TINYINT(1) в boolean для is_read
function normalizeNotification(row) {
  if (row && isMySQL) {
    return { ...row, is_read: !!row.is_read };
  }
  return row;
}

router.use(authenticateToken);

// Зарегистрировать push-токен устройства
router.post('/push-token', async (req, res) => {
  try {
    await ensurePushTokensTable();

    const { token, deviceId = null, platform = 'android' } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Push token is required' });
    }

    if (isMySQL) {
      await dbQuery(
        `INSERT INTO client_push_tokens (client_id, fcm_token, device_id, platform, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON DUPLICATE KEY UPDATE
           is_active = true,
           device_id = VALUES(device_id),
           platform = VALUES(platform),
           updated_at = CURRENT_TIMESTAMP`,
        [req.user.id, token, deviceId, platform]
      );
    } else {
      await dbQuery(
        `INSERT INTO client_push_tokens (client_id, fcm_token, device_id, platform, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (client_id, fcm_token)
         DO UPDATE SET
           is_active = true,
           device_id = EXCLUDED.device_id,
           platform = EXCLUDED.platform,
           updated_at = CURRENT_TIMESTAMP`,
        [req.user.id, token, deviceId, platform]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отвязать push-токен устройства
router.delete('/push-token', async (req, res) => {
  try {
    await ensurePushTokensTable();

    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Push token is required' });
    }

    await dbQuery(
      'UPDATE client_push_tokens SET is_active = false, updated_at = NOW() WHERE client_id = $1 AND fcm_token = $2',
      [req.user.id, token]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Unregister push token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить количество непрочитанных уведомлений
router.get('/unread/count', async (req, res) => {
  try {
    const result = await dbQuery(
      'SELECT COUNT(*) as count FROM notifications WHERE client_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) || 0 });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить все уведомления
router.get('/', async (req, res) => {
  try {
    const { is_read, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM notifications WHERE client_id = $1';
    const params = [req.user.id];
    
    if (is_read !== undefined) {
      query += ' AND is_read = $2';
      params.push(is_read === 'true');
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await dbQuery(query, params);
    res.json(result.rows.map(normalizeNotification));
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отметить уведомление как прочитанное
router.put('/:id/read', async (req, res) => {
  try {
    const result = await dbQuery(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND client_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(normalizeNotification(result.rows[0]));
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отметить все как прочитанные
router.put('/read-all', async (req, res) => {
  try {
    await dbQuery(
      'UPDATE notifications SET is_read = true WHERE client_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

