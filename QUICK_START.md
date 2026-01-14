# 🚀 Быстрый старт - Настройка базы данных

## 📥 Шаг 1: Установите PostgreSQL

Скачайте установщик:
👉 https://www.postgresql.org/download/windows/

**Важно во время установки:**

- ✍️ Запомните пароль для пользователя `postgres`
- ✅ Порт: `5432` (по умолчанию)
- ✅ Установите pgAdmin 4

---

## 🗄️ Шаг 2: Создайте базу данных

### Вариант A: Автоматически (PowerShell скрипт)

```powershell
cd backend
.\setup-database.ps1
```

Скрипт создаст базу данных и пользователя автоматически.

### Вариант B: Вручную (через SQL Shell)

1. Откройте **SQL Shell (psql)** из меню Пуск
2. Нажимайте Enter для всех подсказок
3. Введите пароль `postgres`
4. Выполните команды:

```sql
CREATE DATABASE billing_db;
CREATE USER billing_user WITH PASSWORD 'SecurePassword123';
GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;
\c billing_db
GRANT ALL ON SCHEMA public TO billing_user;
\q
```

---

## ⚙️ Шаг 3: Создайте файл .env

Создайте файл `backend\.env` со следующим содержимым:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=billing_user
DB_PASSWORD=SecurePassword123

JWT_SECRET=my_super_secret_key_12345678
JWT_EXPIRES_IN=7d

SBIS_API_URL=https://api.sbis.ru
SBIS_CLIENT_ID=
SBIS_CLIENT_SECRET=
SBIS_ACCESS_TOKEN=
```

⚠️ **Измените `DB_PASSWORD` и `JWT_SECRET` на свои значения!**

---

## 🔄 Шаг 4: Запустите миграции

```powershell
cd backend
npm install
npm run migrate
```

✅ Вы должны увидеть:

```
✅ Database connection established
✅ Database tables created
✅ Database migration completed
```

---

## 🎯 Шаг 5: Запустите backend сервер

```powershell
npm run dev
```

✅ Сервер запустится на: http://localhost:3000

---

## 🧪 Проверка работы

Проверьте, что API работает:

```powershell
curl http://localhost:3000/api/auth/register -Method POST -ContentType "application/json" -Body '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

---

## ❌ Проблемы?

### "ECONNREFUSED" - PostgreSQL не подключается

**Решение:**

```powershell
# Проверьте службу
Get-Service -Name "*postgres*"

# Запустите службу, если остановлена
Start-Service postgresql-x64-16
```

### "password authentication failed"

**Решение:**

- Проверьте пароль в файле `.env`
- Убедитесь, что пользователь `billing_user` создан

### "database does not exist"

**Решение:**

- Убедитесь, что база `billing_db` создана
- Проверьте через pgAdmin или повторите Шаг 2

---

## 📚 Полное руководство

Подробная инструкция: [POSTGRESQL_SETUP_GUIDE.md](POSTGRESQL_SETUP_GUIDE.md)

---

## 📱 Следующие шаги

1. ✅ Backend настроен и запущен
2. 📱 Настройте мобильное приложение (см. README.md)
3. 🔗 Настройте интеграцию со СБИС (опционально)
4. 📧 Настройте email уведомления (опционально)

---

## 🎉 Готово!

Ваша система биллинга готова к работе!

Тестовый пользователь можно создать через мобильное приложение или API.
