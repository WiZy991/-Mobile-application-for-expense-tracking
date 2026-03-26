# WorldCashBox Backend (Kotlin)

Backend сервер для системы биллинга и личного кабинета клиентов, написанный на Kotlin с использованием Ktor.

## 🚀 Быстрый старт

### Требования

- JDK 11 или выше
- PostgreSQL 12+
- Gradle 7.0+

### Установка

1. **Скопируйте переменные окружения:**

```bash
cp env.template .env
```

2. **Отредактируйте `.env` файл:**

```env
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=your_password_here

# JWT Configuration (ОБЯЗАТЕЛЬНО!)
JWT_SECRET=your_very_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# СБИС API (опционально)
SBIS_API_URL=https://api.sbis.ru
SBIS_CLIENT_ID=
SBIS_CLIENT_SECRET=
SBIS_ACCESS_TOKEN=
```

3. **Соберите проект:**

```bash
./gradlew build
```

4. **Запустите сервер:**

```bash
./gradlew run
```

Или через JAR:

```bash
./gradlew jar
java -jar build/libs/backend-kotlin-1.0.0.jar
```

## 📁 Структура проекта

```
backend-kotlin/
├── src/main/kotlin/com/worldcashbox/
│   ├── Application.kt              # Главный файл приложения
│   ├── database/
│   │   └── DatabaseFactory.kt     # Инициализация БД
│   ├── models/                     # Модели данных
│   ├── routes/                     # API роуты
│   ├── middleware/                 # Middleware (auth, etc.)
│   ├── services/                   # Бизнес-логика
│   ├── jobs/                       # Фоновые задачи
│   └── utils/                      # Утилиты
├── build.gradle.kts                # Конфигурация Gradle
└── README.md                       # Документация
```

## 🔧 API Endpoints

### Аутентификация

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `PUT /api/auth/change-password` - Изменение пароля (требует auth)

### Клиенты

- `GET /api/clients/me` - Информация о текущем клиенте
- `GET /api/clients/me/stats` - Статистика клиента

### Услуги

- `GET /api/services` - Каталог услуг
- `GET /api/services/my-services` - Мои услуги
- `POST /api/services/:id/subscribe` - Подключить услугу
- `POST /api/services/:id/cancel` - Отключить услугу

### Платежи

- `GET /api/payments/history` - История транзакций
- `GET /api/payments/:id` - Детали транзакции

### Health Check

- `GET /health` - Проверка состояния сервера

## 🔄 Миграция с Node.js

Этот проект является миграцией с Node.js/Express на Kotlin/Ktor. 

### Что уже перенесено:

✅ Базовая структура проекта
✅ Инициализация базы данных
✅ Аутентификация (JWT)
✅ Роуты: auth, clients
✅ Middleware для аутентификации
✅ Фоновые задачи (заглушки)

### Что нужно перенести:

⏳ Роуты: services, payments, analytics, sbis, notifications, support, etc.
⏳ Сервисы: sbisService, subscriptionService, notificationService
⏳ Фоновые задачи: полная реализация
⏳ Загрузка файлов (multer → Ktor multipart)

## 🛠️ Разработка

### Запуск в режиме разработки

```bash
./gradlew run
```

### Тестирование

```bash
./gradlew test
```

### Сборка JAR

```bash
./gradlew jar
```

## 📝 Примечания

- Проект использует HikariCP для пула соединений с БД
- JWT токены используют HMAC SHA-256
- Пароли хешируются с помощью BCrypt
- Фоновые задачи используют Quartz Scheduler

## 🔐 Безопасность

- Все пароли хешируются с помощью BCrypt
- JWT токены имеют срок действия
- CORS настроен для работы с мобильным приложением
- Валидация входных данных на всех endpoints

## 📚 Дополнительная информация

Для получения дополнительной информации см. документацию в папке проекта или обратитесь к разработчикам.
