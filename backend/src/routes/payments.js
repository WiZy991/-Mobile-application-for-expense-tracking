const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbQuery, pool } = require('../database/init');

const router = express.Router();

router.use(authenticateToken);

// Получить историю транзакций
router.get('/history', async (req, res) => {
  try {
    console.log('[Payments History] Запрос от клиента:', req.user.id);
    const { page = 1, limit = 50, type, start_date, end_date } = req.query;
    // Преобразуем в числа, чтобы избежать ошибок SQL
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        t.id,
        t.type,
        t.amount,
        t.description,
        t.period_start,
        t.period_end,
        t.status,
        t.created_at,
        s.name as service_name,
        s.code as service_code
      FROM transactions t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE t.client_id = $1
    `;

    const params = [req.user.id];
    let paramCount = 2;

    if (type) {
      query += ` AND t.type = $${paramCount++}`;
      params.push(type);
    }

    if (start_date) {
      query += ` AND t.created_at >= $${paramCount++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND t.created_at <= $${paramCount++}`;
      params.push(end_date);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limitNum, offset);

    const result = await dbQuery(query, params);
    console.log('[Payments History] Найдено транзакций:', result.rows.length);

    // Получаем общее количество
    const countQuery = `
      SELECT COUNT(*) as total
      FROM transactions
      WHERE client_id = $1
      ${type ? `AND type = $2` : ''}
    `;
    const countParams = type ? [req.user.id, type] : [req.user.id];
    const countResult = await dbQuery(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    console.log('[Payments History] Всего транзакций:', total);

    // Форматируем транзакции для фронтенда
    const transactions = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      amount: parseFloat(row.amount) || 0,
      description: row.description || row.service_name || 'Транзакция',
      service_name: row.service_name || 'Услуга',
      service_code: row.service_code || null,
      period_start: row.period_start,
      period_end: row.period_end,
      status: row.status || 'pending',
      created_at: row.created_at,
      item_type: 'transaction' // Тип элемента для фронтенда
    }));

    // Получаем заявки на услуги (без пагинации, чтобы получить все)
    const requestsQuery = `
      SELECT 
        id,
        service_name,
        service_code,
        price,
        quantity,
        total_amount,
        notes,
        status,
        invoice_number,
        invoice_url,
        invoice_file_name,
        created_at
      FROM service_requests
      WHERE client_id = $1
      ORDER BY created_at DESC
    `;
    
    const requestsResult = await dbQuery(requestsQuery, [req.user.id]);
    console.log('[Payments History] Найдено заявок (всего):', requestsResult.rows.length);
    
    // Применяем пагинацию вручную
    const paginatedRequests = requestsResult.rows.slice(offset, offset + limitNum);
    console.log('[Payments History] Заявок после пагинации:', paginatedRequests.length);
    
    // Форматируем заявки для фронтенда
    const requests = paginatedRequests.map(row => ({
      id: row.id,
      type: 'service_request', // Специальный тип для заявок
      amount: parseFloat(row.total_amount) || 0,
      description: `Заявка: ${row.service_name}`,
      service_name: row.service_name,
      service_code: row.service_code,
      status: row.status || 'pending',
      created_at: row.created_at,
      item_type: 'service_request', // Тип элемента для фронтенда
      // Дополнительные поля для заявок
      request_id: row.id,
      invoice_number: row.invoice_number,
      invoice_url: row.invoice_url,
      invoice_file_name: row.invoice_file_name,
      quantity: row.quantity,
      price: parseFloat(row.price) || 0
    }));

    // Объединяем транзакции и заявки, сортируем по дате
    const allItems = [...transactions, ...requests].sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });

    // Получаем общее количество (транзакции + заявки)
    const requestsCountResult = await dbQuery(
      'SELECT COUNT(*) as total FROM service_requests WHERE client_id = $1',
      [req.user.id]
    );
    const requestsTotal = parseInt(requestsCountResult.rows[0].total);
    const totalItems = total + requestsTotal;
    
    console.log('[Payments History] Всего заявок:', requestsTotal);
    console.log('[Payments History] Всего элементов (транзакции + заявки):', totalItems);
    console.log('[Payments History] Отправляем элементов:', allItems.length);

    res.json({
      transactions: allItems, // Название оставляем для обратной совместимости
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalItems,
        pages: Math.ceil(totalItems / limitNum),
        hasMore: totalItems > (pageNum * limitNum)
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить детали транзакции
router.get('/:id', async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT 
        t.*,
        s.name as service_name,
        s.code as service_code,
        s.description as service_description
      FROM transactions t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE t.id = $1 AND t.client_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Пополнить баланс
router.post('/topup', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Минимальная сумма пополнения - 100 ₽' });
    }

    if (amount > 1000000) {
      return res.status(400).json({ error: 'Максимальная сумма пополнения - 1 000 000 ₽' });
    }

    // Используем dbQuery для совместимости с MySQL и PostgreSQL
    const { isMySQL } = require('../database/init');
    
    if (isMySQL) {
      // Для MySQL используем транзакции через pool
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        // Обновляем баланс
        const [updateResult] = await connection.execute(
          'UPDATE clients SET balance = balance + ?, updated_at = NOW() WHERE id = ?',
          [amount, req.user.id]
        );
        
        if (updateResult.affectedRows === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'Клиент не найден' });
        }
        
        // Получаем новый баланс
        const [balanceResult] = await connection.execute(
          'SELECT balance FROM clients WHERE id = ?',
          [req.user.id]
        );
        const newBalance = parseFloat(balanceResult[0].balance);
        
        // Создаем транзакцию
        const [transactionResult] = await connection.execute(
          `INSERT INTO transactions (client_id, type, amount, description, status, created_at)
           VALUES (?, 'payment', ?, 'Пополнение баланса', 'completed', NOW())`,
          [req.user.id, amount]
        );
        
        await connection.commit();
        
        res.json({
          success: true,
          balance: newBalance,
          transaction: {
            id: transactionResult.insertId,
            client_id: req.user.id,
            type: 'payment',
            amount: amount,
            description: 'Пополнение баланса',
            status: 'completed'
          },
          message: 'Баланс успешно пополнен'
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } else {
      // Для PostgreSQL используем pool.connect()
      const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateResult = await client.query(
        'UPDATE clients SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance',
        [amount, req.user.id]
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Клиент не найден' });
      }

      const newBalance = parseFloat(updateResult.rows[0].balance);

      const transactionResult = await client.query(
        `INSERT INTO transactions (client_id, type, amount, description, status)
         VALUES ($1, 'payment', $2, 'Пополнение баланса', 'completed')
         RETURNING *`,
        [req.user.id, amount]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        balance: newBalance,
        transaction: transactionResult.rows[0],
        message: 'Баланс успешно пополнен'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      }
    }
  } catch (error) {
    console.error('Top up error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронизация платежей
router.post('/sync', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Платежи синхронизированы',
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

