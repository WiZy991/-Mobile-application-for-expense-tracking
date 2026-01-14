# 📘 Подробная инструкция по установке PostgreSQL для Windows

## Шаг 1: Скачивание PostgreSQL

1. Перейдите на официальный сайт: https://www.postgresql.org/download/windows/
2. Выберите "Download the installer" от EnterpriseDB
3. Скачайте последнюю стабильную версию (рекомендуется PostgreSQL 15 или 16)

## Шаг 2: Установка PostgreSQL

1. **Запустите установщик** (postgresql-XX-windows-x64.exe)

2. **Выберите компоненты для установки** (оставьте все по умолчанию):

   - ✅ PostgreSQL Server
   - ✅ pgAdmin 4 (графический интерфейс для управления БД)
   - ✅ Stack Builder (опционально)
   - ✅ Command Line Tools

3. **Выберите директорию для данных** (можно оставить по умолчанию):

   - `C:\Program Files\PostgreSQL\16\data`

4. **Установите пароль для суперпользователя postgres**:

   - ⚠️ **ВАЖНО**: Запомните или запишите этот пароль!
   - Пример: `postgres123` (для разработки)
   - В production используйте сильный пароль!

5. **Порт** (оставьте по умолчанию):

   - `5432`

6. **Локаль** (можно оставить по умолчанию):

   - `[Default locale]`

7. Завершите установку и дождитесь окончания процесса

## Шаг 3: Проверка установки

Откройте PowerShell и выполните:

```powershell
# Проверка, что служба PostgreSQL запущена
Get-Service -Name "*postgres*"
```

Вы должны увидеть что-то вроде:

```
Status   Name               DisplayName
------   ----               -----------
Running  postgresql-x64-16  postgresql-x64-16 - PostgreSQL...
```

Если служба не запущена:

```powershell
Start-Service postgresql-x64-16
```

## Шаг 4: Создание базы данных и пользователя

### Вариант A: Через командную строку (psql)

1. Откройте меню Пуск → найдите "SQL Shell (psql)" → запустите

2. Нажимайте Enter для всех подсказок (используются значения по умолчанию):

   ```
   Server [localhost]:
   Database [postgres]:
   Port [5432]:
   Username [postgres]:
   Password for user postgres: [введите пароль, который установили]
   ```

3. Выполните SQL команды для создания БД:

```sql
-- Создание базы данных
CREATE DATABASE billing_db;

-- Создание пользователя
CREATE USER billing_user WITH PASSWORD 'SecurePassword123';

-- Выдача всех прав на базу данных
GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;

-- Подключение к новой базе данных
\c billing_db

-- Выдача прав на схему public (для PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO billing_user;

-- Выход
\q
```

### Вариант B: Через pgAdmin 4 (графический интерфейс)

1. Откройте pgAdmin 4 из меню Пуск
2. Введите мастер-пароль (если попросит)
3. Раскройте "Servers" → "PostgreSQL 16" (введите пароль postgres)

**Создание базы данных:**

1. Правой кнопкой на "Databases" → "Create" → "Database"
2. Name: `billing_db`
3. Owner: `postgres`
4. Нажмите "Save"

**Создание пользователя:**

1. Раскройте "PostgreSQL 16"
2. Правой кнопкой на "Login/Group Roles" → "Create" → "Login/Group Role"
3. Вкладка "General": Name: `billing_user`
4. Вкладка "Definition": Password: `SecurePassword123`
5. Вкладка "Privileges": включите все галочки (Can login?, Superuser?)
6. Нажмите "Save"

## Шаг 5: Проверка подключения

Проверьте, что можете подключиться к новой базе:

```powershell
psql -U billing_user -d billing_db -h localhost
```

Введите пароль `SecurePassword123`. Если подключение успешно, вы увидите:

```
billing_db=>
```

Введите `\q` для выхода.

## Шаг 6: Создание файла .env

В директории `backend` создайте файл `.env` на основе `.env.example`:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=billing_user
DB_PASSWORD=SecurePassword123

# JWT Configuration
JWT_SECRET=my_super_secret_jwt_key_for_development_12345678
JWT_EXPIRES_IN=7d

# СБИС API Configuration (заполните позже, когда получите доступ)
SBIS_API_URL=https://api.sbis.ru
SBIS_CLIENT_ID=
SBIS_CLIENT_SECRET=
SBIS_ACCESS_TOKEN=

# Email Notifications (можно настроить позже)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# Telegram Bot (опционально)
TELEGRAM_BOT_TOKEN=

# Firebase Push Notifications (опционально)
FIREBASE_SERVER_KEY=
```

⚠️ **ВАЖНО**: Измените `DB_PASSWORD` на тот пароль, который вы установили для пользователя `billing_user`!

## Шаг 7: Запуск миграций

В PowerShell перейдите в директорию backend и запустите миграции:

```powershell
cd backend
npm run migrate
```

Если всё настроено правильно, вы увидите:

```
✅ Database connection established
✅ Database tables created
✅ Database migration completed
```

## Шаг 8: Запуск backend сервера

```powershell
npm run dev
```

Сервер должен запуститься на http://localhost:3000

## 🔧 Возможные проблемы и решения

### Проблема: "psql: error: connection to server failed"

**Решение:**

1. Проверьте, что служба PostgreSQL запущена:
   ```powershell
   Get-Service -Name "*postgres*"
   ```
2. Если не запущена, запустите:
   ```powershell
   Start-Service postgresql-x64-16
   ```

### Проблема: "password authentication failed"

**Решение:**

- Убедитесь, что используете правильный пароль
- Проверьте, что пользователь создан с правильными правами

### Проблема: "FATAL: database does not exist"

**Решение:**

- Убедитесь, что база данных `billing_db` создана
- Проверьте в pgAdmin или через psql:
  ```sql
  \l  -- список всех баз данных
  ```

### Проблема: "permission denied for schema public"

**Решение (для PostgreSQL 15+):**

```sql
-- Подключитесь к базе billing_db
\c billing_db

-- Выдайте права на схему
GRANT ALL ON SCHEMA public TO billing_user;
```

## 📊 Проверка созданных таблиц

После успешной миграции, подключитесь к базе и проверьте таблицы:

```powershell
psql -U billing_user -d billing_db -h localhost
```

В psql:

```sql
-- Список всех таблиц
\dt

-- Структура таблицы clients
\d clients

-- Список всех пользователей
\du
```

Вы должны увидеть таблицы:

- clients
- services
- client_services
- transactions
- sbis_sync_log
- notifications

## 🎉 Готово!

Теперь ваша база данных настроена и готова к использованию!

Следующие шаги:

1. Запустите backend сервер: `npm run dev`
2. Настройте мобильное приложение
3. Создайте тестового пользователя через API

## 📚 Полезные команды psql

```sql
\l              -- Список всех баз данных
\c dbname       -- Подключиться к базе данных
\dt             -- Список таблиц
\d tablename    -- Структура таблицы
\du             -- Список пользователей
\q              -- Выход
```

## 📝 Дополнительные инструменты

- **pgAdmin 4** - графический интерфейс для PostgreSQL
- **DBeaver** - универсальный клиент для баз данных
- **Azure Data Studio** - современный инструмент от Microsoft
