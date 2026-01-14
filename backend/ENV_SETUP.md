# Настройка переменных окружения

## Проблема: JWT_SECRET is missing

Если вы видите ошибку `Server configuration error: JWT_SECRET is missing`, значит файл `.env` не создан или не содержит необходимые переменные.

## Решение

### Шаг 1: Создайте файл `.env`

В папке `backend` создайте файл `.env` (без расширения) со следующим содержимым:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=your_password_here

# JWT - ОБЯЗАТЕЛЬНО!
JWT_SECRET=your_very_secret_jwt_key_change_this_in_production_12345
JWT_EXPIRES_IN=7d
```

### Шаг 2: Настройте базу данных

1. Убедитесь, что PostgreSQL запущен
2. Создайте базу данных:
   ```sql
   CREATE DATABASE billing_db;
   ```
3. Укажите правильные `DB_USER` и `DB_PASSWORD` в файле `.env`

### Шаг 3: Запустите миграции

```bash
cd backend
npm run migrate
```

### Шаг 4: Перезапустите сервер

После создания файла `.env` перезапустите сервер:

```bash
npm run dev
# или
npm start
```

## Генерация безопасного JWT_SECRET

Для production используйте случайную строку. Можно сгенерировать:

**Windows PowerShell:**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})
```

**Linux/Mac:**
```bash
openssl rand -base64 32
```

**Или используйте онлайн генератор:**
https://www.grc.com/passwords.htm

## Проверка

После настройки откройте в браузере:
```
http://localhost:3000/health
```

Должен вернуться JSON с `"jwtSecret": true`
