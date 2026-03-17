# 🔧 Исправление ошибки YAML в docker-compose.prod.yml

## Проблема

Ошибка: `yaml: while parsing a block mapping at line 4, column 5: line 17, column 5: did not find expected key`

Это происходит из-за неправильного отступа в секции `volumes`.

## Решение

### Шаг 1: Остановите все контейнеры

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Остановите все контейнеры
docker-compose -f docker-compose.prod.yml down

# Или если они запущены из другого файла
docker stop billing-backend billing-nginx billing-postgres
docker rm billing-backend billing-nginx billing-postgres
```

### Шаг 2: Проверьте файл docker-compose.prod.yml

Убедитесь, что в секции `volumes` правильные отступы:

```yaml
volumes:
  # Монтируем папку с загрузками
  - ./uploads:/app/uploads
  # Монтируем .env файл
  - ./.env:/app/.env:ro
```

**Важно:** Оба элемента списка `volumes` должны иметь одинаковый отступ (2 пробела после `volumes:`).

### Шаг 3: Проверьте синтаксис YAML

```bash
# Проверьте синтаксис (если установлен yamllint)
yamllint docker-compose.prod.yml

# Или просто попробуйте распарсить
docker-compose -f docker-compose.prod.yml config
```

Если команда `docker-compose config` выполняется без ошибок, значит синтаксис правильный.

### Шаг 4: Пересоберите и запустите

```bash
# Пересоберите backend (чтобы установить mysql2)
docker-compose -f docker-compose.prod.yml build --no-cache backend

# Запустите только backend и nginx (БЕЗ postgres)
docker-compose -f docker-compose.prod.yml up -d backend nginx

# Проверьте статус
docker-compose -f docker-compose.prod.yml ps
```

### Шаг 5: Проверьте логи

```bash
# Проверьте логи backend
docker-compose -f docker-compose.prod.yml logs backend --tail 50

# Если все хорошо, проверьте health endpoint
curl http://localhost:3000/health
```

## Если ошибка сохраняется

1. **Проверьте отступы:** В YAML важны правильные отступы (используйте пробелы, не табы)
2. **Проверьте кавычки:** Убедитесь, что все строки правильно заключены в кавычки
3. **Проверьте структуру:** Каждый уровень вложенности должен иметь правильный отступ

## Быстрое исправление

Если файл уже исправлен в репозитории, просто обновите его на сервере:

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Обновите файл из репозитория (если используете git)
git pull

# Или отредактируйте вручную
nano docker-compose.prod.yml
```

Исправьте секцию volumes (строки 14-18):

```yaml
    volumes:
      - ./uploads:/app/uploads
      - ./.env:/app/.env:ro
```

---

**После исправления YAML ошибки, backend должен запуститься!**
