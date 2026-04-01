// Загружаем .env файл из папки backend
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database/init');

// Проверка обязательных переменных окружения
if (!process.env.JWT_SECRET) {
  console.error('❌ ОШИБКА: JWT_SECRET не установлен в переменных окружения!');
  console.error('📝 Создайте файл .env в папке backend со следующим содержимым:');
  console.error('');
  console.error('JWT_SECRET=your_very_secret_jwt_key_change_this_in_production');
  console.error('DB_HOST=localhost');
  console.error('DB_PORT=5432');
  console.error('DB_NAME=billing_db');
  console.error('DB_USER=postgres');
  console.error('DB_PASSWORD=your_password');
  console.error('');
  console.error('Или скопируйте .env.example в .env и заполните значения');
  process.exit(1);
}

const http = require('http');
const { initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
initSocket(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы для веб-интерфейса
app.use(express.static('public'));

// Статические файлы для загруженных файлов тикетов
app.use('/uploads', express.static('uploads'));

// Статические файлы для счетов (с авторизацией через middleware)
app.use('/uploads/invoices', express.static('uploads/invoices'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/services', require('./routes/services'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/sbis', require('./routes/sbis'));
app.use('/api/sbis-proxy', require('./routes/sbisProxy')); // СБИС прокси для мобильного приложения
app.use('/api/sbis-resources', require('./routes/sbisResources')); // API для получения ресурсов из СБИС
app.use('/api/sbis-crm', require('./routes/sbisCRM')); // API для создания сделок в CRM СБИС
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/support', require('./routes/support'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/resources', require('./routes/resources')); // Ресурсы клиентов (ФН, лицензии)
app.use('/api/subscriptions', require('./routes/subscriptions')); // Подписки и тарифы
app.use('/api/stores', require('./routes/stores')); // Магазины
app.use('/api/employees', require('./routes/employees')); // Сотрудники
app.use('/api/conversations', require('./routes/conversations')); // Прямые чаты

// Health check
app.get('/health', async (req, res) => {
  try {
    const { pool } = require('./database/init');
    // Проверяем подключение к базе данных
    await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      jwtSecret: !!process.env.JWT_SECRET
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize database and start server
const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
          // Запускаем фоновые задачи
          require('./jobs/paymentReminder');
          require('./jobs/sbisSync');
          require('./jobs/resourceMonitor'); // Мониторинг ресурсов (ФН, лицензии)
          require('./jobs/subscriptionMonitor'); // Мониторинг подписок
          require('./jobs/sbisMessagesSync'); // Синхронизация сообщений из SBIS
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Server accessible at: http://192.168.0.62:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  });

module.exports = app;

