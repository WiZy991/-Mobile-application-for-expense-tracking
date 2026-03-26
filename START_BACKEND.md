# 🚀 Как запустить бэкенд для Android приложения

## Проблема
Android приложение пытается подключиться к `http://10.0.2.2:3000/api/`, но бэкенд не запущен.

## Решение

### Шаг 1: Перейдите в папку бэкенда

```bash
cd backend-kotlin
```

### Шаг 2: Создайте файл .env

```bash
# Windows PowerShell
Copy-Item env.template .env

# Linux/Mac
cp env.template .env
```

### Шаг 3: Отредактируйте .env файл

Откройте `.env` и укажите:
- `DB_PASSWORD` - пароль от вашей PostgreSQL базы данных
- `JWT_SECRET` - любой случайный секретный ключ (например: `MySecretKey123!`)

**Минимальная конфигурация:**
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=ваш_пароль_от_postgresql
JWT_SECRET=MySecretKey123!
```

### Шаг 4: Убедитесь, что PostgreSQL запущен

Проверьте, что PostgreSQL работает и база данных `billing_db` существует.

### Шаг 5: Запустите бэкенд

```bash
# Windows
.\gradlew.bat run

# Linux/Mac
./gradlew run
```

Сервер должен запуститься на `http://localhost:3000`

### Шаг 6: Проверьте работу

Откройте в браузере:
```
http://localhost:3000/health
```

Должен вернуться JSON: `{"status":"ok"}`

## ⚠️ Важно для Android эмулятора

- `10.0.2.2` - это специальный IP-адрес Android эмулятора, который указывает на `localhost` вашего компьютера
- Если используете реальное устройство, нужно указать IP-адрес вашего компьютера в настройках приложения

## 🔧 Если бэкенд не запускается

1. **Проверьте, что PostgreSQL запущен:**
   ```bash
   # Windows
   services.msc  # Найдите PostgreSQL в списке служб
   
   # Linux
   sudo systemctl status postgresql
   ```

2. **Проверьте подключение к БД:**
   ```bash
   psql -h localhost -U postgres -d billing_db
   ```

3. **Проверьте логи бэкенда** - там будет указана точная ошибка

## 📱 Настройка URL в Android приложении

Если бэкенд запущен на другом порту или IP:
1. Откройте приложение
2. Перейдите в Настройки
3. Укажите правильный URL (например: `http://10.0.2.2:3000/api/`)
