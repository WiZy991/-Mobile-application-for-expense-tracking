# Инструкция по настройке проекта

## Шаг 1: Настройка Backend

### 1.1 Установка PostgreSQL

Установите PostgreSQL на вашу систему:
- Windows: https://www.postgresql.org/download/windows/
- macOS: `brew install postgresql`
- Linux: `sudo apt-get install postgresql`

### 1.2 Создание базы данных

```sql
CREATE DATABASE billing_db;
CREATE USER billing_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;
```

### 1.3 Настройка Backend

1. Перейдите в директорию backend:
```bash
cd backend
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env`:
```bash
# Скопируйте пример (если файл .env.example существует)
cp .env.example .env

# Или создайте вручную со следующим содержимым:
```

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=billing_user
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_very_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# СБИС API
SBIS_API_URL=https://api.sbis.ru
SBIS_CLIENT_ID=your_client_id
SBIS_CLIENT_SECRET=your_client_secret
SBIS_ACCESS_TOKEN=your_access_token

# Email (для уведомлений)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Telegram Bot (опционально)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Push Notifications (Firebase)
FIREBASE_SERVER_KEY=your_firebase_server_key
```

4. Инициализируйте базу данных:
```bash
npm run migrate
```

5. Запустите сервер:
```bash
npm run dev
```

Сервер должен запуститься на `http://localhost:3000`

## Шаг 2: Настройка Mobile App

### 2.1 Установка зависимостей

1. Установите Expo CLI глобально (если ещё не установлен):
```bash
npm install -g expo-cli
```

2. Перейдите в директорию mobile:
```bash
cd mobile
```

3. Установите зависимости:
```bash
npm install
```

### 2.2 Настройка API URL

Откройте `mobile/app.json` и измените `apiUrl` на адрес вашего backend:

```json
{
  "extra": {
    "apiUrl": "http://YOUR_IP:3000/api"
  }
}
```

**Важно:** Для тестирования на реальном устройстве используйте IP-адрес вашего компьютера, а не `localhost`.

### 2.3 Запуск приложения

```bash
npm start
```

Затем:
- Нажмите `i` для iOS симулятора
- Нажмите `a` для Android эмулятора
- Отсканируйте QR-код в приложении Expo Go на вашем телефоне

## Шаг 3: Настройка интеграции со СБИС

### 3.1 Получение доступа к СБИС API

1. Зарегистрируйтесь в СБИС
2. Получите доступ к API (может потребоваться отдельный тариф)
3. Получите `CLIENT_ID`, `CLIENT_SECRET` и `ACCESS_TOKEN`

### 3.2 Настройка маппинга услуг

Откройте `backend/src/services/sbisService.js` и настройте маппинг услуг СБИС на ваши внутренние коды:

```javascript
const SBIS_SERVICE_MAPPING = {
  'sbis_online': 'sbis',
  'sbis_cloud': 'sbis',
  'evotor': 'evotor',
  'atol': 'atol',
  // Добавьте свои маппинги
};
```

### 3.3 Привязка клиентов к контрактам СБИС

Для каждого клиента в базе данных укажите `sbis_contract_id`:

```sql
UPDATE clients SET sbis_contract_id = 'CONTRACT_ID_FROM_SBIS' WHERE id = CLIENT_ID;
```

## Шаг 4: Настройка уведомлений

### 4.1 Email уведомления

Для Gmail:
1. Включите двухфакторную аутентификацию
2. Создайте пароль приложения: https://myaccount.google.com/apppasswords
3. Используйте этот пароль в `SMTP_PASSWORD`

### 4.2 Telegram уведомления (опционально)

1. Создайте бота через @BotFather в Telegram
2. Получите токен бота
3. Укажите токен в `.env` как `TELEGRAM_BOT_TOKEN`
4. Для каждого клиента сохраните его `telegram_chat_id` (можно добавить в таблицу clients)

### 4.3 Push-уведомления

Для полноценных push-уведомлений потребуется:
1. Настроить Firebase Cloud Messaging
2. Получить server key
3. Указать в `.env` как `FIREBASE_SERVER_KEY`

## Шаг 5: Тестирование

### 5.1 Создание тестового клиента

1. Запустите backend
2. Используйте API или мобильное приложение для регистрации:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Тестовый Клиент",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 5.2 Проверка синхронизации со СБИС

После настройки `sbis_contract_id` для клиента:
```bash
curl -X POST http://localhost:3000/api/sbis/sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Возможные проблемы

### Backend не подключается к БД
- Проверьте, что PostgreSQL запущен
- Проверьте параметры подключения в `.env`
- Убедитесь, что база данных создана

### Mobile app не подключается к API
- Проверьте, что backend запущен
- Убедитесь, что `apiUrl` в `app.json` указывает на правильный адрес
- Для реального устройства используйте IP-адрес, а не localhost
- Проверьте, что порт 3000 не заблокирован файрволом

### Ошибки синхронизации со СБИС
- Проверьте валидность `SBIS_ACCESS_TOKEN`
- Убедитесь, что `sbis_contract_id` указан для клиента
- Проверьте логи в таблице `sbis_sync_log`

## Следующие шаги

1. Настройте production окружение
2. Настройте HTTPS для backend
3. Добавьте rate limiting
4. Настройте мониторинг и логирование
5. Добавьте резервное копирование базы данных

