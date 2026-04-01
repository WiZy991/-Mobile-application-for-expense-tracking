const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool, dbQuery, isMySQL } = require('../database/init');
const { upload } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
const { createSBISTask } = require('./sbisProxy');
const { emitTicketMessage } = require('../socket');

const router = express.Router();

// Создать тикет поддержки (для клиентов) с поддержкой файлов
router.post('/tickets', authenticateToken, (req, res, next) => {
  // Обработка ошибок multer
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      console.error('[Support] Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой. Максимальный размер: 50MB' });
      }
      if (err.message && err.message.includes('Недопустимый тип файла')) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: 'Ошибка загрузки файла: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('[Support] ===== CREATING TICKET =====');
    console.log('[Support] Request body:', { 
      subject: req.body.subject, 
      message: req.body.message, 
      priority: req.body.priority 
    });
    console.log('[Support] Files:', req.files ? req.files.length : 0, 'files');
    if (req.files && req.files.length > 0) {
      console.log('[Support] Files details:', req.files.map(f => ({
        originalname: f.originalname,
        filename: f.filename,
        path: f.path,
        size: f.size,
        mimetype: f.mimetype
      })));
    }

    const { subject, message, priority = 'normal' } = req.body;

    if (!subject) {
      return res.status(400).json({ error: 'Тема обязательна' });
    }
    
    // message не обязателен - может быть только тема и файлы

    // Создаем тикет
    const ticketResult = await dbQuery(
      `INSERT INTO support_tickets (client_id, subject, message, priority, status)
       VALUES ($1, $2, $3, $4, 'to_do')`,
      [req.user.id, subject, message, priority]
    );

    // Для MySQL получаем ID через LAST_INSERT_ID(), для PostgreSQL через RETURNING
    let ticket;
    if (isMySQL) {
      const insertResult = await dbQuery('SELECT LAST_INSERT_ID() as id');
      const ticketId = insertResult.rows[0]?.id;
      if (!ticketId) {
        throw new Error('Не удалось получить ID созданного тикета');
      }
      const ticketData = await dbQuery(
        'SELECT * FROM support_tickets WHERE id = $1',
        [ticketId]
      );
      ticket = ticketData.rows[0];
    } else {
      ticket = ticketResult.rows[0];
    }
    
    if (!ticket) {
      throw new Error('Не удалось получить созданный тикет');
    }

    // ВАЖНО: НЕ создаем сообщение при создании тикета!
    // Сообщения создаются только когда пользователь отправляет их в чате
    // Файлы сохраняются только с привязкой к тикету (без message_id)
    let messageId = null;
    const fileIds = [];
    
    // Проверяем наличие файлов
    const hasFiles = req.files && req.files.length > 0;
    
    // Сохраняем файлы, если они есть
    // Файлы привязываются только к тикету (message_id = NULL)
    if (hasFiles) {
      console.log(`[Support] ===== SAVING FILES =====`);
      console.log(`[Support] Saving ${req.files.length} files for ticket ${ticket.id}, messageId: ${messageId}`);
      console.log(`[Support] req.files:`, req.files.map(f => ({
        originalname: f.originalname,
        filename: f.filename,
        path: f.path,
        size: f.size,
        mimetype: f.mimetype
      })));
      
      for (const file of req.files) {
        const fileType = path.extname(file.originalname).substring(1).toLowerCase() || 'unknown';
        
        // Используем полный путь к файлу из multer (file.path)
        // Это абсолютный путь к сохраненному файлу
        const filePathForDb = file.path;
        
        console.log(`[Support] Saving file:`, {
          originalname: file.originalname,
          filename: file.filename,
          path: file.path,
          filePathForDb: filePathForDb,
          type: fileType,
          size: file.size,
          mimetype: file.mimetype
        });
        
        try {
          const fileResult = await dbQuery(
            `INSERT INTO support_ticket_files 
             (ticket_id, message_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              ticket.id,
              messageId, // Может быть null - файл будет привязан только к тикету
              file.originalname,
              filePathForDb, // Полный путь к файлу
              fileType,
              file.size,
              file.mimetype,
              req.user.id
            ]
          );
          
          // Для MySQL получаем ID через LAST_INSERT_ID()
          let fileId;
          if (isMySQL) {
            const insertResult = await dbQuery('SELECT LAST_INSERT_ID() as id');
            fileId = insertResult.rows[0]?.id;
          } else {
            fileId = fileResult.rows?.[0]?.id;
          }
          
          if (fileId) {
            fileIds.push(fileId);
            console.log(`[Support] ✅ File saved with ID: ${fileId}`);
          } else {
            console.warn(`[Support] ⚠️ File saved but ID not retrieved`);
          }
        } catch (fileError) {
          console.error(`[Support] ❌ Error saving file ${file.originalname}:`, fileError);
          console.error(`[Support] Error details:`, fileError.message);
          console.error(`[Support] Error stack:`, fileError.stack);
          // Не прерываем транзакцию сразу, продолжаем с другими файлами
          // Но логируем ошибку
        }
      }
      console.log(`[Support] ===== FILES SAVED: ${fileIds.length} =====`);
    } else {
      console.log(`[Support] ⚠️ No files to save for ticket ${ticket.id}`);
      console.log(`[Support] req.files:`, req.files);
      console.log(`[Support] hasFiles:`, hasFiles);
    }

    // Создаем уведомление для отдела поддержки
    console.log(`Новый тикет поддержки #${ticket.id} от клиента ${req.user.id}: ${subject}`);

    // Получаем данные клиента для создания задачи в SBIS
    let clientData = null;
    try {
      const clientResult = await dbQuery(
        'SELECT name, email, phone, inn, kpp FROM clients WHERE id = $1',
        [req.user.id]
      );
      if (clientResult.rows.length > 0) {
        clientData = clientResult.rows[0];
      }
    } catch (clientError) {
      console.error('[Support] Ошибка получения данных клиента:', clientError);
    }

    // Создаем задачу в SBIS (асинхронно, не блокируем ответ)
    let sbisTaskResult = null;
    if (clientData) {
      try {
        console.log('[Support] Создание задачи в SBIS...');
        sbisTaskResult = await createSBISTask({
          taskId: `ticket_${ticket.id}`,
          subject: subject,
          message: message || 'Запрос в поддержку из мобильного приложения',
          clientName: clientData.name || 'Клиент',
          clientEmail: clientData.email || '',
          clientPhone: clientData.phone || null,
          clientInn: clientData.inn || null,
          clientKpp: clientData.kpp || null,
          priority: priority || 'normal',
          files: req.files || [] // Передаем файлы для добавления в задачу SBIS
        }, 'default'); // Используем дефолтный userId для OAuth токена
        
        console.log('[Support] ✅ Задача успешно создана в SBIS:', sbisTaskResult.sbisTaskId);
        if (sbisTaskResult.sbisLink) {
          console.log('[Support] 🔗 Ссылка на задачу в SBIS:', sbisTaskResult.sbisLink);
        }
        
        // Сохраняем ID задачи SBIS и диалога в тикет (если есть колонки)
        try {
          await dbQuery(
            'UPDATE support_tickets SET sbis_task_id = $1, sbis_dialog_id = $2 WHERE id = $3',
            [sbisTaskResult.sbisTaskId, sbisTaskResult.sbisDialogId || null, ticket.id]
          );
          
          // Если задача была назначена на инженера в SBIS, находим его в приложении по ФИО и назначаем задачу
          if (sbisTaskResult.assignedStaff) {
            const staffFullName = `${sbisTaskResult.assignedStaff.Фамилия} ${sbisTaskResult.assignedStaff.Имя} ${sbisTaskResult.assignedStaff.Отчество || ''}`.trim();
            console.log(`[Support] ===== ПОИСК ИНЖЕНЕРА В ПРИЛОЖЕНИИ =====`);
            console.log(`[Support] ФИО из SBIS: "${staffFullName}"`);
            console.log(`[Support] Детали из SBIS:`, {
              Фамилия: sbisTaskResult.assignedStaff.Фамилия,
              Имя: sbisTaskResult.assignedStaff.Имя,
              Отчество: sbisTaskResult.assignedStaff.Отчество
            });
            
            // Сначала получаем всех инженеров для отладки
            const allEngineersResult = await dbQuery(
              `SELECT id, email, name, full_name, role FROM staff WHERE role = 'engineer' AND is_active = true`
            );
            console.log(`[Support] Всего инженеров в приложении: ${allEngineersResult.rows.length}`);
            allEngineersResult.rows.forEach((eng, idx) => {
              console.log(`[Support]   Инженер ${idx + 1}: ID=${eng.id}, name="${eng.name}", full_name="${eng.full_name || 'NULL'}"`);
            });
            
            // Ищем инженера по full_name (точное совпадение или частичное)
            const searchPatterns = [
              staffFullName,
              `${sbisTaskResult.assignedStaff.Фамилия}%`,
              `%${sbisTaskResult.assignedStaff.Фамилия} ${sbisTaskResult.assignedStaff.Имя}%`,
              `%${sbisTaskResult.assignedStaff.Имя} ${sbisTaskResult.assignedStaff.Фамилия}%`
            ];
            console.log(`[Support] Паттерны поиска:`, searchPatterns);
            
            const staffResult = await dbQuery(
              `SELECT id, email, name, full_name, role FROM staff 
               WHERE role = 'engineer' AND is_active = true 
               AND (full_name = $1 OR full_name LIKE $2 OR full_name LIKE $3 OR full_name LIKE $4)`,
              searchPatterns
            );
            
            console.log(`[Support] Найдено совпадений: ${staffResult.rows.length}`);
            
            if (staffResult.rows.length > 0) {
              const engineer = staffResult.rows[0];
              console.log(`[Support] ✅ Найден инженер в приложении: ${engineer.full_name || engineer.name} (ID: ${engineer.id})`);
              
              // Назначаем задачу на инженера, но НЕ меняем статус - инженер сам изменит статус когда начнет работу
              await dbQuery(
                'UPDATE support_tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2',
                [engineer.id, ticket.id]
              );
              
              console.log(`[Support] ✅ Задача #${ticket.id} автоматически назначена на инженера ${engineer.full_name || engineer.name} (статус остался "${ticket.status}")`);
            } else {
              console.log(`[Support] ⚠️ Инженер с ФИО "${staffFullName}" не найден в приложении. Задача не назначена.`);
              console.log(`[Support] 💡 Подсказка: Инженер должен зарегистрироваться в приложении с ФИО "${staffFullName}"`);
              console.log(`[Support] 💡 Или проверьте, что full_name в базе данных совпадает с ФИО из SBIS`);
              console.log(`[Support] ===== ПОИСК ЗАВЕРШЕН БЕЗ РЕЗУЛЬТАТА =====`);
            }
          } else {
            console.log(`[Support] ⚠️ assignedStaff не получен из SBIS. Задача не назначена автоматически.`);
            console.log(`[Support] Детали sbisTaskResult:`, {
              success: sbisTaskResult.success,
              sbisTaskId: sbisTaskResult.sbisTaskId,
              hasAssignedStaff: !!sbisTaskResult.assignedStaff
            });
          }
        } catch (updateError) {
          // Игнорируем ошибку, если колонки нет
          console.log('[Support] Не удалось сохранить SBIS task ID (колонка может отсутствовать):', updateError.message);
        }
      } catch (sbisError) {
        // Не прерываем процесс, если создание задачи в SBIS не удалось
        console.error('[Support] ⚠️ Ошибка создания задачи в SBIS (тикет все равно создан):', sbisError.message);
        console.error('[Support] SBIS error details:', sbisError.response?.data || sbisError);
      }
    } else {
      console.log('[Support] ⚠️ Данные клиента не найдены, задача в SBIS не создана');
    }

    // Получаем информацию о сохраненных файлах для ответа
    let savedFiles = [];
    if (fileIds.length > 0) {
      try {
        const filesInfo = await dbQuery(
          'SELECT id, file_name, file_path, file_type, file_size, mime_type FROM support_ticket_files WHERE ticket_id = $1 AND message_id IS NULL',
          [ticket.id]
        );
        savedFiles = filesInfo.rows.map(f => ({
          id: f.id,
          fileName: f.file_name,
          fileType: f.file_type,
          fileSize: f.file_size,
          mimeType: f.mime_type
        }));
      } catch (filesError) {
        console.error('[Support] Ошибка получения информации о файлах:', filesError);
      }
    }

    res.json({
      success: true,
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        created_at: ticket.created_at
      },
      filesCount: fileIds.length,
      files: savedFiles,
      sbisTask: sbisTaskResult ? {
        id: sbisTaskResult.sbisTaskId,
        number: sbisTaskResult.sbisTaskNumber,
        link: sbisTaskResult.sbisLink
      } : null
    });
  } catch (error) {
    console.error('[Support] ❌ Create ticket error:', error);
    console.error('[Support] Error message:', error.message);
    console.error('[Support] Error stack:', error.stack);
    
    // Удаляем загруженные файлы при ошибке
    if (req.files) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`[Support] Deleted file: ${file.path}`);
          }
        } catch (unlinkError) {
          console.error(`[Support] Error deleting file ${file.path}:`, unlinkError);
        }
      });
    }
    
    // Возвращаем более детальную ошибку в режиме разработки
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Internal server error';
    
    res.status(500).json({ 
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.stack,
        fileError: error.message
      })
    });
  }
});

