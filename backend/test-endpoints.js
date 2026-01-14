/**
 * Тест эндпоинтов CRM API (проверка работоспособности)
 * Запуск: node backend/test-endpoints.js
 */

const axios = require('axios');

const API_URL = 'http://localhost:3000/api/sbis-proxy';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${colors.reset}\n`),
};

async function testEndpoints() {
  log.section('ПРОВЕРКА ЭНДПОИНТОВ CRM API');

  let successCount = 0;
  let totalTests = 0;

  try {
    // ========================================
    // Тест 1: Проверка /crm-client без авторизации
    // ========================================
    log.section('Тест 1: /crm-client (без авторизации)');
    totalTests++;
    
    try {
      await axios.post(`${API_URL}/crm-client`, {
        inn: '7707083893',
        userId: 'test',
      });
      log.error('Эндпоинт НЕ требует авторизацию (это ПЛОХО)');
    } catch (error) {
      if (error.response?.status === 401) {
        log.success('Эндпоинт правильно требует авторизацию');
        successCount++;
      } else {
        log.warning(`Неожиданная ошибка: ${error.message}`);
      }
    }

    // ========================================
    // Тест 2: Проверка /crm-client-oauth без авторизации
    // ========================================
    log.section('Тест 2: /crm-client-oauth (без авторизации)');
    totalTests++;
    
    try {
      await axios.post(`${API_URL}/crm-client-oauth`, {
        inn: '7707083893',
        userId: 'test',
      });
      log.error('Эндпоинт НЕ требует авторизацию (это ПЛОХО)');
    } catch (error) {
      if (error.response?.status === 401) {
        log.success('Эндпоинт правильно требует авторизацию');
        log.info(`Сообщение: ${error.response.data.error}`);
        log.info(`Подсказка: ${error.response.data.hint}`);
        successCount++;
      } else {
        log.warning(`Неожиданная ошибка: ${error.message}`);
      }
    }

    // ========================================
    // Тест 3: Проверка структуры ответа /auth
    // ========================================
    log.section('Тест 3: /auth (структура ответа)');
    totalTests++;
    
    try {
      const response = await axios.post(`${API_URL}/auth`, {
        login: 'test_login',
        password: 'test_password',
        userId: 'test',
      });
      
      if (response.data.hasOwnProperty('success')) {
        log.success('Эндпоинт возвращает правильную структуру');
        successCount++;
      } else {
        log.error('Неправильная структура ответа');
      }
    } catch (error) {
      if (error.response?.data?.hasOwnProperty('success') || error.response?.data?.hasOwnProperty('error')) {
        log.success('Эндпоинт возвращает правильную структуру (в т.ч. при ошибке)');
        log.info(`Ответ: ${error.response.data.error || error.response.data.success}`);
        successCount++;
      } else {
        log.error(`Неправильная структура: ${JSON.stringify(error.response?.data)}`);
      }
    }

    // ========================================
    // Тест 4: Проверка /diagnostics без авторизации
    // ========================================
    log.section('Тест 4: /diagnostics (без авторизации)');
    totalTests++;
    
    try {
      await axios.post(`${API_URL}/diagnostics`, {
        userId: 'test',
      });
      log.error('Эндпоинт НЕ требует авторизацию (это может быть проблемой)');
    } catch (error) {
      if (error.response?.status === 401) {
        log.success('Эндпоинт правильно требует авторизацию');
        successCount++;
      } else if (error.response?.status === 404) {
        log.warning('Эндпоинт не найден');
      } else {
        log.warning(`Неожиданная ошибка: ${error.message}`);
      }
    }

    // ========================================
    // Итоги
    // ========================================
    log.section('ИТОГИ ТЕСТИРОВАНИЯ');
    
    console.log(`Всего тестов: ${totalTests}`);
    console.log(`Успешно: ${colors.green}${successCount}${colors.reset}`);
    console.log(`Неудачно: ${colors.red}${totalTests - successCount}${colors.reset}`);
    console.log('');
    
    if (successCount === totalTests) {
      log.success('ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
      console.log('');
      console.log('✨ Эндпоинты CRM API работают правильно!');
      console.log('');
      console.log('📝 Для полного тестирования:');
      console.log('   1. Укажите правильные логин/пароль в test-crm-simple.js');
      console.log('   2. Запустите: node backend/test-crm-simple.js');
      console.log('');
    } else {
      log.warning('НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОЙДЕНЫ');
      console.log('');
      console.log('Проверьте логи выше для деталей');
    }
    
  } catch (error) {
    log.section('КРИТИЧЕСКАЯ ОШИБКА');
    log.error('Не удалось выполнить тесты');
    console.log('');
    
    if (error.code === 'ECONNREFUSED') {
      log.error('Backend не запущен!');
      console.log('');
      console.log('Запустите backend:');
      console.log('  cd backend');
      console.log('  npm start');
    } else {
      console.log(error.message);
    }
    
    console.log('');
    process.exit(1);
  }
}

// Запуск
console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════════╗
║         ПРОВЕРКА ЭНДПОИНТОВ CRM API                      ║
║                                                           ║
║  Проверяем что эндпоинты работают правильно              ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);

testEndpoints();

