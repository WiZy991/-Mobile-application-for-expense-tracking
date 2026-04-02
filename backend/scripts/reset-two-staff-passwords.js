/**
 * Одноразовый сброс паролей для инженера и менеджера.
 * Запуск: node scripts/reset-two-staff-passwords.js
 * Удалите скрипт после использования при желании.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

function randomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  let s = '';
  const buf = crypto.randomBytes(16);
  for (let i = 0; i < 14; i++) s += chars[buf[i] % chars.length];
  return s + 'Aa1'; // гарантируем буквы разного регистра и цифру
}

const TARGETS = [
  { email: 'arzamascev@worldcashbox.ru', label: 'Инженер (Александр)' },
  { email: 'karinna@worldcashbox.ru', label: 'Директор/менеджер (Карина)' },
];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const results = [];

  for (const { email, label } of TARGETS) {
    const plain = randomPassword();
    const hash = await bcrypt.hash(plain, 12);
    const [r] = await conn.execute(
      'UPDATE staff SET password_hash = ? WHERE email = ?',
      [hash, email]
    );
    results.push({ label, email, plain, affected: r.affectedRows });
  }

  await conn.end();

  console.log('\n=== Сохраните пароли в надёжном месте ===\n');
  for (const row of results) {
    console.log(`${row.label}`);
    console.log(`  Email:    ${row.email}`);
    console.log(`  Пароль:   ${row.plain}`);
    console.log(`  Строк обновлено: ${row.affected}\n`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
