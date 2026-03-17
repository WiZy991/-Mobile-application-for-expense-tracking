const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbQuery } = require('../database/init');

const router = express.Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Получить все магазины директора
router.get('/', async (req, res) => {
  try {
    // Проверяем, что пользователь - директор
    const clientResult = await dbQuery(
      'SELECT role, parent_client_id FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    
    // Если это сотрудник, используем parent_client_id
    const directorId = client.role === 'employee' ? client.parent_client_id : req.user.id;
    
    if (!directorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await dbQuery(
      'SELECT * FROM stores WHERE client_id = $1 ORDER BY created_at DESC',
      [directorId]
    );

    console.log(`[Stores API] Запрос магазинов для директора ${directorId}: найдено ${result.rows.length} магазинов`);
    if (result.rows.length > 0) {
      console.log(`[Stores API] Первый магазин: id=${result.rows[0].id}, name=${result.rows[0].name}, address=${result.rows[0].address}`);
    }

    res.json({ stores: result.rows });
  } catch (error) {
    console.error('Get stores error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Создать новый магазин
router.post('/', async (req, res) => {
  try {
    const { name, address, phone } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required' });
    }

    // Проверяем, что пользователь - директор
    const clientResult = await dbQuery(
      'SELECT role FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    
    if (client.role === 'employee') {
      return res.status(403).json({ error: 'Only directors can create stores' });
    }

    const result = await dbQuery(
      `INSERT INTO stores (client_id, name, address, phone) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [req.user.id, name, address, phone || null]
    );

    res.status(201).json({ store: result.rows[0] });
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновить магазин
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, is_active } = req.body;

    // Проверяем, что пользователь - директор и владелец магазина
    const clientResult = await dbQuery(
      'SELECT role, parent_client_id FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const directorId = client.role === 'employee' ? client.parent_client_id : req.user.id;

    // Проверяем владение магазином
    const storeResult = await dbQuery(
      'SELECT * FROM stores WHERE id = $1 AND client_id = $2',
      [id, directorId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramCount++}`);
      values.push(address);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const updateQuery = `UPDATE stores SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;
    
    const result = await dbQuery(updateQuery, values);

    res.json({ store: result.rows[0] });
  } catch (error) {
    console.error('Update store error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удалить магазин
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, что пользователь - директор и владелец магазина
    const clientResult = await dbQuery(
      'SELECT role, parent_client_id FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const directorId = client.role === 'employee' ? client.parent_client_id : req.user.id;

    // Проверяем владение магазином
    const storeResult = await dbQuery(
      'SELECT * FROM stores WHERE id = $1 AND client_id = $2',
      [id, directorId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    await dbQuery('DELETE FROM stores WHERE id = $1', [id]);

    res.json({ message: 'Store deleted successfully' });
  } catch (error) {
    console.error('Delete store error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
