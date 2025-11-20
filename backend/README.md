# Backend для системы биллинга

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Настройте базу данных PostgreSQL и создайте файл `.env` на основе `.env.example`

3. Запустите миграции (создание таблиц):
```bash
npm run migrate
```

4. Запустите сервер:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

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

## Интеграция со СБИС

Для работы интеграции необходимо:
1. Получить доступ к СБИС API
2. Настроить `SBIS_ACCESS_TOKEN` в `.env`
3. Указать `sbis_contract_id` для клиентов

## Автоматические задачи

- Синхронизация со СБИС: каждый день в 2:00
- Проверка неоплаченных счетов: каждый день в 10:00
- Проверка низкого баланса: каждый день в 9:00

