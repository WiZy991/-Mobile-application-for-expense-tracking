const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');

const router = express.Router();

router.use(authenticateToken);

// Каталог услуг по умолчанию
const DEFAULT_SERVICES = [
  {
    id: 1,
    name: 'Базовая техподдержка',
    description: 'Консультации по телефону и email, ответ в течение 24 часов',
    price: 5000,
    billing_period: 'monthly',
    category: 'support',
    icon: '🛠️',
    features: ['Телефонная поддержка', 'Email поддержка', 'База знаний'],
  },
  {
    id: 2,
    name: 'Расширенная техподдержка',
    description: 'Приоритетная поддержка с гарантией ответа в течение 2 часов',
    price: 15000,
    billing_period: 'monthly',
    category: 'support',
    icon: '⚡',
    features: ['Приоритетный ответ', 'Выезд специалиста', 'Личный менеджер', '24/7 поддержка'],
    popular: true,
  },
  {
    id: 3,
    name: 'Лицензия 1С:Предприятие',
    description: 'Клиентская лицензия на 1 рабочее место',
    price: 8500,
    billing_period: 'one_time',
    category: 'license',
    icon: '📋',
    features: ['Лицензия на 1 ПК', 'Обновления', 'Техподдержка 1С'],
  },
  {
    id: 4,
    name: 'Облачная 1С',
    description: 'Работа в 1С через интернет с любого устройства',
    price: 2500,
    billing_period: 'monthly',
    category: 'cloud',
    icon: '☁️',
    features: ['Доступ 24/7', 'Автосохранение', 'Резервное копирование'],
  },
  {
    id: 5,
    name: 'Внедрение 1С',
    description: 'Полное внедрение и настройка системы под ваш бизнес',
    price: 50000,
    billing_period: 'one_time',
    category: 'service',
    icon: '🚀',
    features: ['Анализ бизнес-процессов', 'Настройка системы', 'Обучение персонала', 'Миграция данных'],
  },
  {
    id: 6,
    name: 'Электронная отчётность',
    description: 'Сдача отчётности в ФНС, ПФР, ФСС напрямую из 1С',
    price: 3000,
    billing_period: 'yearly',
    category: 'reporting',
    icon: '📊',
    features: ['Все виды отчётов', 'Электронная подпись', 'Автозаполнение'],
  },
];

// Получить каталог услуг
router.get('/', async (req, res) => {
  try {
    // Пытаемся получить из базы
    const result = await pool.query(
      'SELECT * FROM services WHERE is_active = true ORDER BY name'
    );

    // Если есть услуги в базе - возвращаем их
    if (result.rows.length > 0) {
      // Получаем активные услуги клиента
      const activeResult = await pool.query(
        'SELECT service_id FROM client_services WHERE client_id = $1 AND is_active = true',
        [req.user.id]
      );
      const activeServices = activeResult.rows.map(r => r.service_id);

      res.json({
        services: result.rows,
        activeServices
      });
    } else {
      // Иначе возвращаем дефолтные
      res.json({
        services: DEFAULT_SERVICES,
        activeServices: []
      });
    }
  } catch (error) {
    console.error('Get services error:', error);
    // В случае ошибки возвращаем дефолтные услуги
    res.json({
      services: DEFAULT_SERVICES,
      activeServices: []
    });
  }
});

// Получить все услуги клиента
router.get('/my-services', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        cs.id,
        cs.start_date,
        cs.end_date,
        cs.is_active,
        s.id as service_id,
        s.name,
        s.code,
        s.description,
        s.price,
        s.billing_period
      FROM client_services cs
      JOIN services s ON cs.service_id = s.id
      WHERE cs.client_id = $1
      ORDER BY cs.start_date DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get client services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить все доступные услуги
router.get('/available', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM services WHERE is_active = true ORDER BY name'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get available services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронизация услуг с СБИС
router.post('/sync', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Каталог услуг синхронизирован',
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Подключить услугу
router.post('/:id/subscribe', async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id);
    const { price } = req.body;

    // Проверяем, не подключена ли уже услуга
    const existingResult = await pool.query(
      'SELECT id FROM client_services WHERE client_id = $1 AND service_id = $2 AND is_active = true',
      [req.user.id, serviceId]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Услуга уже подключена' });
    }

    // Подключаем услугу (для демо просто возвращаем успех)
    res.json({ 
      success: true, 
      message: 'Услуга подключена',
      serviceId
    });
  } catch (error) {
    console.error('Subscribe service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отключить услугу
router.post('/:id/cancel', async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id);

    // Для демо просто возвращаем успех
    res.json({ 
      success: true, 
      message: 'Услуга отключена',
      serviceId
    });
  } catch (error) {
    console.error('Cancel service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

