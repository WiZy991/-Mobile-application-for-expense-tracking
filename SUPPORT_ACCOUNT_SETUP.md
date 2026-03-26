# 🔧 Настройка аккаунтов поддержки и менеджеров

## Создание аккаунта сотрудника поддержки

### Способ 1: Через скрипт (рекомендуется)

```bash
cd backend
node create-support-account.js support@worldcashbox.ru Support123! "Имя Фамилия"
```

### Способ 2: Через SQL

```sql
-- Подключитесь к базе данных billing_db
-- Замените значения на свои

INSERT INTO staff (email, name, password_hash, role, is_active)
VALUES (
  'support@worldcashbox.ru',  -- Email сотрудника
  'Имя Фамилия',               -- Имя сотрудника
  '$2a$10$...',                -- Хеш пароля (см. ниже как получить)
  'support',                   -- Роль: support или manager
  true                         -- Активен
);
```

### Получение хеша пароля

```javascript
// В Node.js консоли:
const bcrypt = require('bcryptjs');
bcrypt.hash('ВашПароль123!', 10).then(hash => console.log(hash));
```

## Создание аккаунта менеджера

```bash
cd backend
node create-manager-account.js manager@worldcashbox.ru Manager123! "Имя Фамилия"
```

## Вход в кабинет поддержки/менеджера

### API Endpoint

```
POST http://localhost:3000/api/staff/auth
Content-Type: application/json

{
  "email": "support@worldcashbox.ru",
  "password": "Support123!"
}
```

### Ответ

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "staff": {
    "id": 1,
    "name": "Имя Фамилия",
    "email": "support@worldcashbox.ru",
    "role": "support"
  }
}
```

## Просмотр тикетов поддержки

После авторизации используйте токен в заголовке:

```
Authorization: Bearer <ваш_токен>
```

### Получить все тикеты

```
GET http://localhost:3000/api/staff/support/tickets
Authorization: Bearer <токен>
```

### Получить тикеты, назначенные на вас

```
GET http://localhost:3000/api/staff/support/tickets?assigned_to=me
Authorization: Bearer <токен>
```

### Назначить тикет на себя

```
POST http://localhost:3000/api/staff/support/tickets/:id/assign
Authorization: Bearer <токен>
```

### Ответить на тикет

```
POST http://localhost:3000/api/staff/support/tickets/:id/messages
Authorization: Bearer <токен>
Content-Type: application/json

{
  "message": "Ваш ответ клиенту"
}
```

## Просмотр заказов (для менеджеров)

### Получить все заказы

```
GET http://localhost:3000/api/staff/manager/orders
Authorization: Bearer <токен>
```

### Назначить заказ на себя

```
POST http://localhost:3000/api/staff/manager/orders/:id/assign
Authorization: Bearer <токен>
```

## Быстрый старт

1. Создайте аккаунт поддержки:
   ```bash
   cd backend
   node create-support-account.js support@example.com password123 "Иван Иванов"
   ```

2. Авторизуйтесь и получите токен:
   ```bash
   curl -X POST http://localhost:3000/api/staff/auth \
     -H "Content-Type: application/json" \
     -d '{"email":"support@example.com","password":"password123"}'
   ```

3. Используйте токен для доступа к тикетам:
   ```bash
   curl -X GET http://localhost:3000/api/staff/support/tickets \
     -H "Authorization: Bearer <ваш_токен>"
   ```

## Примечания

- Минимальная длина пароля: 6 символов
- Email должен быть уникальным
- Роли: `support` (поддержка) или `manager` (менеджер)
- Аккаунты можно деактивировать через `is_active = false` в БД
