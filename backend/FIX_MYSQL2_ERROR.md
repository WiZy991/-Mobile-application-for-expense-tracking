# 🔧 Решение ошибки: Cannot find module 'mysql2/promise'

## Проблема

Backend не может запуститься, потому что отсутствует модуль `mysql2`, который требуется для подключения к MySQL.

## Решение

### Вариант 1: Добавить mysql2 в package.json и пересобрать образ (РЕКОМЕНДУЕТСЯ)

1. **На сервере отредактируйте package.json:**

```bash
cd /root/-Mobile-application-for-expense-tracking/backend
nano package.json
```

2. **Добавьте `mysql2` в dependencies** (после строки с `"multer"`):

```json
"dependencies": {
  "axios": "^1.13.2",
  "bcryptjs": "^2.4.3",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "express-validator": "^7.0.1",
  "jsonwebtoken": "^9.0.2",
  "multer": "^1.4.5-lts.1",
  "mysql2": "^3.6.5",
  "node-cron": "^3.0.3",
  "node-telegram-bot-api": "^0.64.0",
  "nodemailer": "^6.9.7",
  "pg": "^8.11.3",
  "puppeteer": "^24.37.5",
  "qrcode": "^1.5.4"
}
```

3. **Пересоберите Docker образ:**

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Остановите контейнеры
docker-compose -f docker-compose.prod.yml down

# Пересоберите образ без кэша
docker-compose -f docker-compose.prod.yml build --no-cache backend

# Запустите заново
docker-compose -f docker-compose.prod.yml up -d

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Вариант 2: Установить mysql2 внутри контейнера (временное решение)

```bash
# Войдите в контейнер
docker exec -it billing-backend sh

# Установите mysql2
npm install mysql2@^3.6.5

# Выйдите из контейнера
exit

# Перезапустите контейнер
docker restart billing-backend
```

**⚠️ Внимание:** Это временное решение! При пересборке образа изменения потеряются. Используйте Вариант 1 для постоянного решения.

### Вариант 3: Использовать PostgreSQL вместо MySQL

Если вы используете PostgreSQL (как в docker-compose.prod.yml), измените `.env`:

```bash
cd /root/-Mobile-application-for-expense-tracking/backend
nano .env
```

Измените:
```env
DB_CONNECTION=postgresql
```

Затем перезапустите:
```bash
docker-compose -f docker-compose.prod.yml restart backend
```

## Быстрое решение (скопируйте и выполните)

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# 1. Добавьте mysql2 в package.json
sed -i '/"multer":/a\    "mysql2": "^3.6.5",' package.json

# 2. Остановите контейнеры
docker-compose -f docker-compose.prod.yml down

# 3. Пересоберите образ
docker-compose -f docker-compose.prod.yml build --no-cache backend

# 4. Запустите
docker-compose -f docker-compose.prod.yml up -d

# 5. Проверьте логи
docker-compose -f docker-compose.prod.yml logs -f backend
```

## Проверка после исправления

```bash
# Проверьте, что контейнер запущен
docker ps | grep billing-backend

# Проверьте логи (не должно быть ошибок про mysql2)
docker logs billing-backend --tail 20

# Проверьте health endpoint
curl http://localhost:3000/health

# Проверьте через Nginx
curl http://localhost/health
```

## Если используете PostgreSQL

Если вы используете PostgreSQL (как указано в docker-compose.prod.yml), убедитесь, что в `.env` указано:

```env
DB_CONNECTION=postgresql
DB_HOST=postgres  # имя сервиса в docker-compose
DB_PORT=5432
DB_NAME=billing_db
DB_USER=billing_user
DB_PASSWORD=SecurePassword123
```

Тогда `mysql2` не нужен, и ошибка должна исчезнуть после изменения `DB_CONNECTION`.

---

**Выберите вариант в зависимости от того, какую БД вы используете!**
