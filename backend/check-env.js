// Скрипт для проверки наличия обязательных переменных окружения
require('dotenv').config();

const requiredVars = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Отсутствуют обязательные переменные окружения:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n📝 Создайте файл .env в папке backend на основе env.template');
  console.error('   и заполните все обязательные переменные.\n');
  process.exit(1);
}

console.log('✅ Все обязательные переменные окружения установлены');
console.log('\n📋 Текущая конфигурация:');
console.log(`   DB_HOST: ${process.env.DB_HOST}`);
console.log(`   DB_PORT: ${process.env.DB_PORT || 5432}`);
console.log(`   DB_NAME: ${process.env.DB_NAME}`);
console.log(`   DB_USER: ${process.env.DB_USER}`);
console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '***установлен***' : '❌ отсутствует'}`);
console.log(`   PORT: ${process.env.PORT || 3000}`);
