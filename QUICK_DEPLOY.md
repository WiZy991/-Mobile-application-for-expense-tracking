# ⚡ Быстрый старт: Деплой бэкенда

## 🎯 Самый простой способ (5 минут)

### Вариант A: Используя Docker (рекомендуется)

```bash
cd backend

# 1. Создайте .env файл
cp env.template .env
# Отредактируйте .env и укажите ваши настройки БД

# 2. Запустите с Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# 3. Проверьте статус
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f
```

### Вариант B: На VPS с PM2

```bash
cd backend

# 1. Установите зависимости
npm install --production

# 2. Создайте .env файл
cp env.template .env
# Отредактируйте .env

# 3. Запустите миграции
npm run migrate

# 4. Установите PM2
npm install -g pm2

# 5. Запустите приложение
pm2 start src/server.js --name billing-backend
pm2 save
pm2 startup  # следуйте инструкциям
```

### Вариант C: Облачные платформы (самый простой)

#### Railway
1. Зайдите на [railway.app](https://railway.app)
2. Создайте проект → New Project → Deploy from GitHub
3. Выберите репозиторий
4. Добавьте PostgreSQL сервис
5. Настройте переменные окружения
6. Готово! Railway автоматически задеплоит

#### Render
1. Зайдите на [render.com](https://render.com)
2. New → Web Service
3. Подключите GitHub репозиторий
4. Настройки:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Добавьте PostgreSQL
6. Настройте переменные окружения
7. Deploy!

---

## 📝 Минимальные настройки .env

Для быстрого старта достаточно:

```env
PORT=3000
NODE_ENV=production

# База данных
DB_CONNECTION=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT (ОБЯЗАТЕЛЬНО сгенерируйте новый!)
JWT_SECRET=your_random_32_byte_hex_string_here
JWT_EXPIRES_IN=7d
```

**Сгенерировать JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ✅ Проверка работоспособности

```bash
# Health check
curl http://localhost:3000/health

# Должен вернуться:
# {"status":"ok","timestamp":"...","database":"connected"}
```

---

## 🔧 Обновление приложения

### Docker
```bash
cd backend
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

### PM2
```bash
cd backend
git pull
npm install --production
pm2 restart billing-backend
```

---

## 📱 Настройка мобильного приложения

После деплоя обновите URL в Android приложении:

```kotlin
// В файле конфигурации API (например, ApiClient.kt)
const val BASE_URL = "https://your-domain.com"
// или для Railway: "https://your-app.up.railway.app"
```

Пересоберите APK:
```bash
cd app
./gradlew assembleRelease
```

---

## 🆘 Проблемы?

1. **Приложение не запускается**
   - Проверьте логи: `pm2 logs` или `docker-compose logs`
   - Проверьте .env файл
   - Проверьте подключение к БД

2. **Ошибка подключения к БД**
   - Проверьте учетные данные в .env
   - Убедитесь, что БД доступна
   - Для облачных БД: проверьте whitelist IP

3. **Порт занят**
   - Измените PORT в .env
   - Или остановите процесс на порту: `lsof -ti:3000 | xargs kill`

---

## 📚 Подробная документация

См. [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) для полного руководства.

---

**Удачи! 🚀**
