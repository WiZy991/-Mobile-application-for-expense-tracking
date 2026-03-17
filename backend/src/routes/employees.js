const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbQuery } = require('../database/init');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Получить всех сотрудников директора
router.get('/', authenticateToken, async (req, res) => {
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
    const directorId = client.role === 'employee' ? client.parent_client_id : req.user.id;

    if (!directorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await dbQuery(
      `SELECT e.*, s.name as store_name, s.address as store_address 
       FROM employees e 
       LEFT JOIN stores s ON e.store_id = s.id 
       WHERE e.client_id = $1 
       ORDER BY e.created_at DESC`,
      [directorId]
    );

    res.json({ employees: result.rows });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавить сотрудника по номеру телефона
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { phone, name, store_id, role } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
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
      return res.status(403).json({ error: 'Only directors can add employees' });
    }

    // Проверяем, что телефон уникален
    const existingEmployee = await dbQuery(
      'SELECT id FROM employees WHERE phone = $1',
      [phone]
    );

    if (existingEmployee.rows.length > 0) {
      return res.status(400).json({ error: 'Employee with this phone number already exists' });
    }

    // Проверяем, что магазин принадлежит директору (если указан)
    if (store_id) {
      const storeResult = await dbQuery(
        'SELECT id FROM stores WHERE id = $1 AND client_id = $2',
        [store_id, req.user.id]
      );

      if (storeResult.rows.length === 0) {
        return res.status(404).json({ error: 'Store not found' });
      }
    }

    // Создаем сотрудника
    const result = await dbQuery(
      `INSERT INTO employees (client_id, store_id, phone, name, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [req.user.id, store_id || null, phone, name || null, role || 'employee']
    );

    res.status(201).json({ employee: result.rows[0] });
  } catch (error) {
    console.error('Add employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновить сотрудника
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, store_id, role, is_active } = req.body;

    // Проверяем, что пользователь - директор и владелец сотрудника
    const clientResult = await dbQuery(
      'SELECT role, parent_client_id FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const directorId = client.role === 'employee' ? client.parent_client_id : req.user.id;

    // Проверяем владение сотрудником
    const employeeResult = await dbQuery(
      'SELECT * FROM employees WHERE id = $1 AND client_id = $2',
      [id, directorId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Проверяем, что магазин принадлежит директору (если указан)
    if (store_id !== undefined) {
      if (store_id) {
        const storeResult = await dbQuery(
          'SELECT id FROM stores WHERE id = $1 AND client_id = $2',
          [store_id, directorId]
        );

        if (storeResult.rows.length === 0) {
          return res.status(404).json({ error: 'Store not found' });
        }
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (store_id !== undefined) {
      updates.push(`store_id = $${paramCount++}`);
      values.push(store_id || null);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const updateQuery = `UPDATE employees SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;
    
    const result = await dbQuery(updateQuery, values);

    res.json({ employee: result.rows[0] });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удалить сотрудника
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем, что пользователь - директор и владелец сотрудника
    const clientResult = await dbQuery(
      'SELECT role, parent_client_id FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const directorId = client.role === 'employee' ? client.parent_client_id : req.user.id;

    // Проверяем владение сотрудником
    const employeeResult = await dbQuery(
      'SELECT * FROM employees WHERE id = $1 AND client_id = $2',
      [id, directorId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    await dbQuery('DELETE FROM employees WHERE id = $1', [id]);

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Авторизация сотрудника по номеру телефона (без пароля)
router.post('/auth/phone', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Ищем сотрудника по телефону
    const employeeResult = await dbQuery(
      `SELECT e.*, c.id as client_id, c.email, c.name as company_name, c.role as client_role
       FROM employees e
       INNER JOIN clients c ON e.client_id = c.id
       WHERE e.phone = $1 AND e.is_active = true`,
      [phone]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(401).json({ error: 'Employee not found or inactive' });
    }

    const employee = employeeResult.rows[0];

    // Проверяем, что директор активен
    const directorResult = await dbQuery(
      'SELECT id, role FROM clients WHERE id = $1',
      [employee.client_id]
    );

    if (directorResult.rows.length === 0 || directorResult.rows[0].role !== 'director') {
      return res.status(401).json({ error: 'Director not found or inactive' });
    }

    // Обновляем время последнего входа
    await dbQuery(
      'UPDATE employees SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [employee.id]
    );

    // Создаем или находим аккаунт клиента для сотрудника
    let clientAccount = await dbQuery(
      'SELECT * FROM clients WHERE phone = $1 AND role = $2',
      [phone, 'employee']
    );

    if (clientAccount.rows.length === 0) {
      // Создаем аккаунт клиента для сотрудника
      const defaultPassword = await bcrypt.hash(phone, 10); // Используем телефон как пароль по умолчанию
      const insertResult = await dbQuery(
        `INSERT INTO clients (email, phone, name, password_hash, role, parent_client_id, balance) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING *`,
        [
          `employee_${phone}@temp.local`, // Временный email
          phone,
          employee.name || `Сотрудник ${phone}`,
          defaultPassword,
          'employee',
          employee.client_id,
          0
        ]
      );
      clientAccount = insertResult;
    }

    const client = clientAccount.rows[0];

    // Генерируем JWT токен
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: client.id, role: 'employee', employeeId: employee.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      employee: {
        id: employee.id,
        phone: employee.phone,
        name: employee.name,
        store_id: employee.store_id,
        role: employee.role
      },
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        role: client.role
      }
    });
  } catch (error) {
    console.error('Employee auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
