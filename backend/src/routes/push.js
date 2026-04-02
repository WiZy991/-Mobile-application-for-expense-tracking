const express = require('express');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../database/init');

const router = express.Router();

function authenticateAny(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Токен не предоставлен' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

router.post('/register', authenticateAny, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'token обязателен' });

    const userId = req.userId;

    const staffCheck = await dbQuery('SELECT id FROM staff WHERE id = $1 AND is_active = true', [userId]);
    const userType = staffCheck.rows.length > 0 ? 'staff' : 'client';

    await dbQuery('DELETE FROM device_tokens WHERE token = $1', [token]);
    await dbQuery(
      'INSERT INTO device_tokens (user_id, user_type, token, platform) VALUES ($1, $2, $3, $4)',
      [userId, userType, token, platform || 'android']
    );

    console.log(`[Push] Token registered for ${userType}:${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Push register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/unregister', authenticateAny, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token обязателен' });

    await dbQuery('DELETE FROM device_tokens WHERE token = $1', [token]);
    res.json({ success: true });
  } catch (error) {
    console.error('Push unregister error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
