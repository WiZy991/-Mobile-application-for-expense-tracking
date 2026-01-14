/**
 * Проверка доступных методов СБИС API
 */

const axios = require('axios');

const API_URL = 'http://localhost:3000/api/sbis-proxy';
const SBIS_LOGIN = 'tenditnika';
const SBIS_PASSWORD = 'Tenditnik1!';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

async function testMethods() {
  console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════════╗
║           ПРОВЕРКА ДОСТУПНЫХ МЕТОДОВ СБИС                ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);

  try {
    // Авторизация
    console.log('\n🔐 Авторизация...');
    const authResponse = await axios.post(`${API_URL}/auth`, {
      login: SBIS_LOGIN,
      password: SBIS_PASSWORD,
      userId: 'test',
    });
    
    if (!authResponse.data.success) {
      console.log(`${colors.red}❌ Авторизация не удалась${colors.reset}`);
      return;
    }
    
    console.log(`${colors.green}✅ Авторизация успешна${colors.reset}`);
    
    // Пауза
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Запрашиваем диагностику
    console.log('\n🔍 Запрашиваем доступные методы...\n');
    
    const diagResponse = await axios.post(`${API_URL}/diagnostics`, {
      userId: 'test',
    });
    
    const results = diagResponse.data.results;
    
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log('📊 РЕЗУЛЬТАТЫ ДИАГНОСТИКИ');
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
    
    // Доступные методы
    if (results.availableMethods && results.availableMethods.length > 0) {
      console.log(`${colors.green}✅ ДОСТУПНЫЕ МЕТОДЫ (${results.availableMethods.length}):${colors.reset}`);
      console.log('─'.repeat(60));
      results.availableMethods.forEach((method, i) => {
        console.log(`  ${i + 1}. ${method}`);
      });
      console.log('');
    }
    
    // Недоступные методы
    if (results.unavailableMethods && results.unavailableMethods.length > 0) {
      console.log(`${colors.red}❌ НЕДОСТУПНЫЕ МЕТОДЫ (${results.unavailableMethods.length}):${colors.reset}`);
      console.log('─'.repeat(60));
      results.unavailableMethods.slice(0, 10).forEach((method, i) => {
        console.log(`  ${i + 1}. ${method}`);
      });
      if (results.unavailableMethods.length > 10) {
        console.log(`  ... и еще ${results.unavailableMethods.length - 10}`);
      }
      console.log('');
    }
    
    // Рекомендации
    if (results.recommendations && results.recommendations.length > 0) {
      console.log(`${colors.yellow}💡 РЕКОМЕНДАЦИИ:${colors.reset}`);
      console.log('─'.repeat(60));
      results.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
      console.log('');
    }
    
    // Информация о пользователе
    if (results.userInfo) {
      console.log(`${colors.cyan}👤 ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:${colors.reset}`);
      console.log('─'.repeat(60));
      console.log(JSON.stringify(results.userInfo, null, 2));
      console.log('');
    }
    
    // Организация
    if (results.organization) {
      console.log(`${colors.cyan}🏢 ТЕКУЩАЯ ОРГАНИЗАЦИЯ:${colors.reset}`);
      console.log('─'.repeat(60));
      console.log(JSON.stringify(results.organization, null, 2));
      console.log('');
    }
    
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log('✨ Диагностика завершена!');
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
    
    // Итоги
    if (results.availableMethods && results.availableMethods.length > 0) {
      console.log(`${colors.green}✅ У вас есть доступ к ${results.availableMethods.length} методам${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠️  Нет доступных методов CRM/ЭДО${colors.reset}`);
      console.log('\nВозможные причины:');
      console.log('  • Не подключен тариф "СБИС CRM"');
      console.log('  • Не подключен тариф "ЭДО"');
      console.log('  • Недостаточно прав у пользователя');
      console.log('\nРешение:');
      console.log('  • Подключите тариф на https://online.sbis.ru');
      console.log('  • Проверьте права пользователя');
    }
    
  } catch (error) {
    console.log(`\n${colors.red}❌ ОШИБКА:${colors.reset}`);
    if (error.response) {
      console.log(`HTTP ${error.response.status}:`, error.response.data);
    } else {
      console.log(error.message);
    }
  }
}

testMethods();

