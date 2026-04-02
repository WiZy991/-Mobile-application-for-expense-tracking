const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, dbQuery, isMySQL } = require('../database/init');
const { upload } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
const { emitTicketMessage, emitTicketStatusChanged } = require('../socket');
const { notifyTicketReply, notifyTicketStatus } = require('../services/pushService');

const router = express.Router();

// Middleware для проверки роли менеджера/поддержки
const authenticateStaff = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Проверяем, что пользователь - сотрудник
    const staffResult = await dbQuery(
      'SELECT id, role, is_active FROM staff WHERE id = $1',
      [decoded.userId]
    );

    if (staffResult.rows.length === 0 || !staffResult.rows[0].is_active) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    req.staff = {
      id: staffResult.rows[0].id,
      role: staffResult.rows[0].role
    };
    next();
  } catch (error) {
    // Обработка истечения токена
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Токен истек',
        code: 'TOKEN_EXPIRED',
        expiredAt: error.expiredAt 
      });
    }
    
    // Обработка других ошибок JWT
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return res.status(401).json({ 
        error: 'Неверный токен',
        code: 'INVALID_TOKEN'
      });
    }
    
    // Неожиданные ошибки логируем
    console.error('Staff auth error:', error);
    return res.status(401).json({ error: 'Ошибка аутентификации' });
  }
};

