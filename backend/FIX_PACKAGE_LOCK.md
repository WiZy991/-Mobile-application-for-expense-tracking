# 🔧 Исправление ошибки: package-lock.json не синхронизирован

## Проблема

Ошибка: `Missing: mysql2@3.20.0 from lock file`

Это происходит потому, что мы добавили `mysql2` в `package.json`, но не обновили `package-lock.json`.

## Решение

### Вариант 1: Обновить package-lock.json на сервере (РЕКОМЕНДУЕТСЯ)

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# Обновите package-lock.json
npm install

# Проверьте, что mysql2 добавлен
grep mysql2 package-lock.json

# Теперь пересоберите образ
docker-compose -f docker-compose.prod.yml build --no-cache backend
```

### Вариант 2: Использовать npm install вместо npm ci в Dockerfile

Если не хотите обновлять package-lock.json, можно временно изменить Dockerfile:

```dockerfile
# Вместо:
RUN npm ci --only=production

# Используйте:
RUN npm install --only=production
```

Но это не рекомендуется для продакшн, так как `npm ci` более надежен.

### Вариант 3: Обновить package-lock.json локально и закоммитить

Если у вас есть доступ к локальной машине:

```bash
cd backend
npm install
git add package-lock.json
git commit -m "Add mysql2 dependency"
git push
```

Затем на сервере:
```bash
git pull
docker-compose -f docker-compose.prod.yml build --no-cache backend
```

## Быстрое решение на сервере

```bash
cd /root/-Mobile-application-for-expense-tracking/backend

# 1. Обновите package-lock.json
npm install

# 2. Пересоберите образ
docker-compose -f docker-compose.prod.yml build --no-cache backend

# 3. Запустите
docker-compose -f docker-compose.prod.yml up -d backend nginx

# 4. Проверьте логи
docker-compose -f docker-compose.prod.yml logs backend --tail 50
```

## Проверка

После обновления package-lock.json:

```bash
# Проверьте, что mysql2 есть в lock файле
grep -A 5 '"mysql2"' package-lock.json

# Проверьте синтаксис package.json
npm list --depth=0 2>&1 | head -20
```

---

**После обновления package-lock.json сборка должна пройти успешно!**
