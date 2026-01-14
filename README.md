# Система биллинга и личного кабинета клиентов

Комплексное решение для управления биллингом, личным кабинетом клиентов с интеграцией СБИС и мобильным приложением.

## ⭐ НОВОЕ: Полная интеграция CRM СБИС - РАБОТАЕТ! 🎉

**При регистрации клиента данные автоматически подтягиваются из вашей CRM!**

### ✅ Backend API (готово)

- **Контрагент.ПоИННКППКФ** - поиск/создание контрагентов по ИНН
- **CRMClients.SaveCustomer** - создание физ. лиц в CRM
- **CRMLead.insertRecord** - создание сделок
- **CRMLead.getCRMThemeByName** - получение тем отношений

### ✅ Mobile App (готово)

- **RegisterScreen** - автоматический поиск клиента по ИНН
- **Авторизация в СБИС** - из `sbisConfig.js`
- **Отображение данных** - сделки, документы, контакты
- **UI индикаторы** - прогресс поиска, бейджи источника данных

### 📖 Документация

- **[Backend API](./SBIS_CRM_INTEGRATION.md)** - полная документация
- **[Mobile Setup](./mobile/SBIS_CRM_SETUP.md)** - настройка приложения
- **[Quick Test](./QUICK_TEST_MOBILE.md)** - быстрый старт
- **[Success Report](./SBIS_SUCCESS_REPORT.md)** - отчет о выполнении

## 🎯 Возможности

### Backend

- **Личный кабинет клиента** с балансом, историей платежей и начислений
- **Детальное описание затрат** - за что списано, к какому сервису относится, дата, сумма, период
- **Интеграция CRM СБИС** ⭐ - автоматическая загрузка клиентов, сделок и документов из вашей CRM
- **Интеграция со СБИС** - автоматическая подгрузка счетов, контрактов, услуг из ЕГРЮЛ
- **Уведомления** - автоматические напоминания о необходимости оплаты
- **Аналитика** - отчёты по расходам за год с разбивкой по услугам и месяцам

### Mobile App

- 📱 **Красивый современный дизайн** с градиентами и анимациями
- 👤 **Профиль пользователя** с возможностью редактирования данных
- ⚙️ **Настройки приложения** с управлением уведомлениями
- 🎯 **Быстрые действия** - карточки для быстрого доступа к функциям
- 📊 **Дашборд** с отображением баланса и последних транзакций
- 📈 **Аналитика** с графиками расходов
- 🔔 **Уведомления** с отметкой прочитанных
- 📜 **История транзакций** с фильтрацией
- 💼 **Управление услугами** и подписками

## 📁 Структура проекта

```
.
├── backend/          # Node.js/Express backend
│   ├── src/
│   │   ├── routes/   # API endpoints
│   │   ├── services/ # Бизнес-логика (СБИС, уведомления)
│   │   ├── jobs/     # Фоновые задачи (синхронизация, напоминания)
│   │   └── database/ # Инициализация БД
│   └── package.json
├── mobile/           # React Native мобильное приложение
│   ├── src/
│   │   ├── screens/  # Экраны приложения
│   │   ├── services/ # API клиент
│   │   └── context/  # Контекст аутентификации
│   └── package.json
└── README.md
```

## 🚀 Быстрый старт

### Backend

1. Перейдите в директорию backend:

```bash
cd backend
```

2. Установите зависимости:

```bash
npm install
```

3. Установите и настройте PostgreSQL (см. [POSTGRESQL_SETUP_GUIDE.md](POSTGRESQL_SETUP_GUIDE.md))

4. Создайте файл `.env` в директории `backend`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=billing_user
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
```

5. Запустите миграции (создание таблиц):

```bash
npm run migrate
```

6. Запустите сервер:

```bash
# Development
npm run dev

# Production
npm start
```

### Mobile App

1. Перейдите в директорию mobile:

```bash
cd mobile
```

2. Установите зависимости:

```bash
npm install
```

3. Запустите приложение:

```bash
npm start
```

4. Откройте в Expo Go или эмуляторе:

- Нажмите `i` для iOS симулятора
- Нажмите `a` для Android эмулятора
- Отсканируйте QR-код в приложении Expo Go

## 🔧 Настройка

### База данных

Проект использует PostgreSQL. Создайте базу данных и укажите параметры подключения в `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=your_password
```

Таблицы создаются автоматически при первом запуске.

### Интеграция со СБИС

1. Получите доступ к СБИС API
2. Укажите токен доступа в `.env`:

```env
SBIS_ACCESS_TOKEN=your_access_token
SBIS_API_URL=https://api.sbis.ru
```

3. Для каждого клиента укажите `sbis_contract_id` в базе данных

### Уведомления

#### Email

Настройте SMTP в `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
```

#### Telegram (опционально)

```env
TELEGRAM_BOT_TOKEN=your_bot_token
```

## 📱 API Endpoints

### Аутентификация

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход

### Клиенты

- `GET /api/clients/me` - Информация о текущем клиенте
- `PUT /api/clients/me` - Обновление информации
- `GET /api/clients/balance` - Получить баланс

### Платежи

- `GET /api/payments/history` - История транзакций
- `GET /api/payments/:id` - Детали транзакции

### Услуги

- `GET /api/services/my-services` - Услуги клиента
- `GET /api/services/available` - Доступные услуги

### Аналитика

- `GET /api/analytics/current-year` - Аналитика за текущий год
- `GET /api/analytics/yearly/:year` - Аналитика за указанный год

### СБИС

- `POST /api/sbis/sync` - Синхронизация данных со СБИС
- `GET /api/sbis/sync-logs` - Логи синхронизации

### Уведомления

- `GET /api/notifications` - Список уведомлений
- `PUT /api/notifications/:id/read` - Отметить как прочитанное
- `PUT /api/notifications/read-all` - Отметить все как прочитанные

## ⚙️ Автоматические задачи

- **Синхронизация со СБИС**: каждый день в 2:00
- **Проверка неоплаченных счетов**: каждый день в 10:00
- **Проверка низкого баланса**: каждый день в 9:00

## 🗄️ Модель данных

### Основные таблицы:

- `clients` - Клиенты
- `services` - Услуги
- `client_services` - Связь клиент-услуга
- `transactions` - Транзакции (начисления и платежи)
- `sbis_sync_log` - Логи синхронизации со СБИС
- `notifications` - Уведомления

## 🔐 Безопасность

- JWT токены для аутентификации
- Хеширование паролей (bcrypt)
- Валидация входных данных
- CORS настройки

## 📝 Примечания

- API СБИС может требовать дополнительной настройки в зависимости от вашего тарифного плана
- Маппинг услуг СБИС на внутренние коды настраивается в `backend/src/services/sbisService.js`
- Для production рекомендуется использовать HTTPS и настроить rate limiting

## 🛠️ Технологии

**Backend:**

- Node.js + Express
- PostgreSQL
- JWT для аутентификации
- node-cron для фоновых задач
- axios для HTTP запросов

**Mobile:**

- React Native + Expo
- React Navigation
- Axios для API запросов
- AsyncStorage для хранения токенов
- react-native-chart-kit для графиков

## 📄 Лицензия

ISC
