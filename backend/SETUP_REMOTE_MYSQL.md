# 🐬 Настройка для удаленной MySQL (Beget)

## ✅ Правильная конфигурация для удаленной MySQL

Если вы используете удаленную MySQL на Beget, вам **НЕ нужен** локальный PostgreSQL в Docker.

## Что нужно сделать

### 1. Обновите docker-compose.prod.yml

В файле `docker-compose.prod.yml`:
- ✅ Сервис `postgres` закомментирован
- ✅ `depends_on: postgres` убран из backend
- ✅ Backend подключается к удаленной MySQL через `.env`

### 2. Настройте .env файл

```bash
cd /root/-Mobile-application-for-expense-tracking/backend
nano .env
```

Убедитесь, что указаны правильные данные для MySQL на Beget:

```env
# Обязательно укажите тип БД
DB_CONNECTION=mysql

# Данные для MySQL на Beget
DB_HOST=niwobubofad.beget.app
DB_PORT=3306
DB_DATABASE=wcb-service
DB_USERNAME=wcb-service
DB_PASSWORD=ваш_реальный_пароль

# Остальные настройки
PORT=3000
NODE_ENV=production
JWT_SECRET=ваш_секретный_ключ
```

### 3. Добавьте mysql2 в package.json

```bash
nano package.json
```

Добавьте в `dependencies`:
```json
"mysql2": "^3.6.5",
```

### 4. Пересоберите и запустите

```bash
# Остановите все контейнеры
docker-compose -f docker-compose.prod.yml down

# Пересоберите backend (чтобы установить mysql2)
docker-compose -f docker-compose.prod.yml build --no-cache backend

# Запустите только backend и nginx (без postgres)
docker-compose -f docker-compose.prod.yml up -d backend nginx

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs -f backend
```

## Проверка

```bash
# 1. Проверьте, что запущены только нужные контейнеры
docker ps
# Должны быть: billing-backend, billing-nginx
# НЕ должно быть: billing-postgres

# 2. Проверьте health endpoint
curl http://localhost:3000/health

# 3. Проверьте через Nginx
curl http://localhost/health
curl http://155.212.132.213/health
```

## Важно!

- ✅ **НЕ запускайте** `docker-compose up -d` без указания сервисов - это запустит postgres
- ✅ Используйте: `docker-compose up -d backend nginx`
- ✅ Или закомментируйте postgres в docker-compose.prod.yml (уже сделано)

## Если нужно подключиться к MySQL на Beget из контейнера

Backend в Docker должен иметь доступ к внешнему интернету для подключения к `niwobubofad.beget.app`. 

Проверьте:
```bash
# Войдите в контейнер
docker exec -it billing-backend sh

# Проверьте доступность MySQL хоста
ping niwobubofad.beget.app

# Или проверьте подключение
nc -zv niwobubofad.beget.app 3306

# Выйдите
exit
```

## Устранение проблем

### Ошибка: "ER_HOST_NOT_PRIVILEGED"

Это означает, что IP адрес вашего сервера не добавлен в whitelist MySQL на Beget.

**Решение:**
1. Зайдите в панель управления Beget
2. Найдите настройки MySQL
3. Добавьте IP адрес вашего сервера (155.212.132.213) в whitelist

### Ошибка: "Cannot find module 'mysql2'"

**Решение:**
```bash
# Пересоберите образ
docker-compose -f docker-compose.prod.yml build --no-cache backend
```

---

**Готово! Теперь backend будет подключаться к удаленной MySQL на Beget! 🚀**
