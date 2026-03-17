const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool, dbQuery, isMySQL } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Регистрация
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 6 }).withMessage('Пароль должен быть не менее 6 символов'),
  body('name').trim().notEmpty().withMessage('Имя обязательно для заполнения'),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ min: 0 }),
  body('inn').optional({ checkFalsy: true }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      const errorMessages = errors.array().map(err => err.msg || err.param).join(', ');
      return res.status(400).json({ 
        error: errorMessages,
        errors: errors.array() 
      });
    }

    const { email, password, name, phone, inn, kpp, ogrn, companyAddress, sbisContractId } = req.body;
    console.log('Registration attempt for:', { email, name, hasPhone: !!phone, hasInn: !!inn });
    
    // Обрабатываем пустые строки как null
    const phoneValue = phone && phone.trim() ? phone.trim() : null;
    const innValue = inn && inn.trim() ? inn.trim() : null;
    const kppValue = kpp && kpp.trim() ? kpp.trim() : null;
    const ogrnValue = ogrn && ogrn.trim() ? ogrn.trim() : null;
    const companyAddressValue = companyAddress && companyAddress.trim() ? companyAddress.trim() : null;
    const sbisContractIdValue = sbisContractId && sbisContractId.trim() ? sbisContractId.trim() : null;

    // Проверяем, существует ли клиент
    const existingClient = await dbQuery('SELECT id FROM clients WHERE email = $1', [email]);
    if (existingClient.rows.length > 0) {
      return res.status(400).json({ error: 'Клиент с таким email уже существует' });
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    // Создаём клиента (с ИНН и данными из SBIS если передан)
    console.log('Inserting client with phone:', phoneValue, 'inn:', innValue, 'kpp:', kppValue, 'ogrn:', ogrnValue);
    let result;
    try {
      // Пробуем с полными данными (если колонки существуют)
      result = await dbQuery(
        'INSERT INTO clients (email, password_hash, name, phone, inn, kpp, ogrn, company_address, sbis_contract_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, email, name, balance',
        [email, passwordHash, name, phoneValue, innValue, kppValue, ogrnValue, companyAddressValue, sbisContractIdValue]
      );
      console.log('Client inserted successfully with SBIS data:', result.rows[0]);
    } catch (dbError) {
      console.error('Error inserting client with full data:', dbError.message, dbError.code);
      // Если колонки не существуют - создаём с базовыми полями
      if (dbError.code === '42703' || dbError.code === 'ER_BAD_FIELD_ERROR') { // column does not exist
        console.log('Some columns not found, trying with basic fields');
        try {
          // Пробуем с ИНН
          result = await dbQuery(
            'INSERT INTO clients (email, password_hash, name, phone, inn) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, balance',
            [email, passwordHash, name, phoneValue, innValue]
          );
          console.log('Client inserted with INN only:', result.rows[0]);
        } catch (innError) {
          // Если и ИНН нет - создаём без него
          console.log('INN column not found, creating client without INN');
          result = await dbQuery(
            'INSERT INTO clients (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, balance',
            [email, passwordHash, name, phoneValue]
          );
          console.log('Client inserted successfully without INN:', result.rows[0]);
        }
      } else {
        throw dbError;
      }
    }

    if (!result || !result.rows || result.rows.length === 0) {
      console.error('Failed to insert client: no result returned');
      return res.status(500).json({ error: 'Failed to create client' });
    }

    const client = result.rows[0];
    console.log('Created client:', { id: client.id, email: client.email, name: client.name, balance: client.balance });

    // Генерируем токен
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const token = jwt.sign(
      { userId: client.id, email: client.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Автоматически синхронизируем данные из SBIS/DaData после регистрации, если есть ИНН
    if (innValue) {
      console.log('[Register] Запускаем автоматическую синхронизацию данных для нового клиента...');
      console.log('[Register] ИНН клиента:', innValue);
      
      // Запускаем синхронизацию асинхронно, не блокируя ответ
      setImmediate(async () => {
        try {
          const axios = require('axios');
          const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
          
          console.log('[Register] Вызываем /api/clients/sync для получения данных из SBIS/DaData...');
          
          // Вызываем endpoint синхронизации с токеном нового клиента
          const syncResponse = await axios.post(
            `${baseUrl}/api/clients/sync`,
            {},
            {
              headers: {
                'Authorization': `Bearer ${token}`
              },
              timeout: 60000 // Увеличиваем таймаут до 60 секунд для надежности
            }
          );
          
          if (syncResponse.data && syncResponse.data.success) {
            console.log('[Register] ✅ Автоматическая синхронизация завершена для клиента', client.id);
            console.log('[Register] Данные синхронизированы:');
            console.log('[Register]   - name:', syncResponse.data.client?.name || 'не указано');
            console.log('[Register]   - companyAddress:', syncResponse.data.client?.companyAddress || 'не указано');
            console.log('[Register]   - director:', syncResponse.data.client?.director || 'не указано');
            console.log('[Register]   - oktmo:', syncResponse.data.client?.oktmo || 'не указано');
            console.log('[Register]   - okpo:', syncResponse.data.client?.okpo || 'не указано');
            console.log('[Register]   - okved:', syncResponse.data.client?.okved || 'не указано');
            console.log('[Register]   - pfRegNumber:', syncResponse.data.client?.pfRegNumber || 'не указано');
            console.log('[Register]   - sfrRegNumber:', syncResponse.data.client?.sfrRegNumber || 'не указано');
            console.log('[Register]   - registrationDate:', syncResponse.data.client?.registrationDate || 'не указано');
            console.log('[Register]   - registrationAuthority:', syncResponse.data.client?.registrationAuthority || 'не указано');
          } else {
            console.warn('[Register] ⚠️  Синхронизация завершена, но success=false:', syncResponse.data);
          }
        } catch (syncError) {
          console.error('[Register] ⚠️  Ошибка автоматической синхронизации (не критично):', syncError.message);
          if (syncError.response) {
            console.error('[Register]   Status:', syncError.response.status);
            console.error('[Register]   Response:', JSON.stringify(syncError.response.data, null, 2));
          }
          // Не прерываем выполнение, просто логируем ошибку
        }
      });
    } else {
      console.log('[Register] ИНН не указан, пропускаем автоматическую синхронизацию');
    }

    res.status(201).json({
      message: 'Регистрация успешна',
      token,
      client: {
        id: client.id,
        email: client.email,
        name: client.name,
        balance: client.balance
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    // Более детальная информация об ошибке для отладки
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// Вход
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
  body('password').notEmpty().withMessage('Пароль обязателен для заполнения')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Login validation errors:', errors.array());
      const errorMessages = errors.array().map(err => err.msg || err.param).join(', ');
      return res.status(400).json({ 
        error: errorMessages,
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;
    console.log('Login attempt for:', email);

    // Проверяем JWT_SECRET перед началом обработки
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error: JWT_SECRET is missing' });
    }

    // Проверяем подключение к базе данных
    if (!pool) {
      console.error('Database pool is not initialized');
      return res.status(500).json({ error: 'Database connection error' });
    }

    // Находим клиента
    let result;
    try {
      result = await dbQuery('SELECT * FROM clients WHERE email = $1', [email]);
    } catch (dbError) {
      console.error('Database query error:', dbError);
      return res.status(500).json({ 
        error: 'Database error',
        ...(process.env.NODE_ENV === 'development' && { details: dbError.message })
      });
    }
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const client = result.rows[0];

    // Проверяем, что у клиента есть password_hash
    if (!client.password_hash) {
      console.error('Client found but password_hash is missing for:', email);
      return res.status(500).json({ error: 'Server error: invalid client data' });
    }

    // Проверяем пароль
    let isValidPassword;
    try {
      isValidPassword = await bcrypt.compare(password, client.password_hash);
    } catch (bcryptError) {
      console.error('Bcrypt comparison error:', bcryptError);
      return res.status(500).json({ 
        error: 'Password verification error',
        ...(process.env.NODE_ENV === 'development' && { details: bcryptError.message })
      });
    }
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Генерируем токен
    let token;
    try {
      token = jwt.sign(
        { userId: client.id, email: client.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
    } catch (jwtError) {
      console.error('JWT signing error:', jwtError);
      return res.status(500).json({ 
        error: 'Token generation error',
        ...(process.env.NODE_ENV === 'development' && { details: jwtError.message })
      });
    }

    res.json({
      token,
      client: {
        id: client.id,
        email: client.email,
        name: client.name,
        balance: client.balance
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    
    // Более детальная информация об ошибке для отладки
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Internal server error';
    
    res.status(500).json({ 
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error.stack,
        code: error.code,
        name: error.name
      })
    });
  }
});

// Изменение пароля
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Текущий и новый пароль обязательны' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
    }

    // Получаем текущего пользователя
    const result = await dbQuery(
      'SELECT password_hash FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const client = result.rows[0];

    // Проверяем текущий пароль
    const isValidPassword = await bcrypt.compare(currentPassword, client.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    // Хешируем новый пароль
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Обновляем пароль
    await dbQuery(
      'UPDATE clients SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    res.json({ success: true, message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

