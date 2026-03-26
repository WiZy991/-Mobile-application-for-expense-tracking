# 🚀 Быстрый старт - Kotlin Backend

## Шаг 1: Настройка окружения

```bash
cd backend-kotlin
cp env.template .env
```

Отредактируйте `.env` файл и укажите:
- `DB_PASSWORD` - пароль от PostgreSQL
- `JWT_SECRET` - секретный ключ для JWT (можно сгенерировать: `openssl rand -hex 32`)

## Шаг 2: Убедитесь, что PostgreSQL запущен

```bash
# Проверьте, что база данных доступна
psql -h localhost -U postgres -d billing_db
```

## Шаг 3: Соберите проект

```bash
./gradlew build
```

## Шаг 4: Запустите сервер

```bash
./gradlew run
```

Сервер запустится на `http://localhost:3000`

## Проверка работы

Откройте в браузере или через curl:

```bash
curl http://localhost:3000/health
```

Должен вернуться JSON с `"status": "ok"`

## Тестирование API

### Регистрация

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

### Вход

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## ⚠️ Важно

- Убедитесь, что база данных `billing_db` существует
- Все таблицы создадутся автоматически при первом запуске
- Старый Node.js backend можно оставить запущенным на другом порту для сравнения

## 📝 Следующие шаги

После успешного запуска можно:
1. Протестировать все endpoints
2. Продолжить миграцию остальных роутов
3. Обновить Android приложение для работы с новым backend (если нужно)
