/**
 * Скрипт для создания аккаунта сотрудника поддержки
 * 
 * Использование:
 * node create-support-account.js <email> <password> <name>
 * 
 * Пример:
 * node create-support-account.js support@worldcashbox.ru Support123! "Иван Иванов"
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, dbQuery } = require('./src/database/init');

async function createSupportAccount() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Использование: node create-support-account.js <email> <password> <name>');
    console.log('');
    console.log('Пример:');
    console.log('node create-support-account.js support@worldcashbox.ru Support123! "Иван Иванов"');
    process.exit(1);
  }

  const [email, password, name] = args;

  if (!email || !password || !name) {
    console.error('❌ Ошибка: Все параметры обязательны (email, password, name)');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('❌ Ошибка: Пароль должен быть не менее 6 символов');
    process.exit(1);
  }

  try {
    console.log('🔐 Создание аккаунта поддержки...');
    console.log(`Email: ${email}`);
    console.log(`Имя: ${name}`);
    console.log(`Роль: support`);

    // Проверяем, существует ли уже такой email
    const existing = await dbQuery(
      'SELECT id FROM staff WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      console.error(`❌ Ошибка: Аккаунт с email ${email} уже существует`);
      process.exit(1);
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    // Создаем аккаунт
    const result = await dbQuery(
      `INSERT INTO staff (email, name, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'support', true)
       RETURNING id, email, name, role`,
      [email, name, passwordHash]
    );

    const staff = result.rows[0];

    console.log('');
    console.log('✅ Аккаунт поддержки успешно создан!');
    console.log('');
    console.log('Данные для входа:');
    console.log(`  ID: ${staff.id}`);
    console.log(`  Email: ${staff.email}`);
    console.log(`  Имя: ${staff.name}`);
    console.log(`  Роль: ${staff.role}`);
    console.log('');
    console.log('📝 Для входа используйте:');
    console.log(`  POST http://localhost:3000/api/staff/auth`);
    console.log(`  Body: { "email": "${email}", "password": "${password}" }`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при создании аккаунта:', error.message);
    process.exit(1);
  }
}

// Запускаем создание аккаунта
createSupportAccount()
  .then(() => {
    pool.end();
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    pool.end();
    process.exit(1);
  });