// Получить тикеты клиента
router.get('/tickets', authenticateToken, async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT id, subject, status, priority, created_at, updated_at
       FROM support_tickets
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    // dbQuery всегда возвращает объект с rows для обеих БД
    const tickets = result.rows || [];
    console.log(`[Support] Found ${tickets.length} tickets for client ${req.user.id}`);
    
    res.json({ tickets: tickets });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить детальную информацию о тикете (для клиентов)
router.get('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    // Получаем тикет с проверкой принадлежности клиенту
    const ticketResult = await dbQuery(
      `SELECT t.*
       FROM support_tickets t
       WHERE t.id = $1 AND t.client_id = $2`,
      [ticketId, req.user.id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }

    const ticket = ticketResult.rows[0];

    // Получаем все сообщения тикета
    const messagesResult = await dbQuery(`
      SELECT 
        m.*,
        CASE 
          WHEN m.user_type = 'client' THEN 'Вы'
          WHEN m.user_type = 'support' THEN 'Сотрудник поддержки'
          WHEN m.user_type = 'staff' THEN 'Сотрудник поддержки'
          ELSE 'Система'
        END as user_name
      FROM support_messages m
      WHERE m.ticket_id = $1
      ORDER BY m.created_at ASC
    `, [ticketId]);
    
    console.log(`[Client Ticket ${ticketId}] Loaded ${messagesResult.rows.length} messages`);
    messagesResult.rows.forEach((msg, idx) => {
      console.log(`  Message ${idx + 1}: user_type=${msg.user_type}, user_id=${msg.user_id}, message="${msg.message.substring(0, 50)}..."`);
    });

    // Получаем файлы тикета (если таблица существует)
    let filesResult = { rows: [] };
    try {
      filesResult = await dbQuery(`
        SELECT f.*
        FROM support_ticket_files f
        WHERE f.ticket_id = $1
        ORDER BY f.uploaded_at ASC
      `, [ticketId]);
    } catch (filesError) {
      console.log('Files table may not exist:', filesError.message);
    }

    // Получаем реакции для всех сообщений тикета
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
    // Helper to add file_url
    const addFileUrl = (f) => ({
      ...f,
      file_url: `/api/support/tickets/${ticketId}/files/${f.id}`
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
    const ticketFiles = filesResult.rows.filter(f => {
      if (!f.message_id) return true;
      if (messagesWithFiles.length > 0 && messagesWithFiles[0].id === f.message_id) {
        return true;
      }
      return false;
    }).map(addFileUrl);

    res.json({
      ticket: {
        ...ticket,
        files: ticketFiles
      },
      messages: messagesWithFiles
    });
  } catch (error) {
    console.error('Get ticket details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить сообщения тикета
router.get('/tickets/:id/messages', authenticateToken, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    // Проверяем, что тикет принадлежит клиенту
    const ticketCheck = await dbQuery(
      'SELECT client_id FROM support_tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }

    if (ticketCheck.rows[0].client_id !== req.user.id) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const result = await dbQuery(
      `SELECT id, user_id, user_type, message, created_at
       FROM support_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавить сообщение в тикет (с поддержкой файлов)
// Поддерживаем оба формата: JSON (без файлов) и multipart (с файлами)
router.post('/tickets/:id/messages', authenticateToken, (req, res, next) => {
  // Проверяем Content-Type: если это multipart, используем upload, иначе пропускаем
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    upload.array('files', 10)(req, res, (err) => {
      if (err) {
        console.error('[Support] Multer error:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Файл слишком большой. Максимальный размер: 50MB' });
        }
        if (err.message && err.message.includes('Недопустимый тип файла')) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: 'Ошибка загрузки файла: ' + err.message });
      }
      next();
    });
  } else {
    // Для JSON запросов просто пропускаем
    next();
  }
}, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    let message = req.body.message;
    
    // Если message пришел как массив (из multipart), берем первый элемент
    if (Array.isArray(message)) {
      message = message[0];
    }
    
    // Если message - это RequestBody (строка), конвертируем в строку
    if (message && typeof message !== 'string') {
      message = String(message);
    }

    console.log(`[Support] 📨 POST /tickets/${ticketId}/messages - от клиента ${req.user.id}`);
    console.log(`[Support] Content-Type: ${req.headers['content-type']}`);
    console.log(`[Support] Message type: ${typeof message}, value: ${message}`);
    console.log(`[Support] Body keys: ${Object.keys(req.body).join(', ')}`);

    const hasFiles = req.files && req.files.length > 0;
    if (!message && !hasFiles) {
      return res.status(400).json({ error: 'Сообщение или файл обязательны' });
    }

    // Проверяем, что тикет принадлежит клиенту
    const ticketCheck = await dbQuery(
      'SELECT client_id, status, sbis_task_id, sbis_dialog_id FROM support_tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }

    if (ticketCheck.rows[0].client_id !== req.user.id) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const ticket = ticketCheck.rows[0];

    // Добавляем сообщение в БД
    const msgText = message || (hasFiles ? '📎 Файл' : '');
    await dbQuery(
      `INSERT INTO support_messages (ticket_id, user_id, user_type, message, created_at)
       VALUES ($1, $2, 'client', $3, NOW())`,
      [ticketId, req.user.id, msgText]
    );
    
    // Получаем ID вставленного сообщения
    let messageId;
    if (isMySQL) {
      const midResult = await dbQuery('SELECT LAST_INSERT_ID() as id');
      messageId = midResult.rows[0].id;
    } else {
      const midResult = await dbQuery('SELECT lastval() as id');
      messageId = midResult.rows[0].id;
    }

    // Сохраняем файлы
    if (hasFiles) {
      for (const file of req.files) {
        await dbQuery(
          `INSERT INTO support_ticket_files (ticket_id, message_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            ticketId, messageId, file.originalname, file.path,
            path.extname(file.originalname).replace('.', '') || 'unknown',
            file.size, file.mimetype, req.user.id
          ]
        );
      }
      console.log(`[Support] ✅ ${req.files.length} файлов сохранено для сообщения #${messageId}`);
    }

    console.log(`[Support] ✅ Сообщение #${messageId} сохранено: ticketId=${ticketId}`);

    // Обновляем статус тикета, если он был закрыт
    if (ticket.status === 'closed') {
      await dbQuery(
        'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2',
        ['to_do', ticketId]
      );
    } else {
      await dbQuery(
        'UPDATE support_tickets SET updated_at = NOW() WHERE id = $1',
        [ticketId]
      );
    }

    // Создаем уведомление для инженеров/поддержки
    // Получаем информацию о тикете и клиенте
    const ticketInfo = await dbQuery(
      `SELECT t.subject, t.assigned_to, c.name as client_name 
       FROM support_tickets t
       JOIN clients c ON t.client_id = c.id
       WHERE t.id = $1`,
      [ticketId]
    );
    
    if (ticketInfo.rows.length > 0) {
      const subject = ticketInfo.rows[0].subject;
      const assignedTo = ticketInfo.rows[0].assigned_to;
      const clientName = ticketInfo.rows[0].client_name;
      
      // Обрезаем сообщение для уведомления
      const messagePreview = message.length > 100 
        ? message.substring(0, 100) + '...' 
        : message;
      
      // Создаем уведомления для инженеров
      const notificationText = `Клиент ${clientName} отправил сообщение в тикет #${ticketId}: "${subject}"\n\n${messagePreview}`;

      if (assignedTo) {
        await dbQuery(
          `INSERT INTO staff_notifications (staff_id, type, title, message, related_id, related_type)
           VALUES ($1, 'support', 'Новое сообщение в тикете', $2, $3, 'ticket')`,
          [assignedTo, notificationText, ticketId]
        );
        console.log(`[Support] Created notification for assigned engineer ${assignedTo} about ticket #${ticketId}`);
      } else {
        const staffResult = await dbQuery(
          `SELECT id FROM staff WHERE role IN ('support', 'engineer') AND is_active = true`,
          []
        );
        
        for (const staff of staffResult.rows) {
          await dbQuery(
            `INSERT INTO staff_notifications (staff_id, type, title, message, related_id, related_type)
             VALUES ($1, 'support', 'Новое сообщение в тикете', $2, $3, 'ticket')`,
            [staff.id, notificationText, ticketId]
          );
        }
        console.log(`[Support] Created notifications for ${staffResult.rows.length} support engineers about ticket #${ticketId}`);
      }

      // Уведомляем всех менеджеров (наблюдатели видят все тикеты)
      const managersResult = await dbQuery(
        `SELECT id FROM staff WHERE role = 'manager' AND is_active = true`,
        []
      );
      for (const mgr of managersResult.rows) {
        if (mgr.id !== assignedTo) {
          await dbQuery(
            `INSERT INTO staff_notifications (staff_id, type, title, message, related_id, related_type)
             VALUES ($1, 'support', 'Новое сообщение в тикете', $2, $3, 'ticket')`,
            [mgr.id, notificationText, ticketId]
          );
        }
      }
      if (managersResult.rows.length > 0) {
        console.log(`[Support] Notified ${managersResult.rows.length} manager(s) about ticket #${ticketId}`);
      }
    }

    emitTicketMessage(ticketId, { id: messageId, ticketId, userType: 'client', userId: req.userId, message, createdAt: new Date().toISOString() });

    res.json({ success: true });
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавить/убрать реакцию на сообщение (toggle)
router.post('/tickets/:id/messages/:messageId/reactions', authenticateToken, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const messageId = parseInt(req.params.messageId);
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Эмодзи обязательно' });
    }

    // Проверяем, что тикет принадлежит клиенту
    const ticketCheck = await dbQuery(
      'SELECT client_id FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (ticketCheck.rows.length === 0 || ticketCheck.rows[0].client_id !== req.user.id) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Проверяем, есть ли уже такая реакция от этого пользователя
    const existing = await dbQuery(
      `SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND user_type = 'client' AND emoji = $3`,
      [messageId, req.user.id, emoji]
    );

    if (existing.rows.length > 0) {
      // Убираем реакцию
      await dbQuery('DELETE FROM message_reactions WHERE id = $1', [existing.rows[0].id]);
      res.json({ success: true, action: 'removed' });
    } else {
      // Добавляем реакцию
      await dbQuery(
        `INSERT INTO message_reactions (message_id, user_id, user_type, emoji) VALUES ($1, $2, 'client', $3)`,
        [messageId, req.user.id, emoji]
      );
      res.json({ success: true, action: 'added' });
    }
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удалить тикет (только для клиента, только если тикет открыт)
router.delete('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    console.log(`[DELETE TICKET] Attempting to delete ticket #${ticketId} by client ${req.user.id}`);
    
    // Проверяем, что тикет принадлежит клиенту
    const ticketResult = await dbQuery(
      `SELECT id, status, client_id FROM support_tickets WHERE id = $1`,
      [ticketId]
    );
    
    if (ticketResult.rows.length === 0) {
      console.log(`[DELETE TICKET] Ticket #${ticketId} not found`);
      return res.status(404).json({ error: 'Тикет не найден' });
    }
    
    const ticket = ticketResult.rows[0];
    console.log(`[DELETE TICKET] Found ticket #${ticketId}, client_id: ${ticket.client_id}, request user_id: ${req.user.id}`);
    
    if (ticket.client_id !== req.user.id) {
      console.log(`[DELETE TICKET] Access denied: ticket belongs to client ${ticket.client_id}, but request from ${req.user.id}`);
      return res.status(403).json({ error: 'Нет доступа к этому тикету' });
    }
    
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
    
    // Для MySQL проверяем affectedRows, для PostgreSQL проверяем rows.length
    const deleted = isMySQL ? (deleteResult.affectedRows > 0) : (deleteResult.rows.length > 0);
    
    if (!deleted) {
      console.log(`[DELETE TICKET] Failed to delete ticket #${ticketId} from database`);
      return res.status(500).json({ error: 'Не удалось удалить тикет' });
    }
    
    console.log(`[DELETE TICKET] ✅ Ticket #${ticketId} successfully deleted by client ${req.user.id}`);
    
    res.json({ success: true, message: 'Тикет удален', ticketId: ticketId });
  } catch (error) {
    console.error(`[DELETE TICKET] ❌ Error deleting ticket #${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Получить файл тикета
router.get('/tickets/:id/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const fileId = parseInt(req.params.fileId);

    // Проверяем, что тикет принадлежит клиенту
    const ticketCheck = await dbQuery(
      'SELECT client_id FROM support_tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }

    if (ticketCheck.rows[0].client_id !== req.user.id) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Получаем информацию о файле
    const fileResult = await dbQuery(
      'SELECT * FROM support_ticket_files WHERE id = $1 AND ticket_id = $2',
      [fileId, ticketId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    const file = fileResult.rows[0];

    // Проверяем, что файл существует
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'Файл не найден на сервере' });
    }

    // Отправляем файл
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
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
