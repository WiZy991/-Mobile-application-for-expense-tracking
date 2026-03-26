# 🔧 Исправление: Контейнер не читает обновленный .env

## Проблема

В `.env` указан правильный `DB_HOST=niwobubofad.beget.app`, но контейнер все еще видит `localhost`.

Это происходит потому, что Docker контейнеры не перечитывают `.env` файл при простом перезапуске - нужно пересоздать контейнер.

## Решение

### Шаг 1: Остановите и удалите контейнер

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Остановите и удалите контейнер backend
docker-compose -f docker-compose.prod.yml stop backend
docker-compose -f docker-compose.prod.yml rm -f backend
```

### Шаг 2: Проверьте .env файл

```bash
# Убедитесь, что .env правильный
cat .env | grep -E "DB_HOST|DB_CONNECTION|DB_DATABASE|DB_USERNAME"
```

Должно быть:
```
DB_CONNECTION=mysql
DB_HOST=niwobubofad.beget.app
DB_DATABASE=wcb-service
DB_USERNAME=wcb-service
```

### Шаг 3: Пересоздайте контейнер

```bash
# Создайте контейнер заново (он прочитает обновленный .env)
docker-compose -f docker-compose.prod.yml up -d backend

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs backend --tail 30
```

### Шаг 4: Проверьте результат

В логах должно быть:
```
🔌 MySQL connection config:
   Host: niwobubofad.beget.app  ← должно быть так!
   Port: 3306
   Database: wcb-service
   User: wcb-service
```

## Альтернативный способ: Проверьте монтирование .env

Если проблема сохраняется, проверьте, правильно ли монтируется `.env`:

```bash
# Войдите в контейнер
docker exec -it billing-backend sh

# Проверьте, что .env файл есть и правильный
cat .env | grep DB_HOST

# Должно быть: DB_HOST=niwobubofad.beget.app

# Выйдите
exit
```

## Полное пересоздание (если ничего не помогает)

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Остановите все
docker-compose -f docker-compose.prod.yml down

# Убедитесь, что .env правильный
cat .env | grep DB_HOST

# Запустите заново
docker-compose -f docker-compose.prod.yml up -d backend nginx

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs backend --tail 50
```

---

**После пересоздания контейнера он должен прочитать обновленный .env файл!**
