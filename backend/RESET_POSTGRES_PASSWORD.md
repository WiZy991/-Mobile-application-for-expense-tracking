# Сброс пароля PostgreSQL на Windows

## Способ 1: Изменение метода аутентификации (самый простой)

### Шаг 1: Найдите файл pg_hba.conf

Обычно находится в:

- `C:\Program Files\PostgreSQL\15\data\pg_hba.conf`
- `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`

Или найдите через поиск Windows: `pg_hba.conf`

### Шаг 2: Откройте файл как администратор

1. Правой кнопкой мыши на `pg_hba.conf`
2. Открыть с помощью → Блокнот (как администратор)

### Шаг 3: Измените метод аутентификации

Найдите строки с `METHOD` в конце (обычно в конце файла):

**Было:**

```
# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
# IPv6 local connections:
host    all             all             ::1/128                 scram-sha-256
```

**Измените на:**

```
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
# IPv6 local connections:
host    all             all             ::1/128                 trust
```

Сохраните файл (Ctrl+S)

### Шаг 4: Перезапустите службу PostgreSQL

Откройте PowerShell **как администратор**:

```powershell
# Остановить службу
Stop-Service postgresql-x64-16

# Запустить службу
Start-Service postgresql-x64-16
```

_Примечание: Замените `postgresql-x64-16` на вашу версию, если другая_

### Шаг 5: Подключитесь БЕЗ пароля и измените его

Откройте SQL Shell (psql) и нажимайте Enter для всех вопросов (включая пароль):

```
Server [localhost]: [Enter]
Database [postgres]: [Enter]
Port [5432]: [Enter]
Username [postgres]: [Enter]
Password for user postgres: [Enter - просто нажмите Enter!]
```

Теперь вы подключены! Установите новый пароль:

```sql
ALTER USER postgres PASSWORD 'новый_пароль_123';
```

### Шаг 6: Верните обратно безопасную аутентификацию

1. Откройте `pg_hba.conf` снова
2. Верните `trust` обратно на `scram-sha-256`:

```
# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
# IPv6 local connections:
host    all             all             ::1/128                 scram-sha-256
```

3. Сохраните файл
4. Перезапустите службу PostgreSQL:

```powershell
Restart-Service postgresql-x64-16
```

### Шаг 7: Проверьте новый пароль

Откройте SQL Shell и введите новый пароль.

---

## Способ 2: Использовать Docker (быстрая альтернатива)

Если не хотите возиться с паролем, используйте Docker:

```powershell
# Остановить локальный PostgreSQL (если запущен)
Stop-Service postgresql-x64-16

# Запустить PostgreSQL в Docker
docker run --name billing-postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=billing_db `
  -p 5432:5432 `
  -d postgres:15
```

Затем в `.env` используйте:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=postgres
DB_PASSWORD=postgres
```

---

## Способ 3: Переустановка PostgreSQL

1. Удалите PostgreSQL через "Установка и удаление программ"
2. Удалите папку `C:\Program Files\PostgreSQL`
3. Установите PostgreSQL заново
4. При установке установите новый пароль

---

## Какой способ выбрать?

- **Способ 1** - если хотите сохранить существующую установку
- **Способ 2 (Docker)** - самый быстрый для разработки
- **Способ 3** - если хотите начать с чистого листа
