/**
 * Скрипт для проверки таблицы staff
 * Запуск: node check-staff-table.js
 */

require('dotenv').config();
const { pool } = require('./src/database/init');

async function checkStaffTable() {
  try {
    console.log('🔍 Проверка таблицы staff...\n');

    // Проверяем подключение
    await pool.query('SELECT NOW()');
    console.log('✅ Подключение к базе данных установлено\n');

    // Проверяем существование таблицы
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'staff'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Таблица staff НЕ существует!');
      console.log('\n📝 Решение:');
      console.log('1. Убедитесь, что сервер запускался хотя бы раз (таблицы создаются автоматически)');
      console.log('2. Или запустите миграцию: npm run migrate');
      console.log('3. Или перезапустите сервер');
      process.exit(1);
    }

    console.log('✅ Таблица staff существует\n');

    // Проверяем структуру таблицы
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'staff'
      ORDER BY ordinal_position;
    `);

    console.log('📋 Структура таблицы:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });

    // Проверяем количество записей
    const count = await pool.query('SELECT COUNT(*) as count FROM staff');
    console.log(`\n👥 Количество сотрудников в базе: ${count.rows[0].count}`);

    // Показываем всех сотрудников
    if (parseInt(count.rows[0].count) > 0) {
      const staff = await pool.query('SELECT id, email, name, role, is_active FROM staff ORDER BY id');
      console.log('\n📝 Список сотрудников:');
      staff.rows.forEach(s => {
        console.log(`   ${s.id}. ${s.name} (${s.email}) - ${s.role} ${s.is_active ? '✅' : '❌'}`);
      });
    }

    console.log('\n✅ Проверка завершена успешно!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('\nДетали:', error);
    process.exit(1);
  }
}

checkStaffTable()
  .then(() => {
    pool.end();
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    pool.end();
    process.exit(1);
  });
