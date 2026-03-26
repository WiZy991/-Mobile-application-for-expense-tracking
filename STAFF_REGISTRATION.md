# 👥 Регистрация сотрудников (Поддержка и Менеджеры)

## Быстрый старт

### 1. Настройте секретный ключ

**Что такое секретный ключ?**
Это пароль, который вы сами придумываете для защиты регистрации сотрудников. Без него никто не сможет создать аккаунт.

**Где его взять?**
Вы сами придумываете! Например: `MySuperSecretKey2024!` или `SupportRegistration123`

**Куда добавить?**

1. Откройте файл `backend/.env` (если его нет, создайте на основе `env.template`)
2. Добавьте строку:
   ```env
   STAFF_REGISTRATION_KEY=ваш_секретный_ключ_здесь
   ```
3. Сохраните файл
4. Перезапустите сервер

**Пример:**
```env
STAFF_REGISTRATION_KEY=MySuperSecretKey2024!
```

📖 **Подробная инструкция:** См. `backend/SECRET_KEY_SETUP.md`

### 2. Откройте страницу регистрации

После запуска сервера откройте в браузере:

```
http://localhost:3000/staff-register.html
```

### 3. Заполните форму

- **Имя и фамилия** - полное имя сотрудника
- **Email** - email для входа
- **Пароль** - минимум 6 символов
- **Роль** - выберите "Поддержка" или "Менеджер"
- **Секретный ключ** - тот же ключ, что в `.env` файле

### 4. Нажмите "Зарегистрировать"

После успешной регистрации вы увидите данные созданного аккаунта.

## API Регистрация

Вы также можете регистрировать сотрудников через API:

```bash
POST http://localhost:3000/api/staff/register
Content-Type: application/json

{
  "name": "Иван Иванов",
  "email": "support@worldcashbox.ru",
  "password": "Support123!",
  "role": "support",
  "secretKey": "ваш_секретный_ключ"
}
```

### Ответ при успехе:

```json
{
  "success": true,
  "message": "Аккаунт успешно создан",
  "staff": {
    "id": 1,
    "email": "support@worldcashbox.ru",
    "name": "Иван Иванов",
    "role": "support"
  }
}
```

## Вход в систему

После регистрации сотрудник может войти:

```bash
POST http://localhost:3000/api/staff/auth
Content-Type: application/json

{
  "email": "support@worldcashbox.ru",
  "password": "Support123!"
}
```

### Ответ:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "staff": {
    "id": 1,
    "name": "Иван Иванов",
    "email": "support@worldcashbox.ru",
    "role": "support"
  }
}
```

## Роли

- **support** - Сотрудник поддержки
  - Может просматривать и отвечать на тикеты поддержки
  - Доступ: `/api/staff/support/tickets`

- **manager** - Менеджер продаж
  - Может просматривать и обрабатывать заказы
  - Доступ: `/api/staff/manager/orders`

## Безопасность

1. **Секретный ключ** - обязателен для регистрации новых сотрудников
2. **Пароль** - минимум 6 символов, хранится в зашифрованном виде
3. **JWT токен** - выдается на 7 дней при авторизации
4. **Проверка ролей** - каждый endpoint проверяет роль сотрудника

## Примеры использования

### Создать аккаунт поддержки через curl:

```bash
curl -X POST http://localhost:3000/api/staff/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Иван Иванов",
    "email": "support@example.com",
    "password": "Support123!",
    "role": "support",
    "secretKey": "ваш_секретный_ключ"
  }'
```

### Создать аккаунт менеджера:

```bash
curl -X POST http://localhost:3000/api/staff/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Петр Петров",
    "email": "manager@example.com",
    "password": "Manager123!",
    "role": "manager",
    "secretKey": "ваш_секретный_ключ"
  }'
```

## Устранение проблем

### Ошибка: "Неверный секретный ключ"
- Проверьте, что `STAFF_REGISTRATION_KEY` в `.env` совпадает с ключом в запросе
- Убедитесь, что сервер перезапущен после изменения `.env`

### Ошибка: "Аккаунт с таким email уже существует"
- Email должен быть уникальным
- Используйте другой email или удалите существующий аккаунт из БД

### Страница регистрации не открывается
- Убедитесь, что сервер запущен
- Проверьте, что файл `backend/public/staff-register.html` существует
- Проверьте URL: `http://localhost:3000/staff-register.html`
