# 🔧 Решение проблем при деплое

## Проблема: Не удается подключиться к серверу

### Ошибка: `Failed to connect to 155.212.132.213 port 443`

**Причина:** Вы пытаетесь подключиться по HTTPS (порт 443), но сервер работает на HTTP (порт 3000).

**Решение:**

1. **Проверьте HTTP вместо HTTPS:**
```bash
# Попробуйте HTTP на порту 3000
curl http://155.212.132.213:3000/health

# Или если настроен Nginx на порту 80
curl http://155.212.132.213/health
```

2. **Проверьте, запущен ли сервер:**
```bash
# Проверьте процессы
ps aux | grep node
# или
pm2 list

# Проверьте, слушает ли порт 3000
netstat -tulpn | grep 3000
# или
ss -tulpn | grep 3000
```

3. **Проверьте логи:**
```bash
# Если используете PM2
pm2 logs billing-backend

# Если используете Docker
docker-compose logs -f backend

# Если запускаете напрямую
# проверьте вывод в терминале, где запущен сервер
```

---

## Проверка статуса сервера

### Шаг 1: Проверьте, запущен ли процесс

```bash
# Проверка PM2
pm2 list

# Проверка процессов Node.js
ps aux | grep "node.*server.js"

# Проверка Docker контейнеров
docker ps
```

### Шаг 2: Проверьте порты

```bash
# Какие порты слушаются
netstat -tulpn | grep LISTEN

# Или
ss -tulpn | grep LISTEN
```

### Шаг 3: Проверьте firewall

```bash
# Проверьте статус firewall
ufw status
# или
iptables -L -n

# Откройте порт 3000 (если нужно)
ufw allow 3000/tcp
ufw allow 80/tcp
ufw allow 443/tcp
```

---

## Настройка HTTPS (SSL)

Если нужно использовать HTTPS, настройте Nginx с SSL:

### Вариант 1: Let's Encrypt (бесплатный SSL)

```bash
# Установите certbot
apt-get update
apt-get install certbot python3-certbot-nginx

# Получите сертификат
certbot --nginx -d your-domain.com

# Автоматическое обновление
certbot renew --dry-run
```

### Вариант 2: Nginx reverse proxy

1. **Установите Nginx:**
```bash
apt-get install nginx
```

2. **Создайте конфигурацию:**
```bash
nano /etc/nginx/sites-available/billing-backend
```

3. **Содержимое конфигурации:**
```nginx
server {
    listen 80;
    server_name 155.212.132.213;  # или ваш домен

    location / {
        proxy_pass http://localhost:3000;
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

4. **Активируйте конфигурацию:**
```bash
ln -s /etc/nginx/sites-available/billing-backend /etc/nginx/sites-enabled/
nginx -t  # проверка конфигурации
systemctl restart nginx
```

Теперь сервер будет доступен на порту 80 (HTTP).

---

## Быстрая диагностика

### Проверка 1: Сервер запущен?

```bash
curl http://localhost:3000/health
# Должен вернуться: {"status":"ok",...}
```

### Проверка 2: Порт открыт извне?

```bash
# С другого компьютера или используя внешний IP
curl http://155.212.132.213:3000/health
```

### Проверка 3: Firewall блокирует?

```bash
# Временно отключите firewall для теста
ufw disable
# Проверьте подключение
# Затем включите обратно и откройте нужные порты
ufw enable
ufw allow 3000/tcp
```

---

## Типичные проблемы

### Проблема: "Connection refused"

**Причины:**
- Сервер не запущен
- Сервер слушает только localhost (127.0.0.1), а не 0.0.0.0
- Firewall блокирует порт

**Решение:**
```bash
# Убедитесь, что сервер слушает на 0.0.0.0
# В server.js должно быть:
app.listen(PORT, '0.0.0.0', ...)

# Проверьте firewall
ufw allow 3000/tcp
```

### Проблема: "Connection timed out"

**Причины:**
- Firewall блокирует порт
- Провайдер блокирует порт
- Сервер не запущен

**Решение:**
```bash
# Проверьте firewall
ufw status
iptables -L -n

# Проверьте, что сервер запущен
pm2 list
# или
docker ps
```

### Проблема: "502 Bad Gateway" (при использовании Nginx)

**Причины:**
- Backend не запущен
- Неправильная конфигурация Nginx

**Решение:**
```bash
# Проверьте, что backend запущен
curl http://localhost:3000/health

# Проверьте логи Nginx
tail -f /var/log/nginx/error.log

# Проверьте конфигурацию Nginx
nginx -t
```

---

## Команды для быстрой проверки

```bash
# 1. Проверка статуса PM2
pm2 status

# 2. Проверка логов
pm2 logs billing-backend --lines 50

# 3. Проверка портов
netstat -tulpn | grep 3000

# 4. Проверка health endpoint локально
curl http://localhost:3000/health

# 5. Проверка health endpoint извне
curl http://155.212.132.213:3000/health

# 6. Проверка процессов Node.js
ps aux | grep node

# 7. Перезапуск PM2
pm2 restart billing-backend

# 8. Проверка переменных окружения
pm2 env billing-backend
```

---

## Настройка для продакшн

### 1. Используйте Nginx как reverse proxy

Это позволит:
- Использовать стандартные порты (80/443)
- Настроить SSL
- Улучшить безопасность

### 2. Настройте SSL сертификат

Используйте Let's Encrypt для бесплатного SSL.

### 3. Настройте firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 4. Используйте PM2 для автозапуска

```bash
pm2 startup
pm2 save
```

---

**Если проблема не решена, проверьте логи и убедитесь, что все сервисы запущены!**
