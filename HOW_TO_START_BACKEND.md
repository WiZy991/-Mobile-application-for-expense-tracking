# 🚀 Как запустить бэкенд - Пошаговая инструкция

## Проблема
Android приложение не может подключиться к `http://10.0.2.2:3000` - бэкенд не запущен.

## Решение

### Шаг 1: Откройте терминал в папке проекта

```powershell
cd C:\Prodject\-Mobile-application-for-expense-tracking\backend-kotlin
```

### Шаг 2: Проверьте, что файл .env существует

```powershell
Test-Path .env
```

Если файла нет, создайте его:
```powershell
Copy-Item env.template .env
```

### Шаг 3: Отредактируйте .env файл

Откройте файл `.env` в любом текстовом редакторе и укажите:

```env
PORT=3000
NODE_ENV=development

# Database Configuration
# ВАЖНО: Сейчас используется PostgreSQL, но у вас MySQL
# Для начала можно использовать локальную PostgreSQL или временно изменить на MySQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=ваш_пароль_от_postgresql

# JWT Configuration (ОБЯЗАТЕЛЬНО!)
JWT_SECRET=MySecretKey123!ChangeThisInProduction
JWT_EXPIRES_IN=7d
```

**Или используйте вашу MySQL базу:**
```env
PORT=3000
NODE_ENV=development

# MySQL Configuration (нужно будет изменить код)
DB_HOST=10.16.0.1
DB_PORT=3306
DB_NAME=wcb-service
DB_USER=wcb-service
DB_PASSWORD=Wcb12345@!

JWT_SECRET=MySecretKey123!ChangeThisInProduction
JWT_EXPIRES_IN=7d
```

### Шаг 4: Соберите проект

```powershell
.\gradlew.bat build
```

### Шаг 5: Запустите бэкенд

```powershell
.\gradlew.bat run
```

### Шаг 6: Проверьте, что сервер запустился

Вы должны увидеть в консоли:
```
🚀 Server running on port 3000
📊 Environment: development
✅ Database connection established
✅ Database tables created
```

### Шаг 7: Проверьте в браузере

Откройте: `http://localhost:3000/health`

Должен вернуться JSON: `{"status":"ok"}`

## ⚠️ Если бэкенд не запускается

### Ошибка: "JWT_SECRET not set"
- Проверьте, что в `.env` файле указан `JWT_SECRET`
- Убедитесь, что нет лишних пробелов вокруг `=`

### Ошибка: "Database connection failed"
- Если используете PostgreSQL: убедитесь, что PostgreSQL установлен и запущен
- Если используете MySQL: нужно изменить код (см. ниже)

### Ошибка: "Port 3000 already in use"
- Другой процесс использует порт 3000
- Измените `PORT=3001` в `.env` и обновите URL в Android приложении

## 🔄 Переход на MySQL

Если нужно использовать вашу MySQL базу вместо PostgreSQL:

1. Измените `build.gradle.kts` - замените PostgreSQL драйвер на MySQL
2. Измените `DatabaseFactory.kt` - измените JDBC URL на MySQL формат
3. Обновите `.env` файл с вашими данными MySQL

Но для начала попробуйте запустить с PostgreSQL (можно установить локально) или временно используйте демо-режим без БД.