// Регистрация нового сотрудника (только для создания первого аккаунта или с секретным ключом)
router.post('/register', async (req, res) => {
  try {
    console.log('=== Staff Registration Request ===');
    console.log('Body:', { email: req.body.email, name: req.body.name, role: req.body.role });
    
    const { email, password, name, full_name, role = 'support', secretKey } = req.body;

    // Проверяем секретный ключ (можно задать в .env)
    const requiredSecretKey = process.env.STAFF_REGISTRATION_KEY || 'CHANGE_THIS_SECRET_KEY';
    console.log('Secret key check:', { 
      provided: secretKey ? 'provided' : 'missing',
      required: requiredSecretKey ? 'set' : 'not set'
    });
    
    if (secretKey !== requiredSecretKey) {
      console.log('Secret key mismatch');
      return res.status(403).json({ error: 'Неверный секретный ключ для регистрации' });
    }

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, пароль и имя обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    // Нормализуем email (приводим к lowercase и убираем пробелы)
    const normalizedEmail = email.trim().toLowerCase();

    // Разрешаем роли: support, engineer, manager
    const allowedRoles = ['support', 'engineer', 'manager'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Роль должна быть одной из: ${allowedRoles.join(', ')}` });
    }

    // Проверяем, существует ли таблица staff
    try {
      await dbQuery('SELECT 1 FROM staff LIMIT 1');
    } catch (tableError) {
      console.error('Table staff does not exist or error:', tableError);
      return res.status(500).json({ 
        error: 'Таблица staff не существует. Запустите миграцию базы данных или перезапустите сервер для автоматического создания таблиц.' 
      });
    }

    // Проверяем, существует ли уже такой email
    console.log('Checking if email exists...');
    const existing = await dbQuery(
      'SELECT id FROM staff WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      console.log('Email already exists');
      return res.status(400).json({ error: 'Аккаунт с таким email уже существует' });
    }

    // Хешируем пароль
    console.log('Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    // Создаем аккаунт
    console.log('Inserting staff record...');
    const result = await dbQuery(
      `INSERT INTO staff (email, name, full_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [normalizedEmail, name, full_name || null, passwordHash, role]
    );
    
    // Получаем созданного сотрудника
    let staff;
    if (isMySQL) {
      const insertResult = await dbQuery('SELECT LAST_INSERT_ID() as id');
      const staffId = insertResult.rows[0]?.id;
      const staffData = await dbQuery(
        'SELECT id, email, name, full_name, role FROM staff WHERE id = $1',
        [staffId]
      );
      staff = staffData.rows[0];
    } else {
      staff = result.rows[0];
    }
    
    console.log('Staff created successfully:', staff);

    res.json({
      success: true,
      message: 'Аккаунт успешно создан',
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role
      }
    });
  } catch (error) {
    console.error('Staff registration error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    
    // Более детальные сообщения об ошибках
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Аккаунт с таким email уже существует' });
    }
    
    if (error.code === '42P01') { // Table doesn't exist
      return res.status(500).json({ 
        error: 'Таблица staff не существует. Запустите миграцию базы данных.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Авторизация для сотрудников
router.post('/auth', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Нормализуем email (приводим к lowercase и убираем пробелы)
    const normalizedEmail = email ? email.trim().toLowerCase() : '';

    const result = await dbQuery(
      'SELECT id, email, name, password_hash, role FROM staff WHERE email = $1 AND is_active = true',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const staff = result.rows[0];
    const validPassword = await bcrypt.compare(password, staff.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = jwt.sign(
      { userId: staff.id, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role
      }
    });
  } catch (error) {
    console.error('Staff auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить тикеты поддержки для сотрудников
router.get('/support/tickets', authenticateStaff, async (req, res) => {
  try {
    const allowedRoles = ['support', 'engineer', 'manager'];
    if (!allowedRoles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Доступ запрещён для вашей роли' });
    }

    const { status, assigned_to } = req.query;
    
    // Преобразуем limit и offset в числа (из req.query они приходят как строки)
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let query = `
      SELECT t.*, c.name as client_name, c.email as client_email, c.phone as client_phone,
             s.name as assigned_staff_name
      FROM support_tickets t
      JOIN clients c ON t.client_id = c.id
      LEFT JOIN staff s ON t.assigned_to = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND t.status = $${paramCount++}`;
      params.push(status);
    }

    if (assigned_to === 'me') {
      query += ` AND t.assigned_to = $${paramCount++}`;
      params.push(req.staff.id);
    } else if (assigned_to === 'unassigned') {
      query += ` AND t.assigned_to IS NULL`;
    }

    query += ` ORDER BY 
      CASE t.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        WHEN 'low' THEN 4 
      END,
      t.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, offset);

    const result = await dbQuery(query, params);

    res.json({ tickets: result.rows });
  } catch (error) {
    console.error('Get support tickets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить детальную информацию о тикете (для инженеров и менеджеров)
router.get('/support/tickets/:id', authenticateStaff, async (req, res) => {
  try {
    const allowedRoles = ['support', 'engineer', 'manager'];
    if (!allowedRoles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Доступ запрещён для вашей роли' });
    }

    const ticketId = parseInt(req.params.id);

    // Получаем тикет с информацией о клиенте
    // Проверяем существование колонок перед запросом
    const columnsCheck = await dbQuery(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'clients' 
      AND column_name IN ('inn', 'kpp', 'ogrn', 'company_address')
    `);
    
    const existingColumns = columnsCheck.rows.map(r => r.column_name);
    const hasInn = existingColumns.includes('inn');
    const hasKpp = existingColumns.includes('kpp');
    const hasOgrn = existingColumns.includes('ogrn');
    const hasCompanyAddress = existingColumns.includes('company_address');
    
    const ticketResult = await dbQuery(`
      SELECT 
        t.*,
        c.id as client_id,
        c.name as client_name,
        c.email as client_email,
        c.phone as client_phone,
        ${hasInn ? 'c.inn,' : 'NULL::VARCHAR as inn,'}
        ${hasKpp ? 'c.kpp,' : 'NULL::VARCHAR as kpp,'}
        ${hasOgrn ? 'c.ogrn,' : 'NULL::VARCHAR as ogrn,'}
        ${hasCompanyAddress ? 'c.company_address,' : 'NULL::TEXT as company_address,'}
        c.balance,
        c.created_at as client_since,
        s.name as assigned_staff_name,
        s.email as assigned_staff_email
      FROM support_tickets t
      JOIN clients c ON t.client_id = c.id
      LEFT JOIN staff s ON t.assigned_to = s.id
      WHERE t.id = $1
    `, [ticketId]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }

    const ticket = ticketResult.rows[0];

    // Получаем все сообщения тикета
    const messagesResult = await dbQuery(`
      SELECT 
        m.*,
        CASE 
          WHEN m.user_type = 'client' THEN c.name
          WHEN m.user_type = 'support' THEN s.name
          WHEN m.user_type = 'staff' THEN s.name
          ELSE 'Система'
        END as user_name
      FROM support_messages m
      LEFT JOIN clients c ON m.user_type = 'client' AND m.user_id = c.id
      LEFT JOIN staff s ON (m.user_type = 'support' OR m.user_type = 'staff') AND m.user_id = s.id
      WHERE m.ticket_id = $1
      ORDER BY m.created_at ASC
    `, [ticketId]);

    // Получаем все файлы тикета (если таблица существует)
    let filesResult = { rows: [] };
    try {
      console.log(`[Staff] Querying files for ticket ${ticketId}...`);
      filesResult = await dbQuery(`
        SELECT 
          f.*,
          CASE 
            WHEN EXISTS (SELECT 1 FROM clients WHERE id = f.uploaded_by) THEN 'client'
            ELSE 'staff'
          END as uploaded_by_type
        FROM support_ticket_files f
        WHERE f.ticket_id = $1
        ORDER BY f.uploaded_at ASC
      `, [ticketId]);
      console.log(`[Staff] Files query result: ${filesResult.rows.length} files found`, {
        files: filesResult.rows.map(f => ({
          id: f.id,
          file_name: f.file_name,
          message_id: f.message_id,
          ticket_id: f.ticket_id,
          file_path: f.file_path
        }))
      });
    } catch (filesError) {
      // Если таблица не существует, просто возвращаем пустой массив
      console.error(`[Staff] Files table error for ticket ${ticketId}:`, filesError.message);
      console.error(`[Staff] Files error stack:`, filesError.stack);
      filesResult = { rows: [] };
    }

    // Получаем реакции для всех сообщений
    let reactionsResult = { rows: [] };
    try {
      const messageIds = messagesResult.rows.map(m => m.id);
      if (messageIds.length > 0) {
        const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(',');
        reactionsResult = await dbQuery(
          `SELECT * FROM message_reactions WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`,
          messageIds
        );
      }
    } catch (reactionsError) {
      console.log('Reactions table may not exist:', reactionsError.message);
    }

    // Получаем файлы для каждого сообщения + реакции
    // Helper to add file_url (staff endpoint)
    const addFileUrl = (f) => ({
      ...f,
      file_url: `/api/staff/support/tickets/${ticketId}/files/${f.id}`
    });

    const messagesWithFiles = messagesResult.rows.map(msg => {
      const messageFiles = filesResult.rows.filter(f => f.message_id === msg.id).map(addFileUrl);
      const messageReactions = reactionsResult.rows.filter(r => r.message_id === msg.id);
      return {
        ...msg,
        files: messageFiles,
        reactions: messageReactions
      };
    });

    // Файлы без привязки к сообщению (прикрепленные к тикету)
    // Также включаем файлы из первого сообщения (когда тикет создается с файлами)
    const ticketFiles = filesResult.rows.filter(f => {
      // Файлы без message_id - всегда включаем
      if (!f.message_id) {
        console.log(`[Staff] Including file without message_id: ${f.file_name} (id: ${f.id})`);
        return true;
      }
      // Если это первое сообщение (обычно это сообщение клиента при создании тикета)
      // Включаем все файлы из первого сообщения, так как они были прикреплены при создании тикета
      if (messagesWithFiles.length > 0 && messagesWithFiles[0].id === f.message_id) {
        console.log(`[Staff] Including file from first message: ${f.file_name} (id: ${f.id}, message_id: ${f.message_id})`);
        return true;
      }
      console.log(`[Staff] Excluding file: ${f.file_name} (id: ${f.id}, message_id: ${f.message_id})`);
      return false;
    });
    
    console.log(`[Staff] Ticket ${ticketId} files:`, {
      totalFiles: filesResult.rows.length,
      ticketFiles: ticketFiles.length,
      messagesCount: messagesWithFiles.length,
      firstMessageId: messagesWithFiles[0]?.id || null,
      firstMessageFiles: messagesWithFiles[0]?.files?.length || 0,
      filesWithoutMessageId: filesResult.rows.filter(f => !f.message_id).length,
      filesWithMessageId: filesResult.rows.filter(f => f.message_id).length,
      allFilesDetails: filesResult.rows.map(f => ({ 
        id: f.id, 
        name: f.file_name, 
        message_id: f.message_id,
        ticket_id: f.ticket_id 
      })),
      ticketFilesDetails: ticketFiles.map(f => ({ id: f.id, name: f.file_name, message_id: f.message_id }))
    });
    
    // Дополнительная проверка: если файлов нет, но должны быть - логируем предупреждение
    if (filesResult.rows.length === 0) {
      console.warn(`[Staff] ⚠️ No files found in database for ticket ${ticketId}!`);
      console.warn(`[Staff] This might mean files were not saved when ticket was created.`);
    }

    // ВАЖНО: Убеждаемся, что files всегда массив, даже если пустой
    const ticketWithFiles = {
      ...ticket,
      files: ticketFiles || []
    };
    
    console.log(`[Staff] Returning ticket with ${ticketWithFiles.files.length} files`);
    
    res.json({
      ticket: ticketWithFiles,
      messages: messagesWithFiles,
      client: {
        id: ticket.client_id,
        name: ticket.client_name,
        email: ticket.client_email,
        phone: ticket.client_phone,
        inn: ticket.inn,
        kpp: ticket.kpp,
        ogrn: ticket.ogrn,
        company_address: ticket.company_address,
        balance: ticket.balance,
        client_since: ticket.client_since
      }
    });
  } catch (error) {
    console.error('Get ticket details error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Назначить тикет на сотрудника поддержки
router.post('/support/tickets/:id/assign', authenticateStaff, async (req, res) => {
  try {
    if (req.staff.role !== 'support' && req.staff.role !== 'engineer') {
      return res.status(403).json({ error: 'Доступ только для отдела поддержки или инженеров' });
    }

    const ticketId = parseInt(req.params.id);

    // Обновляем тикет: назначаем, меняем статус и записываем время начала работы
    await dbQuery(
      `UPDATE support_tickets 
       SET assigned_to = $1, status = $2, started_at = COALESCE(started_at, NOW()), updated_at = NOW() 
       WHERE id = $3`,
      [req.staff.id, 'in_progress', ticketId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Assign ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Изменить статус тикета
router.put('/support/tickets/:id/status', authenticateStaff, async (req, res) => {
  try {
    if (req.staff.role !== 'support' && req.staff.role !== 'engineer') {
      return res.status(403).json({ error: 'Доступ только для отдела поддержки или инженеров' });
    }

    const ticketId = parseInt(req.params.id);
    const { status } = req.body;

    const allowedStatuses = ['to_do', 'in_progress', 'in_review', 'done', 'closed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Неверный статус' });
    }

    // Получаем текущий тикет для вычисления времени
    const ticketResult = await dbQuery(
      'SELECT started_at, completed_at, created_at, assigned_to FROM support_tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }

    const ticket = ticketResult.rows[0];
    
    // ВАЖНО: Сначала определяем, нужно ли назначать задачу на инженера
    // Это нужно сделать ДО вычисления времени, чтобы started_at был установлен правильно
    const shouldAssign = !ticket.assigned_to || ticket.assigned_to !== req.staff.id;
    const finalAssignedTo = shouldAssign ? req.staff.id : ticket.assigned_to;
    
    let updateQuery = 'UPDATE support_tickets SET status = $1, updated_at = NOW()';
    const params = [status];
    let paramCount = 2;
    
    // Если задача не назначена на текущего инженера, назначаем её
    // Это гарантирует, что задача попадет в аналитику инженера
    if (shouldAssign) {
      updateQuery += `, assigned_to = $${paramCount++}`;
      params.push(req.staff.id);
      console.log(`[Ticket ${ticketId}] Auto-assigning to staff ${req.staff.id} on status change`);
    }

    // Если статус меняется на done или closed, записываем время завершения и вычисляем потраченное время
    if ((status === 'done' || status === 'closed') && !ticket.completed_at) {
      const completedAt = new Date();
      updateQuery += `, completed_at = $${paramCount++}`;
      params.push(completedAt);

      // Определяем время начала работы
      // ВАЖНО: Если started_at не установлен, устанавливаем его СЕЙЧАС (или используем created_at, если задача была создана недавно)
      let startedAt = null;
      if (ticket.started_at) {
        startedAt = new Date(ticket.started_at);
      } else {
        // Если started_at не установлен, используем created_at как время начала
        // Это гарантирует, что время будет вычислено правильно
        startedAt = new Date(ticket.created_at);
        // Устанавливаем started_at для будущих запросов
        updateQuery += `, started_at = $${paramCount++}`;
        params.push(ticket.created_at);
        console.log(`[Ticket ${ticketId}] Setting started_at to created_at: ${ticket.created_at}`);
      }

      // Вычисляем время выполнения в минутах
      // ВАЖНО: Всегда сохраняем time_spent_minutes, даже если оно равно 0
      if (startedAt) {
        const timeSpentMinutes = Math.max(0, Math.round((completedAt - startedAt) / (1000 * 60)));
        updateQuery += `, time_spent_minutes = $${paramCount++}`;
        params.push(timeSpentMinutes);
        
        console.log(`[Ticket ${ticketId}] Status changed to ${status}:`, {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          timeSpentMinutes,
          assignedTo: finalAssignedTo,
          timeDiffMs: completedAt - startedAt,
          timeDiffMinutes: (completedAt - startedAt) / (1000 * 60)
        });
      } else {
        // Если startedAt не определен, устанавливаем минимальное время (1 минута)
        // чтобы задача учитывалась в аналитике
        const timeSpentMinutes = 1;
        updateQuery += `, time_spent_minutes = $${paramCount++}`;
        params.push(timeSpentMinutes);
        console.warn(`[Ticket ${ticketId}] WARNING: Could not determine startedAt, using default 1 minute`);
      }
    }

    // Если статус меняется на in_progress и started_at еще не установлен
    if (status === 'in_progress' && !ticket.started_at) {
      updateQuery += `, started_at = $${paramCount++}`;
      params.push(new Date());
      console.log(`[Ticket ${ticketId}] Setting started_at to NOW() for in_progress status`);
    }

    updateQuery += ` WHERE id = $${paramCount}`;
    params.push(ticketId);
    
    console.log(`[Ticket ${ticketId}] Updating status to ${status}:`, {
      query: updateQuery.substring(0, 200),
      paramsCount: params.length,
      params: params
    });
    
    const updateResult = await dbQuery(updateQuery, params);
    
    // Проверяем результат обновления
    const verifyResult = await dbQuery(
      'SELECT status, completed_at, time_spent_minutes, started_at, assigned_to FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    
    if (verifyResult.rows.length > 0) {
      const updatedTicket = verifyResult.rows[0];
      console.log(`[Ticket ${ticketId}] After update:`, {
        status: updatedTicket.status,
        completed_at: updatedTicket.completed_at,
        time_spent_minutes: updatedTicket.time_spent_minutes,
        started_at: updatedTicket.started_at,
        assigned_to: updatedTicket.assigned_to,
        timeSpentIsNull: updatedTicket.time_spent_minutes === null,
        timeSpentValue: updatedTicket.time_spent_minutes
      });
      
      // Если время не сохранилось, но статус resolved/closed - это ошибка!
      if ((status === 'resolved' || status === 'closed') && updatedTicket.time_spent_minutes === null) {
        console.error(`[Ticket ${ticketId}] ERROR: time_spent_minutes is NULL after setting status to ${status}!`);
      }
    }

    emitTicketStatusChanged(ticketId, status);

    // Push-уведомление клиенту о смене статуса
    const ticketForPush = await dbQuery('SELECT subject FROM support_tickets WHERE id = $1', [ticketId]);
    notifyTicketStatus({ ticketId, newStatus: status, subject: ticketForPush.rows[0]?.subject });

    res.json({ 
      success: true,
      ticket: verifyResult.rows[0] 
    });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавить ответ в тикет (от сотрудника поддержки) с поддержкой файлов
router.post('/support/tickets/:id/messages', authenticateStaff, upload.array('files', 10), async (req, res) => {
  let connection;
  let shouldRelease = false;
  
  try {
    // Получаем соединение в зависимости от типа БД
    if (isMySQL) {
      connection = await pool.getConnection();
      shouldRelease = true;
      await connection.beginTransaction();
    } else {
      connection = await pool.connect();
      shouldRelease = true;
      await connection.query('BEGIN');
    }

    if (req.staff.role !== 'support' && req.staff.role !== 'engineer') {
      if (isMySQL) {
        await connection.rollback();
      } else {
        await connection.query('ROLLBACK');
      }
      return res.status(403).json({ error: 'Доступ только для отдела поддержки или инженеров' });
    }

    const ticketId = parseInt(req.params.id);
    let { message } = req.body;
    // Защита: если multer получил несколько полей message, берём первый
    if (Array.isArray(message)) {
      message = message[0];
    }

    if (!message) {
      if (isMySQL) {
        await connection.rollback();
      } else {
        await connection.query('ROLLBACK');
      }
      return res.status(400).json({ error: 'Сообщение обязательно' });
    }

    // Добавляем сообщение (используем 'support' как указано в схеме БД)
    const messageResult = await dbQuery(
      `INSERT INTO support_messages (ticket_id, user_id, user_type, message)
       VALUES ($1, $2, 'support', $3)`,
      [ticketId, req.staff.id, message],
      connection
    );
    
    // Получаем ID вставленного сообщения
    let messageId;
    if (isMySQL) {
      const [lastInsertResult] = await connection.query('SELECT LAST_INSERT_ID() as id');
      messageId = lastInsertResult[0].id;
    } else {
      messageId = messageResult.rows[0].id;
    }
    
    console.log(`[Staff] Message sent to ticket ${ticketId}:`, {
      messageId: messageId,
      userType: 'support',
      userId: req.staff.id,
      message: message.substring(0, 50) + '...'
    });

    // Сохраняем файлы, если они есть
    const fileIds = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileResult = await dbQuery(
          `INSERT INTO support_ticket_files 
           (ticket_id, message_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            ticketId,
            messageId,
            file.originalname,
            file.path,
            path.extname(file.originalname).substring(1).toLowerCase(),
            file.size,
            file.mimetype,
            req.staff.id
          ],
          connection
        );
        
        let fileId;
        if (isMySQL) {
          const [lastInsertResult] = await connection.query('SELECT LAST_INSERT_ID() as id');
          fileId = lastInsertResult[0].id;
        } else {
          fileId = fileResult.rows[0].id;
        }
        fileIds.push(fileId);
      }
    }

    // Обновляем статус тикета
    await dbQuery(
      'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2',
      ['in_progress', ticketId],
      connection
    );

    // Создаем уведомление для клиента
    const ticketResult = await dbQuery(
      'SELECT client_id, subject FROM support_tickets WHERE id = $1',
      [ticketId],
      connection
    );

    if (ticketResult.rows.length > 0) {
      const clientId = ticketResult.rows[0].client_id;
      const subject = ticketResult.rows[0].subject;
      
      // Обрезаем сообщение для уведомления (первые 100 символов)
      const messagePreview = message.length > 100 
        ? message.substring(0, 100) + '...' 
        : message;
      
      await dbQuery(
        `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
         VALUES ($1, 'support', 'Ответ на ваш запрос', $2, $3, 'ticket')`,
        [
          clientId, 
          `Получен ответ на тикет #${ticketId}: ${subject}\n\n${messagePreview}`, 
          ticketId
        ],
        connection
      );
      console.log(`[Staff] Created notification for client ${clientId} about ticket #${ticketId}`);

      // Уведомляем менеджеров-наблюдателей о новом ответе инженера
      const managersResult = await dbQuery(
        `SELECT id FROM staff WHERE role = 'manager' AND is_active = true AND id != $1`,
        [req.staff.id],
        connection
      );
      for (const mgr of managersResult.rows) {
        await dbQuery(
          `INSERT INTO staff_notifications (staff_id, type, title, message, related_id, related_type)
           VALUES ($1, 'support', 'Ответ инженера в тикете', $2, $3, 'ticket')`,
          [
            mgr.id,
            `Ответ в тикет #${ticketId}: ${subject}\n\n${messagePreview}`,
            ticketId
          ],
          connection
        );
      }
      if (managersResult.rows.length > 0) {
        console.log(`[Staff] Notified ${managersResult.rows.length} manager(s) about reply in ticket #${ticketId}`);
      }
    }

    // Коммитим транзакцию
    if (isMySQL) {
      await connection.commit();
    } else {
      await connection.query('COMMIT');
    }
    console.log(`[Staff] Transaction committed for ticket ${ticketId}, message ${messageId}`);

    emitTicketMessage(ticketId, { id: messageId, ticketId, userType: 'support', userId: req.staff.id, message, createdAt: new Date().toISOString() });

    // Push-уведомление клиенту о новом ответе
    const ticketForPush = await dbQuery('SELECT subject FROM support_tickets WHERE id = $1', [ticketId]);
    notifyTicketReply({
      ticketId,
      senderId: req.staff.id,
      senderType: 'staff',
      senderName: req.staff.name || 'Поддержка',
      message,
      subject: ticketForPush.rows[0]?.subject,
    });

    res.json({ success: true });
  } catch (error) {
    if (connection) {
      if (isMySQL) {
        await connection.rollback();
      } else {
        await connection.query('ROLLBACK');
      }
    }
    console.error('Add support message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connection && shouldRelease) {
      connection.release();
    }
  }
});

// Аналитика задач для инженера (JIRA-стиль)
router.get('/support/analytics', authenticateStaff, async (req, res) => {
  try {
    const allowedRoles = ['support', 'engineer', 'manager'];
    if (!allowedRoles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Доступ запрещён для вашей роли' });
    }

    const { period = 'month' } = req.query;
    // Менеджер всегда видит все тикеты (assigned_to = 'all')
    const assigned_to = req.staff.role === 'manager' ? 'all' : (req.query.assigned_to || 'me');
    const staffId = assigned_to === 'me' ? req.staff.id : null;

    console.log(`[Analytics] Request: period=${period}, assigned_to=${assigned_to}, staffId=${staffId}`);

    // Определяем период
    let dateFilter = '';
    const params = [];
    let paramCount = 1;

    // Используем MySQL синтаксис для INTERVAL
    if (period === 'week') {
      dateFilter = `AND t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
    } else if (period === 'month') {
      dateFilter = `AND t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
    } else if (period === 'quarter') {
      dateFilter = `AND t.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`;
    } else if (period === 'year') {
      dateFilter = `AND t.created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY)`;
    }

    // Базовый запрос для фильтрации по назначенному инженеру
    // Если assigned_to = 'all', показываем все тикеты (не добавляем фильтр)
    // Если assigned_to = 'me', показываем только тикеты, назначенные на текущего инженера
    let assignedFilter = '';
    if (assigned_to === 'me' && staffId) {
      assignedFilter = `AND t.assigned_to = $${paramCount++}`;
      params.push(staffId);
    }
    
    console.log(`[Analytics] Filters: dateFilter="${dateFilter}", assignedFilter="${assignedFilter}", params=${JSON.stringify(params)}`);

    // Общая статистика по задачам
    // ВАЖНО: Для завершенных задач (resolved/closed) используем time_spent_minutes
    // Для задач в статусе "в работе" считаем время от started_at до текущего момента
    const statsQuery = `
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN t.status = 'to_do' THEN 1 END) as to_do_tickets,
        COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tickets,
        COUNT(CASE WHEN t.status = 'in_review' THEN 1 END) as in_review_tickets,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as done_tickets,
        COUNT(CASE WHEN t.status = 'closed' THEN 1 END) as closed_tickets,
        COUNT(CASE WHEN t.status IN ('done', 'closed') THEN 1 END) as completed_tickets,
        COALESCE(
          SUM(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN t.time_spent_minutes
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE 0
            END
          ), 
          0
        ) as total_time_minutes,
        COALESCE(
          AVG(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN CAST(t.time_spent_minutes AS DECIMAL(10,2))
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE NULL
            END
          ), 
          0
        ) as avg_time_minutes,
        COALESCE(
          MIN(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN t.time_spent_minutes
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE NULL
            END
          ), 
          0
        ) as min_time_minutes,
        COALESCE(
          MAX(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN t.time_spent_minutes
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE NULL
            END
          ), 
          0
        ) as max_time_minutes,
        COUNT(CASE WHEN t.priority = 'urgent' THEN 1 END) as urgent_count,
        COUNT(CASE WHEN t.priority = 'high' THEN 1 END) as high_count,
        COUNT(CASE WHEN t.priority = 'normal' THEN 1 END) as normal_count,
        COUNT(CASE WHEN t.priority = 'low' THEN 1 END) as low_count
      FROM support_tickets t
      WHERE 1=1 ${dateFilter} ${assignedFilter}
    `;

    console.log(`[Analytics] Executing query: ${statsQuery.substring(0, 200)}...`);
    console.log(`[Analytics] Query params:`, params);
    
    const statsResult = await dbQuery(statsQuery, params);
    const stats = statsResult.rows[0];
    
    if (!stats) {
      console.error(`[Analytics] No stats returned from query!`);
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }
    
    console.log(`[Analytics] Staff ${req.staff.id}, Period: ${period}, Assigned: ${assigned_to}`, {
      total: stats.total_tickets,
      to_do: stats.to_do_tickets,
      in_progress: stats.in_progress_tickets,
      in_review: stats.in_review_tickets,
      done: stats.done_tickets,
      closed: stats.closed_tickets,
      completed: stats.completed_tickets,
      totalTime: stats.total_time_minutes,
      avgTime: stats.avg_time_minutes,
      urgent: stats.urgent_count,
      high: stats.high_count,
      normal: stats.normal_count,
      low: stats.low_count,
      rawStats: stats
    });

    // Статистика по дням (для графика)
    // ВАЖНО: Для завершенных задач используем time_spent_minutes, для задач в работе - вычисляем
    const dailyStatsQuery = `
      SELECT 
        DATE(t.created_at) as date,
        COUNT(*) as tickets_count,
        COUNT(CASE WHEN t.status IN ('done', 'closed') THEN 1 END) as completed_count,
        COALESCE(
          SUM(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN t.time_spent_minutes
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE 0
            END
          ), 
          0
        ) as time_spent_minutes
      FROM support_tickets t
      WHERE 1=1 ${dateFilter} ${assignedFilter}
      GROUP BY DATE(t.created_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    const dailyStatsResult = await dbQuery(dailyStatsQuery, params);

    // Статистика по приоритетам
    // ВАЖНО: Для завершенных задач используем time_spent_minutes, для задач в работе - вычисляем
    const priorityStatsQuery = `
      SELECT 
        t.priority,
        COUNT(*) as count,
        COALESCE(
          AVG(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN CAST(t.time_spent_minutes AS DECIMAL(10,2))
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE NULL
            END
          ), 
          0
        ) as avg_time_minutes,
        COUNT(CASE WHEN t.status IN ('done', 'closed') THEN 1 END) as completed_count
      FROM support_tickets t
      WHERE 1=1 ${dateFilter} ${assignedFilter}
      GROUP BY t.priority
      ORDER BY 
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END
    `;

    const priorityStatsResult = await dbQuery(priorityStatsQuery, params);

    // Среднее время выполнения по статусам
    // ВАЖНО: Для завершенных задач используем time_spent_minutes, для задач в работе - вычисляем
    const statusTimeQuery = `
      SELECT 
        t.status,
        COUNT(*) as count,
        COALESCE(
          AVG(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN CAST(t.time_spent_minutes AS DECIMAL(10,2))
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE NULL
            END
          ), 
          0
        ) as avg_time_minutes,
        COALESCE(
          SUM(
            CASE 
              WHEN t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
                THEN t.time_spent_minutes
              WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
                THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
              ELSE 0
            END
          ), 
          0
        ) as total_time_minutes
      FROM support_tickets t
      WHERE 1=1 ${dateFilter} ${assignedFilter}
        AND (
          (t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0)
          OR (t.status = 'in_progress' AND t.started_at IS NOT NULL)
        )
      GROUP BY t.status
    `;

    const statusTimeResult = await dbQuery(statusTimeQuery, params);

    // Топ задач по времени выполнения
    // ВАЖНО: Для завершенных задач используем time_spent_minutes, для задач в работе - вычисляем
    const topTimeQuery = `
      SELECT 
        t.id,
        t.subject,
        t.priority,
        t.status,
        COALESCE(
          CASE 
            WHEN t.status IN ('resolved', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0
              THEN t.time_spent_minutes
            WHEN t.status = 'in_progress' AND t.started_at IS NOT NULL 
              THEN TIMESTAMPDIFF(SECOND, t.started_at, NOW()) / 60
            ELSE 0
          END,
          0
        ) as time_spent_minutes,
        t.created_at,
        t.completed_at,
        t.started_at,
        c.name as client_name
      FROM support_tickets t
      JOIN clients c ON t.client_id = c.id
      WHERE 1=1 ${dateFilter} ${assignedFilter}
        AND (
          (t.status IN ('done', 'closed') AND t.time_spent_minutes IS NOT NULL AND t.time_spent_minutes >= 0)
          OR (t.status = 'in_progress' AND t.started_at IS NOT NULL)
        )
      ORDER BY time_spent_minutes DESC
      LIMIT 10
    `;

    const topTimeResult = await dbQuery(topTimeQuery, params);

    // Вычисляем процент выполненных задач
    const completionRate = stats.completed_tickets > 0 && stats.total_tickets > 0
      ? Math.round((stats.completed_tickets / stats.total_tickets) * 100)
      : 0;

    // Формируем ответ в плоской структуре для совместимости с Android
    res.json({
      period,
      // Плоская структура для Android
      total_tickets: parseInt(stats.total_tickets) || 0,
      to_do_tickets: parseInt(stats.to_do_tickets) || 0,
      in_progress_tickets: parseInt(stats.in_progress_tickets) || 0,
      in_review_tickets: parseInt(stats.in_review_tickets) || 0,
      done_tickets: parseInt(stats.done_tickets) || 0,
      closed_tickets: parseInt(stats.closed_tickets) || 0,
      completed_tickets: parseInt(stats.completed_tickets) || 0,
      total_time_minutes: parseFloat(stats.total_time_minutes) || 0,
      avg_time_minutes: parseFloat(stats.avg_time_minutes) || 0,
      min_time_minutes: parseFloat(stats.min_time_minutes) || 0,
      max_time_minutes: parseFloat(stats.max_time_minutes) || 0,
      urgent_count: parseInt(stats.urgent_count) || 0,
      high_count: parseInt(stats.high_count) || 0,
      normal_count: parseInt(stats.normal_count) || 0,
      low_count: parseInt(stats.low_count) || 0,
      // Вложенная структура для совместимости (если нужно)
      stats: {
        total: parseInt(stats.total_tickets) || 0,
        toDo: parseInt(stats.to_do_tickets) || 0,
        inProgress: parseInt(stats.in_progress_tickets) || 0,
        inReview: parseInt(stats.in_review_tickets) || 0,
        done: parseInt(stats.done_tickets) || 0,
        closed: parseInt(stats.closed_tickets) || 0,
        completed: parseInt(stats.completed_tickets) || 0,
        completionRate,
        time: {
          totalMinutes: parseFloat(stats.total_time_minutes) || 0,
          totalHours: Math.round((parseFloat(stats.total_time_minutes) || 0) / 60 * 10) / 10,
          avgMinutes: Math.round(parseFloat(stats.avg_time_minutes) || 0),
          avgHours: Math.round((parseFloat(stats.avg_time_minutes) || 0) / 60 * 10) / 10,
          minMinutes: parseInt(stats.min_time_minutes) || 0,
          maxMinutes: parseInt(stats.max_time_minutes) || 0,
        },
        priority: {
          urgent: parseInt(stats.urgent_count) || 0,
          high: parseInt(stats.high_count) || 0,
          normal: parseInt(stats.normal_count) || 0,
          low: parseInt(stats.low_count) || 0,
        },
      },
      daily_stats: dailyStatsResult.rows.map(row => ({
        date: row.date,
        tickets_count: parseInt(row.tickets_count) || 0,
        completed_count: parseInt(row.completed_count) || 0,
        time_spent_minutes: parseInt(row.time_spent_minutes) || 0,
      })),
      priorityStats: priorityStatsResult.rows.map(row => ({
        priority: row.priority,
        count: parseInt(row.count) || 0,
        avgTimeMinutes: Math.round(parseFloat(row.avg_time_minutes) || 0),
        completedCount: parseInt(row.completed_count) || 0,
      })),
      statusTimeStats: statusTimeResult.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count) || 0,
        avgTimeMinutes: Math.round(parseFloat(row.avg_time_minutes) || 0),
        totalTimeMinutes: parseInt(row.total_time_minutes) || 0,
      })),
      topTimeConsuming: topTimeResult.rows.map(row => ({
        id: row.id,
        subject: row.subject,
        priority: row.priority,
        status: row.status,
        timeSpentMinutes: parseInt(row.time_spent_minutes) || 0,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        clientName: row.client_name,
      })),
    });
  } catch (error) {
    console.error('Get support analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить уведомления инженера
router.get('/notifications', authenticateStaff, async (req, res) => {
  try {
    const { is_read, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM staff_notifications WHERE staff_id = $1';
    const params = [req.staff.id];
    
    if (is_read !== undefined) {
      query += ' AND is_read = $2';
      params.push(is_read === 'true');
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await dbQuery(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get staff notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить количество непрочитанных уведомлений инженера
router.get('/notifications/unread-count', authenticateStaff, async (req, res) => {
  try {
    const result = await dbQuery(
      'SELECT COUNT(*) as count FROM staff_notifications WHERE staff_id = $1 AND is_read = false',
      [req.staff.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Get unread notifications count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отметить уведомление как прочитанное
router.put('/notifications/:id/read', authenticateStaff, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    const result = await dbQuery(
      'UPDATE staff_notifications SET is_read = true WHERE id = $1 AND staff_id = $2 RETURNING *',
      [notificationId, req.staff.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Уведомление не найдено' });
    }
    
    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отметить все уведомления как прочитанные
router.put('/notifications/read-all', authenticateStaff, async (req, res) => {
  try {
    await dbQuery(
      'UPDATE staff_notifications SET is_read = true WHERE staff_id = $1 AND is_read = false',
      [req.staff.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавить/убрать реакцию на сообщение (toggle) — для инженеров
router.post('/support/tickets/:id/messages/:messageId/reactions', authenticateStaff, async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Эмодзи обязательно' });
    }

    // Проверяем, есть ли уже такая реакция от этого сотрудника
    const existing = await dbQuery(
      `SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND user_type = 'support' AND emoji = $3`,
      [messageId, req.staff.id, emoji]
    );

    if (existing.rows.length > 0) {
      await dbQuery('DELETE FROM message_reactions WHERE id = $1', [existing.rows[0].id]);
      res.json({ success: true, action: 'removed' });
    } else {
      await dbQuery(
        `INSERT INTO message_reactions (message_id, user_id, user_type, emoji) VALUES ($1, $2, 'support', $3)`,
        [messageId, req.staff.id, emoji]
      );
      res.json({ success: true, action: 'added' });
    }
  } catch (error) {
    console.error('Staff reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удалить тикет (для инженеров)
router.delete('/support/tickets/:id', authenticateStaff, async (req, res) => {
  try {
    if (req.staff.role !== 'support' && req.staff.role !== 'engineer') {
      return res.status(403).json({ error: 'Доступ только для отдела поддержки или инженеров' });
    }

    const ticketId = parseInt(req.params.id);
    console.log(`[DELETE TICKET] Attempting to delete ticket #${ticketId} by staff ${req.staff.id}`);

    // Проверяем, что тикет существует
    const ticketResult = await dbQuery(
      `SELECT id, client_id FROM support_tickets WHERE id = $1`,
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      console.log(`[DELETE TICKET] Ticket #${ticketId} not found`);
      return res.status(404).json({ error: 'Тикет не найден' });
    }

    const ticket = ticketResult.rows[0];

    // Получаем все файлы тикета для удаления
    const filesResult = await dbQuery(
      `SELECT file_path FROM support_ticket_files WHERE ticket_id = $1`,
      [ticketId]
    );

    console.log(`[DELETE TICKET] Found ${filesResult.rows.length} files to delete`);

    // Удаляем файлы с диска
    filesResult.rows.forEach(file => {
      if (fs.existsSync(file.file_path)) {
        try {
          fs.unlinkSync(file.file_path);
          console.log(`[DELETE TICKET] Deleted file: ${file.file_path}`);
        } catch (fileError) {
          console.error(`[DELETE TICKET] Error deleting file ${file.file_path}:`, fileError);
        }
      }
    });

    // Удаляем тикет (каскадно удалятся сообщения и файлы из БД благодаря ON DELETE CASCADE)
    const deleteResult = await dbQuery(
      `DELETE FROM support_tickets WHERE id = $1`,
      [ticketId]
    );

    if (deleteResult.rowCount === 0) {
      console.log(`[DELETE TICKET] Failed to delete ticket #${ticketId} from database`);
      return res.status(500).json({ error: 'Не удалось удалить тикет' });
    }

    console.log(`[DELETE TICKET] ✅ Ticket #${ticketId} successfully deleted by staff ${req.staff.id}`);

    res.json({ success: true, message: 'Тикет удален', ticketId: ticketId });
  } catch (error) {
    console.error(`[DELETE TICKET] ❌ Error deleting ticket #${req.params.id}:`, error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Скачать/просмотреть файл тикета (для staff, включая менеджеров)
router.get('/support/tickets/:id/files/:fileId', authenticateStaff, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const fileId = parseInt(req.params.fileId);

    const fileResult = await dbQuery(
      'SELECT * FROM support_ticket_files WHERE id = $1 AND ticket_id = $2',
      [fileId, ticketId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const file = fileResult.rows[0];

    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'Файл не найден на сервере' });
    }

    const mimeType = file.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    // Для изображений отдаём inline, для документов — attachment
    if (mimeType.startsWith('image/')) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.file_name)}"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name)}"`);
    }
    res.sendFile(path.resolve(file.file_path));
  } catch (error) {
    console.error('Get staff file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
