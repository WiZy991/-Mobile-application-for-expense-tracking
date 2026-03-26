# 🚀 Руководство по деплою бэкенда на сервер

Это руководство поможет вам опубликовать бэкенд приложения на сервере, чтобы клиенты могли использовать мобильное приложение.

## 📋 Содержание

1. [Подготовка к деплою](#подготовка-к-деплою)
2. [Вариант 1: Деплой на VPS/выделенный сервер](#вариант-1-деплой-на-vpsвыделенный-сервер)
3. [Вариант 2: Деплой с Docker](#вариант-2-деплой-с-docker)
4. [Вариант 3: Деплой на облачные платформы](#вариант-3-деплой-на-облачные-платформы)
5. [Настройка мобильного приложения](#настройка-мобильного-приложения)
6. [Проверка работоспособности](#проверка-работоспособности)
7. [Мониторинг и обслуживание](#мониторинг-и-обслуживание)

---

## Подготовка к деплою

### 1. Требования к серверу

- **ОС**: Linux (Ubuntu 20.04+ / Debian 11+ / CentOS 8+)
- **RAM**: минимум 1GB (рекомендуется 2GB+)
- **CPU**: 1 ядро (рекомендуется 2+)
- **Диск**: минимум 10GB свободного места
- **Сеть**: статический IP-адрес или доменное имя

### 2. Необходимое ПО

- Node.js 16+ или 18+ (LTS версия)
- npm или yarn
- PostgreSQL 12+ или MySQL 8+ (или используйте облачную БД)
- PM2 (для управления процессом) или Docker
- Nginx (для reverse proxy, опционально)

### 3. Подготовка переменных окружения

Создайте файл `.env` в папке `backend/` на основе `env.template`:

```bash
cd backend
cp env.template .env
nano .env  # или используйте любой редактор
```

**Важные переменные для продакшн:**

```env
# Server
PORT=3000
NODE_ENV=production

# Database (используйте вашу продакшн БД)
DB_CONNECTION=mysql  # или postgresql
DB_HOST=your-db-host.com
DB_PORT=3306  # или 5432 для PostgreSQL
DB_DATABASE=your_database_name
DB_USERNAME=your_db_user
DB_PASSWORD=your_secure_password

# JWT (ОБЯЗАТЕЛЬНО сгенерируйте новый секретный ключ!)
# Сгенерируйте: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_very_long_and_secure_random_string_here
JWT_EXPIRES_IN=7d

# СБИС API (если используется)
SBIS_API_URL=https://api.sbis.ru
SBIS_CLIENT_ID=your_client_id
SBIS_CLIENT_SECRET=your_client_secret
# ... остальные переменные СБИС

# Email, Telegram, Firebase (если используются)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
FIREBASE_SERVER_KEY=your_firebase_key
```

---

## Вариант 1: Деплой на VPS/выделенный сервер

### Шаг 1: Подключение к серверу

```bash
ssh user@your-server-ip
```

### Шаг 2: Установка Node.js

```bash
# Для Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка установки
node --version
npm --version
```

### Шаг 3: Установка PostgreSQL (если используете локальную БД)

```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Создание базы данных
sudo -u postgres psql
CREATE DATABASE billing_db;
CREATE USER billing_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;
\q
```

### Шаг 4: Клонирование проекта

```bash
# Установка Git (если не установлен)
sudo apt-get install git

# Клонирование репозитория
cd /var/www  # или другая папка
git clone https://github.com/your-username/your-repo.git
cd your-repo/backend
```

### Шаг 5: Установка зависимостей

```bash
npm install --production
```

### Шаг 6: Настройка переменных окружения

```bash
cp env.template .env
nano .env  # отредактируйте файл с продакшн настройками
```

### Шаг 7: Запуск миграций БД

```bash
npm run migrate
```

### Шаг 8: Установка PM2

```bash
sudo npm install -g pm2

# Запуск приложения
pm2 start src/server.js --name billing-backend

# Сохранение конфигурации PM2
pm2 save
pm2 startup  # следуйте инструкциям для автозапуска
```

### Шаг 9: Настройка Nginx (рекомендуется)

```bash
sudo apt-get install nginx

# Создание конфигурации
sudo nano /etc/nginx/sites-available/billing-backend
```

Содержимое файла:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # или ваш IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активация конфигурации:

```bash
sudo ln -s /etc/nginx/sites-available/billing-backend /etc/nginx/sites-enabled/
sudo nginx -t  # проверка конфигурации
sudo systemctl restart nginx
```

### Шаг 10: Настройка SSL (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Полезные команды PM2

```bash
pm2 list              # список процессов
pm2 logs billing-backend  # логи
pm2 restart billing-backend  # перезапуск
pm2 stop billing-backend    # остановка
pm2 delete billing-backend  # удаление
pm2 monit             # мониторинг в реальном времени
```

---

## Вариант 2: Деплой с Docker

### Шаг 1: Установка Docker и Docker Compose

```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверка
docker --version
docker-compose --version
```

### Шаг 2: Подготовка файлов

Убедитесь, что у вас есть:
- `Dockerfile` (создан в проекте)
- `docker-compose.yml` (обновлен для продакшн)
- `.env` файл с продакшн настройками

### Шаг 3: Сборка и запуск

```bash
cd backend

# Сборка образа
docker build -t billing-backend .

# Запуск с docker-compose
docker-compose up -d

# Просмотр логов
docker-compose logs -f
```

### Шаг 4: Обновление приложения

```bash
# Остановка
docker-compose down

# Обновление кода
git pull

# Пересборка и запуск
docker-compose up -d --build
```

---

## Вариант 3: Деплой на облачные платформы

### Railway

1. Зарегистрируйтесь на [railway.app](https://railway.app)
2. Создайте новый проект
3. Подключите GitHub репозиторий
4. Добавьте PostgreSQL или MySQL сервис
5. Настройте переменные окружения в настройках проекта
6. Railway автоматически определит Node.js и запустит приложение

### Render

1. Зарегистрируйтесь на [render.com](https://render.com)
2. Создайте новый Web Service
3. Подключите GitHub репозиторий
4. Настройки:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Root Directory**: `backend`
5. Добавьте PostgreSQL или MySQL базу данных
6. Настройте переменные окружения
7. Деплой автоматически запустится

### Heroku

1. Установите Heroku CLI
2. Войдите: `heroku login`
3. Создайте приложение: `heroku create your-app-name`
4. Добавьте PostgreSQL: `heroku addons:create heroku-postgresql:hobby-dev`
5. Настройте переменные: `heroku config:set JWT_SECRET=your_secret`
6. Деплой: `git push heroku main`

### DigitalOcean App Platform

1. Зарегистрируйтесь на [digitalocean.com](https://digitalocean.com)
2. Создайте новый App
3. Подключите GitHub репозиторий
4. Настройте:
   - **Type**: Web Service
   - **Build Command**: `cd backend && npm install`
   - **Run Command**: `cd backend && npm start`
5. Добавьте базу данных (PostgreSQL или MySQL)
6. Настройте переменные окружения
7. Деплой запустится автоматически

---

## Настройка мобильного приложения

После деплоя бэкенда нужно обновить URL API в мобильном приложении.

### Для Android

Найдите файл с конфигурацией API (обычно это `ApiClient.kt`, `Config.kt` или `Constants.kt`):

```kotlin
// Было (для разработки)
const val BASE_URL = "http://10.0.2.2:3000"

// Станет (для продакшн)
const val BASE_URL = "https://your-domain.com"
// или
const val BASE_URL = "https://your-railway-app.up.railway.app"
```

**Рекомендация**: Используйте Build Variants для разных окружений:

```kotlin
object Config {
    const val BASE_URL = if (BuildConfig.DEBUG) {
        "http://10.0.2.2:3000"  // Development
    } else {
        "https://your-domain.com"  // Production
    }
}
```

### Пересборка APK

```bash
cd app
./gradlew assembleRelease
```

APK будет в `app/build/outputs/apk/release/`

---

## Проверка работоспособности

### 1. Health Check

```bash
curl https://your-domain.com/health
```

Должен вернуться:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "database": "connected",
  "jwtSecret": true
}
```

### 2. Проверка API endpoints

```bash
# Тест регистрации
curl -X POST https://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'

# Тест входа
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 3. Проверка из мобильного приложения

1. Установите обновленное приложение на устройство
2. Попробуйте зарегистрироваться или войти
3. Проверьте работу основных функций

---

## Мониторинг и обслуживание

### Логи

**PM2:**
```bash
pm2 logs billing-backend --lines 100
```

**Docker:**
```bash
docker-compose logs -f --tail=100
```

**Nginx:**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Мониторинг производительности

```bash
# PM2 мониторинг
pm2 monit

# Использование ресурсов
htop  # или top
df -h  # свободное место на диске
```

### Резервное копирование базы данных

**PostgreSQL:**
```bash
pg_dump -h localhost -U billing_user billing_db > backup_$(date +%Y%m%d).sql
```

**MySQL:**
```bash
mysqldump -u billing_user -p billing_db > backup_$(date +%Y%m%d).sql
```

### Автоматическое резервное копирование

Создайте скрипт `/usr/local/bin/backup-db.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/billing"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# PostgreSQL
pg_dump -h localhost -U billing_user billing_db | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

Добавьте в crontab:
```bash
crontab -e
# Каждый день в 2:00
0 2 * * * /usr/local/bin/backup-db.sh
```

### Обновление приложения

```bash
# Остановка
pm2 stop billing-backend  # или docker-compose down

# Обновление кода
git pull origin main

# Установка новых зависимостей
npm install --production

# Запуск миграций (если есть)
npm run migrate

# Запуск
pm2 restart billing-backend  # или docker-compose up -d
```

---

## Решение проблем

### Приложение не запускается

1. Проверьте логи: `pm2 logs` или `docker-compose logs`
2. Проверьте переменные окружения: `cat .env`
3. Проверьте подключение к БД: `npm run migrate`
4. Проверьте порт: `netstat -tulpn | grep 3000`

### Ошибки подключения к БД

1. Проверьте доступность БД: `ping your-db-host`
2. Проверьте учетные данные в `.env`
3. Проверьте firewall: `sudo ufw status`
4. Для облачных БД: проверьте whitelist IP адресов

### Проблемы с SSL

1. Проверьте сертификат: `certbot certificates`
2. Обновите сертификат: `sudo certbot renew`
3. Проверьте конфигурацию Nginx: `sudo nginx -t`

### Высокая нагрузка

1. Увеличьте количество процессов PM2: `pm2 scale billing-backend 2`
2. Настройте connection pool в БД
3. Используйте кэширование (Redis)
4. Рассмотрите использование CDN для статических файлов

---

## Безопасность

### Рекомендации

1. ✅ Используйте сильные пароли для БД и JWT_SECRET
2. ✅ Включите HTTPS (SSL/TLS)
3. ✅ Настройте firewall (откройте только необходимые порты)
4. ✅ Регулярно обновляйте зависимости: `npm audit fix`
5. ✅ Не коммитьте `.env` файл в Git
6. ✅ Используйте переменные окружения для секретов
7. ✅ Настройте rate limiting для API
8. ✅ Регулярно делайте резервные копии БД

### Настройка Firewall (UFW)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## Контакты и поддержка

Если возникли проблемы при деплое:
1. Проверьте логи приложения
2. Проверьте документацию используемой платформы
3. Убедитесь, что все переменные окружения настроены правильно

---

**Успешного деплоя! 🚀**
