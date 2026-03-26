# 🔧 Исправление: Backend подключается к localhost вместо удаленного MySQL

## Проблема

В логах видно:
```
DB_HOST: localhost
```

Но должно быть:
```
DB_HOST: niwobubofad.beget.app
```

Backend работает внутри Docker контейнера, и `localhost` внутри контейнера - это сам контейнер, а не хост-машина или удаленный сервер.

## Решение

### Шаг 1: Проверьте .env файл

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Проверьте текущие настройки БД
cat .env | grep -E "DB_|DB_CONNECTION"
```

### Шаг 2: Исправьте .env файл

```bash
nano .env
```

Убедитесь, что указаны правильные данные для MySQL на Beget:

```env
# Обязательно укажите тип БД
DB_CONNECTION=mysql

# ВАЖНО: Используйте удаленный хост, а не localhost!
DB_HOST=niwobubofad.beget.app
DB_PORT=3306
DB_DATABASE=wcb-service
DB_USERNAME=wcb-service
DB_PASSWORD=ваш_реальный_пароль_от_beget
```

**Критично:** `DB_HOST` должен быть `niwobubofad.beget.app`, а НЕ `localhost`!

### Шаг 3: Перезапустите backend

```bash
# Остановите backend
docker-compose -f docker-compose.prod.yml stop backend

# Запустите заново (он прочитает обновленный .env)
docker-compose -f docker-compose.prod.yml up -d backend

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs backend --tail 50
```

### Шаг 4: Проверьте результат

В логах должно быть:
```
🔌 MySQL connection config:
   Host: niwobubofad.beget.app
   Port: 3306
   Database: wcb-service
   User: wcb-service
   Password: ***
✅ MySQL database connection established!
```

## Если все еще не работает

### Проверка 1: Доступность MySQL хоста из контейнера

```bash
# Войдите в контейнер
docker exec -it billing-backend sh

# Проверьте доступность хоста
ping niwobubofad.beget.app

# Или проверьте порт
nc -zv niwobubofad.beget.app 3306

# Выйдите
exit
```

### Проверка 2: Whitelist IP на Beget

Если получаете ошибку `ER_HOST_NOT_PRIVILEGED`, нужно добавить IP вашего сервера в whitelist MySQL на Beget:

1. Зайдите в панель управления Beget
2. Найдите настройки MySQL
3. Добавьте IP адрес вашего сервера: `155.212.132.213`

### Проверка 3: Правильность учетных данных

Убедитесь, что в `.env` указаны правильные:
- `DB_DATABASE` - имя базы данных
- `DB_USERNAME` - имя пользователя
- `DB_PASSWORD` - пароль

## Быстрое исправление

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Отредактируйте .env
nano .env

# Найдите строку:
# DB_HOST=localhost

# Замените на:
# DB_HOST=niwobubofad.beget.app

# Сохраните (Ctrl+O, Enter, Ctrl+X)

# Перезапустите backend
docker-compose -f docker-compose.prod.yml restart backend

# Проверьте логи
docker-compose -f docker-compose.prod.yml logs backend --tail 30
```

---

**После исправления DB_HOST backend должен подключиться к MySQL на Beget!**
