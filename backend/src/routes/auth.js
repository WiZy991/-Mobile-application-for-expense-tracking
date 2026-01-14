const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/init');

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

    const { email, password, name, phone, inn } = req.body;
    console.log('Registration attempt for:', { email, name, hasPhone: !!phone, hasInn: !!inn });
    
    // Обрабатываем пустые строки как null
    const phoneValue = phone && phone.trim() ? phone.trim() : null;
    const innValue = inn && inn.trim() ? inn.trim() : null;

    // Проверяем, существует ли клиент
    const existingClient = await pool.query('SELECT id FROM clients WHERE email = $1', [email]);
    if (existingClient.rows.length > 0) {
      return res.status(400).json({ error: 'Клиент с таким email уже существует' });
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

<<<<<<< HEAD
    // Создаём клиента
    console.log('Inserting client with phone:', phoneValue);
    const result = await pool.query(
      'INSERT INTO clients (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, balance',
      [email, passwordHash, name, phoneValue]
    );
=======
    // Создаём клиента (с ИНН если передан)
    let result;
    try {
      // Пробуем с ИНН (если колонка существует)
      result = await pool.query(
        'INSERT INTO clients (email, password_hash, name, phone, inn) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, balance',
        [email, passwordHash, name, phoneValue, innValue]
      );
    } catch (dbError) {
      // Если колонки inn нет - создаём без неё
      if (dbError.code === '42703') { // column does not exist
        console.log('INN column not found, creating client without INN');
        result = await pool.query(
          'INSERT INTO clients (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, balance',
          [email, passwordHash, name, phoneValue]
        );
      } else {
        throw dbError;
      }
    }

    const client = result.rows[0];

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
<<<<<<< HEAD
    // Более детальная информация об ошибке для отладки
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Internal server error';
    res.status(500).json({ 
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
=======
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
>>>>>>> 86fa44cdf55de05b6875cdfda4f46151993974b2
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
      result = await pool.query('SELECT * FROM clients WHERE email = $1', [email]);
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

module.exports = router;

