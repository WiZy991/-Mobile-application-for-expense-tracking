# 🔧 Решение ошибки 502 Bad Gateway

## Проблема

Ошибка `502 Bad Gateway` означает, что Nginx работает, но не может подключиться к backend серверу.

## Диагностика

### Шаг 1: Проверьте, запущен ли backend

```bash
# Проверьте Docker контейнеры
docker ps

# Должны быть запущены:
# - billing-backend
# - billing-nginx
# - billing-postgres (если используете)

# Проверьте логи backend
docker logs billing-backend

# Или если используете docker-compose
docker-compose logs backend
```

### Шаг 2: Проверьте, доступен ли backend локально

```bash
# Проверьте health endpoint напрямую
curl http://localhost:3000/health

# Если не работает, проверьте процессы
ps aux | grep node
# или
pm2 list
```

### Шаг 3: Проверьте конфигурацию Nginx

Проблема может быть в том, что Nginx пытается подключиться к `backend:3000` (имя сервиса в Docker), но если Nginx запущен вне Docker, он не может разрешить это имя.

## Решения

### Решение 1: Если используете Docker Compose

Убедитесь, что оба сервиса (backend и nginx) запущены в одной сети:

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Проверьте статус
docker-compose -f docker-compose.prod.yml ps

# Если backend не запущен, запустите все сервисы
docker-compose -f docker-compose.prod.yml up -d

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs nginx
```

### Решение 2: Если Nginx запущен вне Docker, а backend в Docker

Измените конфигурацию Nginx, чтобы он подключался к `localhost:3000`:

1. **Отредактируйте конфигурацию Nginx:**

```bash
nano /etc/nginx/sites-available/billing-backend
# или если используете docker-compose
nano /root/-Mobile-application-for-expense-tracking/backend/nginx.conf
```

2. **Измените `proxy_pass` на `localhost:3000`:**

```nginx
server {
    listen 80;
    server_name 155.212.132.213;

    location / {
        proxy_pass http://localhost:3000;  # Измените с backend:3000 на localhost:3000
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **Перезапустите Nginx:**

```bash
# Если системный Nginx
nginx -t  # проверка конфигурации
systemctl restart nginx

# Если Nginx в Docker
docker restart billing-nginx
```

### Решение 3: Если backend не запущен

Запустите backend:

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# С Docker
docker-compose -f docker-compose.prod.yml up -d backend

# Или с PM2
pm2 start src/server.js --name billing-backend
pm2 save
```

### Решение 4: Проверьте сеть Docker

Если оба сервиса в Docker, убедитесь, что они в одной сети:

```bash
# Проверьте сети
docker network ls

# Проверьте, подключены ли контейнеры к одной сети
docker inspect billing-backend | grep NetworkMode
docker inspect billing-nginx | grep NetworkMode
```

## Быстрая проверка

Выполните эти команды по порядку:

```bash
# 1. Проверьте, запущен ли backend
curl http://localhost:3000/health

# 2. Если не работает, проверьте Docker
docker ps | grep backend

# 3. Проверьте логи backend
docker logs billing-backend --tail 50

# 4. Проверьте конфигурацию Nginx
docker exec billing-nginx cat /etc/nginx/nginx.conf | grep proxy_pass

# 5. Проверьте логи Nginx
docker logs billing-nginx --tail 50
```

## Типичные причины 502

1. **Backend не запущен** - самая частая причина
2. **Неправильный адрес в proxy_pass** - должен быть `localhost:3000` или `backend:3000` (если в Docker сети)
3. **Backend не слушает на 0.0.0.0** - должен слушать на всех интерфейсах
4. **Firewall блокирует** - но это редко, так как это локальное подключение
5. **Backend падает при старте** - проверьте логи на ошибки БД или другие проблемы

## Проверка конфигурации

### Если используете docker-compose.prod.yml

Убедитесь, что в `nginx.conf` используется правильное имя сервиса:

```nginx
upstream backend {
    server backend:3000;  # Имя сервиса из docker-compose.prod.yml
}
```

Или если Nginx вне Docker:

```nginx
upstream backend {
    server localhost:3000;  # localhost, если backend на хосте
}
```

## Полное решение (пошагово)

```bash
# 1. Остановите все
docker-compose -f docker-compose.prod.yml down

# 2. Проверьте .env файл
cat .env | grep -E "PORT|DB_"

# 3. Запустите backend отдельно для проверки
docker-compose -f docker-compose.prod.yml up -d backend postgres

# 4. Подождите 10 секунд и проверьте
sleep 10
curl http://localhost:3000/health

# 5. Если работает, запустите Nginx
docker-compose -f docker-compose.prod.yml up -d nginx

# 6. Проверьте через Nginx
curl http://localhost/health
```

## Если ничего не помогает

1. **Проверьте логи всех сервисов:**
```bash
docker-compose -f docker-compose.prod.yml logs
```

2. **Пересоздайте контейнеры:**
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

3. **Проверьте, что порт 3000 не занят другим процессом:**
```bash
netstat -tulpn | grep 3000
```

---

**Начните с проверки, запущен ли backend и доступен ли он на localhost:3000!**
