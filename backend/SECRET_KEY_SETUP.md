# 🔑 Настройка секретного ключа для регистрации сотрудников

## Что такое секретный ключ?

Секретный ключ (`STAFF_REGISTRATION_KEY`) - это пароль, который защищает регистрацию новых сотрудников. Без этого ключа никто не сможет создать аккаунт поддержки или менеджера.

## Где взять ключ?

**Вы сами придумываете этот ключ!** Это может быть любая строка, например:
- `MySecretKey2024!`
- `SupportRegistrationPassword123`
- `WorldCashBoxStaff2024`

**Рекомендации:**
- Используйте сложный ключ (минимум 16 символов)
- Включите буквы, цифры и специальные символы
- Не используйте простые пароли типа `123456` или `password`

## Куда добавить ключ?

### Шаг 1: Найдите или создайте файл `.env`

В папке `backend` должен быть файл `.env`. Если его нет, создайте его.

### Шаг 2: Добавьте строку с ключом

Откройте файл `backend/.env` и добавьте (или измените) строку:

```env
STAFF_REGISTRATION_KEY=ваш_секретный_ключ_здесь
```

**Пример:**

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=your_password_here

# JWT
JWT_SECRET=your_very_secret_jwt_key_change_this_in_production

# Секретный ключ для регистрации сотрудников
STAFF_REGISTRATION_KEY=MySuperSecretKey2024!
```

### Шаг 3: Сохраните файл

Сохраните файл `.env` и перезапустите сервер.

## Быстрая настройка

### Вариант 1: Если файл `.env` уже существует

1. Откройте `backend/.env` в текстовом редакторе
2. Добавьте строку:
   ```
   STAFF_REGISTRATION_KEY=ваш_ключ_здесь
   ```
3. Сохраните файл
4. Перезапустите сервер

### Вариант 2: Если файла `.env` нет

1. Скопируйте файл `env.template` в `.env`:
   ```bash
   cd backend
   copy env.template .env
   ```
   
   Или создайте новый файл `.env` вручную

2. Откройте `.env` и добавьте все необходимые переменные (см. `env.template`)

3. Добавьте строку:
   ```
   STAFF_REGISTRATION_KEY=ваш_ключ_здесь
   ```

4. Сохраните файл

5. Перезапустите сервер

## Пример полного файла `.env`

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=your_password_here

# JWT Configuration
JWT_SECRET=your_very_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# Секретный ключ для регистрации сотрудников
STAFF_REGISTRATION_KEY=MySuperSecretKey2024!

# СБИС API (опционально)
SBIS_API_URL=https://api.sbis.ru
SBIS_CLIENT_ID=
SBIS_CLIENT_SECRET=
SBIS_ACCESS_TOKEN=
```

## Как использовать ключ

### При регистрации через веб-интерфейс:

1. Откройте `http://localhost:3000/staff-register.html`
2. Заполните форму
3. В поле "Секретный ключ" введите тот же ключ, что в `.env`

### При регистрации через API:

```bash
curl -X POST http://localhost:3000/api/staff/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Иван Иванов",
    "email": "support@example.com",
    "password": "Support123!",
    "role": "support",
    "secretKey": "MySuperSecretKey2024!"
  }'
```

## Генерация безопасного ключа

Если хотите сгенерировать случайный безопасный ключ:

**Windows PowerShell:**
```powershell
-join ((48..57) + (65..90) + (97..122) + (33..47) | Get-Random -Count 32 | % {[char]$_})
```

**Linux/Mac:**
```bash
openssl rand -base64 32
```

**Или просто придумайте свой:**
```
WorldCashBoxStaff2024!SecretKey
```

## Важно!

- ✅ Ключ должен быть одинаковым в `.env` и при регистрации
- ✅ Не делитесь этим ключом с посторонними
- ✅ В продакшене используйте сложный ключ
- ✅ После изменения `.env` перезапустите сервер

## Проверка

После настройки попробуйте зарегистрировать сотрудника. Если видите ошибку "Неверный секретный ключ", проверьте:
1. Ключ в `.env` совпадает с ключом в форме/API запросе
2. Сервер перезапущен после изменения `.env`
3. Нет лишних пробелов в ключе
