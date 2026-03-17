/**
 * Скрипт для создания аккаунта инженера
 * 
 * Использование:
 * node create-engineer-account.js <email> <password> <name> <full_name>
 * 
 * Пример:
 * node create-engineer-account.js engineer@worldcashbox.ru Engineer123! "Иван Иванов" "Арзамасцев Александр Евгеньевич"
 * 
 * full_name - полное ФИО инженера (как в SBIS_TECH_DEPARTMENT_STAFF), используется для автоматического назначения задач
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, dbQuery, isMySQL } = require('./src/database/init');

async function createEngineerAccount() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Использование: node create-engineer-account.js <email> <password> <name> <full_name>');
    console.log('');
    console.log('Параметры:');
    console.log('  email     - Email для входа');
    console.log('  password  - Пароль (минимум 6 символов)');
    console.log('  name      - Имя для отображения');
    console.log('  full_name - Полное ФИО (как в SBIS_TECH_DEPARTMENT_STAFF)');
    console.log('');
    console.log('Пример:');
    console.log('node create-engineer-account.js engineer@worldcashbox.ru Engineer123! "Иван Иванов" "Арзамасцев Александр Евгеньевич"');
    process.exit(1);
  }

  const [email, password, name, full_name] = args;

  if (!email || !password || !name || !full_name) {
    console.error('❌ Ошибка: Все параметры обязательны (email, password, name, full_name)');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('❌ Ошибка: Пароль должен быть не менее 6 символов');
    process.exit(1);
  }

  // Нормализуем email (приводим к lowercase и убираем пробелы)
  const normalizedEmail = email.trim().toLowerCase();

  try {
    console.log('🔐 Создание аккаунта инженера...');
    console.log(`Email: ${normalizedEmail}`);
    console.log(`Имя: ${name}`);
    console.log(`Полное ФИО: ${full_name}`);
    console.log(`Роль: engineer`);

    // Проверяем, существует ли уже такой email
    const existing = await dbQuery(
      'SELECT id FROM staff WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      console.error(`❌ Ошибка: Аккаунт с email ${email} уже существует`);
      process.exit(1);
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    // Создаем аккаунт
    const result = await dbQuery(
      `INSERT INTO staff (email, name, full_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, 'engineer', true)`,
      [normalizedEmail, name, full_name, passwordHash]
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

    console.log('');
    console.log('✅ Аккаунт инженера успешно создан!');
    console.log('');
    console.log('Данные для входа:');
    console.log(`  ID: ${staff.id}`);
    console.log(`  Email: ${staff.email}`);
    console.log(`  Имя: ${staff.name}`);
    console.log(`  Полное ФИО: ${staff.full_name || 'не указано'}`);
    console.log(`  Роль: ${staff.role}`);
    console.log('');
    console.log('📝 Для входа используйте:');
    console.log(`  POST http://localhost:3000/api/staff/auth`);
    console.log(`  Body: { "email": "${email}", "password": "${password}" }`);
    console.log('');
    console.log('📱 После входа в мобильном приложении вы увидите пункт "Инженерный кабинет" в настройках');
    console.log('');
    console.log('💡 Задачи из SBIS будут автоматически назначаться на этого инженера, если ФИО совпадает с SBIS_TECH_DEPARTMENT_STAFF');

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при создании аккаунта:', error.message);
    if (error.code === '23505') {
      console.error('   Аккаунт с таким email уже существует');
    }
    process.exit(1);
  }
}

// Запускаем создание аккаунта
createEngineerAccount()
  .then(() => {
    pool.end();
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    pool.end();
    process.exit(1);
  });
