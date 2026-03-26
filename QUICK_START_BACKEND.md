# ⚡ Быстрый запуск бэкенда

## Самый простой способ:

### 1. Откройте файл `backend-kotlin/START_SERVER.bat` двойным кликом

Или в терминале:
```powershell
cd backend-kotlin
.\START_SERVER.bat
```

### 2. Если появится ошибка о .env файле:

1. Откройте файл `backend-kotlin/.env` в текстовом редакторе
2. Убедитесь, что там указаны:
   ```env
   JWT_SECRET=MySecretKey123!
   DB_PASSWORD=ваш_пароль
   ```

### 3. Если бэкенд запустился успешно:

Вы увидите:
```
🚀 Server running on port 3000
📊 Environment: development
🌐 API доступен по адресу: http://localhost:3000/api/
💚 Health check: http://localhost:3000/health
```

### 4. Проверьте в браузере:

Откройте: **http://localhost:3000/health**

Должен вернуться: `{"status":"ok"}`

### 5. Теперь Android приложение должно работать!

---

## ⚠️ Если не работает:

### Проблема: "JWT_SECRET not set"
**Решение:** Откройте `backend-kotlin/.env` и добавьте строку:
```
JWT_SECRET=MySecretKey123!
```

### Проблема: "Database connection failed"
**Решение:** 
- Если используете PostgreSQL: убедитесь, что PostgreSQL установлен и запущен
- Или временно закомментируйте подключение к БД (не рекомендуется)

### Проблема: "Port 3000 already in use"
**Решение:** Измените в `.env`:
```
PORT=3001
```
И обновите URL в настройках Android приложения на `http://10.0.2.2:3001/api/`

---

## 📝 Ваша MySQL база данных

У вас есть MySQL база:
- Host: `10.16.0.1:3306`
- User: `wcb-service`
- Password: `Wcb12345@!`
- Database: `wcb-service`

**НО:** Сейчас код использует PostgreSQL. Чтобы использовать MySQL, нужно:
1. Изменить драйвер в `build.gradle.kts`
2. Изменить JDBC URL в `DatabaseFactory.kt`

**Для начала попробуйте запустить с PostgreSQL** (можно установить локально) или используйте демо-режим.
