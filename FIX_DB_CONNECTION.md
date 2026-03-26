# 🔧 Исправление подключения к базе данных

## Проблема

Сервер пытается подключиться к `localhost:3306`, но база данных находится на удаленном сервере Beget (`niwobubofad.beget.app`).

## Решение

### Шаг 1: Откройте файл `backend/.env`

### Шаг 2: Добавьте или проверьте следующие переменные:

```env
# Тип базы данных (ОБЯЗАТЕЛЬНО!)
DB_CONNECTION=mysql

# MySQL Configuration
DB_HOST=niwobubofad.beget.app
DB_PORT=3306
DB_DATABASE=wcb-service
DB_USERNAME=wcb-service
DB_PASSWORD=ваш_пароль_от_бд
```

**ВАЖНО:** 
- `DB_CONNECTION=mysql` - это обязательно! Без этого будет использоваться PostgreSQL по умолчанию
- Используйте `DB_DATABASE` и `DB_USERNAME` (не `DB_NAME` и `DB_USER`) для MySQL

### Шаг 3: Перезапустите сервер

После изменения `.env` файла **обязательно перезапустите сервер**:

```bash
# Остановите текущий процесс (Ctrl+C)
# Затем запустите снова:
cd backend
npm run dev
```

### Шаг 4: Проверьте логи

После перезапуска в логах должно появиться:

```
🔌 MySQL connection config:
   Host: niwobubofad.beget.app
   Port: 3306
   Database: wcb-service
   User: wcb-service
   Password: ***
🔍 Testing MySQL connection...
✅ MySQL database connection established!
```

## Полный пример `.env` файла для MySQL на Beget:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_CONNECTION=mysql
DB_HOST=niwobubofad.beget.app
DB_PORT=3306
DB_DATABASE=wcb-service
DB_USERNAME=wcb-service
DB_PASSWORD=ваш_пароль

# JWT Configuration
JWT_SECRET=your_very_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# СБИС Авторизация для SPP API
SBIS_LOGIN=tenditnika
SBIS_PASSWORD=Tenditnik1!
SBIS_APP_CLIENT_ID=2651426000822745
SBIS_APP_SECRET=G6TMMMZWMAZ55YIP6EAV3S3D
SBIS_SECRET_KEY=7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg
```

## Возможные ошибки:

### Ошибка: `ER_HOST_NOT_PRIVILEGED`
Если видите эту ошибку, нужно добавить ваш IP в whitelist MySQL на Beget:
1. Зайдите в панель управления Beget
2. Откройте "Базы данных" → "MySQL"
3. Добавьте ваш IP адрес в whitelist

### Ошибка: `ECONNREFUSED` или `EACCES`
- Проверьте, что `DB_HOST` указан правильно
- Проверьте, что MySQL сервер доступен с вашего IP
- Проверьте пароль в `DB_PASSWORD`
