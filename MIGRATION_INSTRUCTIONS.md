# Инструкция по миграции БД

## Проблема с подключением

Если вы видите ошибку:
```
Host '80.83.239.126' is not allowed to connect to this MySQL server
```

Это означает, что ваш IP адрес не добавлен в whitelist MySQL на сервере Beget.

## Решение проблемы подключения

### Вариант 1: Добавить IP в whitelist (рекомендуется)

1. Войдите в панель управления Beget
2. Перейдите в раздел "Базы данных" → "MySQL"
3. Найдите вашу базу данных `wcb-service`
4. Добавьте ваш IP адрес `80.83.239.126` в список разрешенных IP
5. Сохраните изменения

### Вариант 2: Использовать localhost (если backend на том же сервере)

Если backend запущен на том же сервере, что и MySQL, измените в `.env`:
```
DB_HOST=localhost
```

## Выполнение миграции

### Способ 1: Автоматическая миграция (после решения проблемы с подключением)

```bash
npm run migrate
```

Этот скрипт автоматически:
- Подключится к БД
- Проверит существующие поля
- Добавит недостающие поля (oktmo, okpo, okved, pf_reg_number, sfr_reg_number, registration_date, registration_authority)

### Способ 2: Ручная миграция через SQL

Если автоматическая миграция не работает, выполните SQL скрипт вручную:

1. Откройте файл `backend/src/database/migration_add_client_fields.sql`
2. Скопируйте SQL команды для вашего типа БД (MySQL или PostgreSQL)
3. Выполните их через:
   - phpMyAdmin (для MySQL на Beget)
   - pgAdmin (для PostgreSQL)
   - Или через командную строку MySQL/PostgreSQL

#### Для MySQL:
```sql
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS oktmo VARCHAR(11) NULL,
ADD COLUMN IF NOT EXISTS okpo VARCHAR(10) NULL,
ADD COLUMN IF NOT EXISTS okved VARCHAR(10) NULL,
ADD COLUMN IF NOT EXISTS pf_reg_number VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS sfr_reg_number VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS registration_date DATE NULL,
ADD COLUMN IF NOT EXISTS registration_authority TEXT NULL;
```

**Примечание:** MySQL может не поддерживать `IF NOT EXISTS` в `ALTER TABLE`. В этом случае используйте:

```sql
-- Проверьте существование колонок вручную и выполните только те, которых нет:

ALTER TABLE clients ADD COLUMN oktmo VARCHAR(11) NULL;
ALTER TABLE clients ADD COLUMN okpo VARCHAR(10) NULL;
ALTER TABLE clients ADD COLUMN okved VARCHAR(10) NULL;
ALTER TABLE clients ADD COLUMN pf_reg_number VARCHAR(50) NULL;
ALTER TABLE clients ADD COLUMN sfr_reg_number VARCHAR(50) NULL;
ALTER TABLE clients ADD COLUMN registration_date DATE NULL;
ALTER TABLE clients ADD COLUMN registration_authority TEXT NULL;
```

#### Для PostgreSQL:
```sql
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'oktmo') THEN
    ALTER TABLE clients ADD COLUMN oktmo VARCHAR(11);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'okpo') THEN
    ALTER TABLE clients ADD COLUMN okpo VARCHAR(10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'okved') THEN
    ALTER TABLE clients ADD COLUMN okved VARCHAR(10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'pf_reg_number') THEN
    ALTER TABLE clients ADD COLUMN pf_reg_number VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'sfr_reg_number') THEN
    ALTER TABLE clients ADD COLUMN sfr_reg_number VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'registration_date') THEN
    ALTER TABLE clients ADD COLUMN registration_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'registration_authority') THEN
    ALTER TABLE clients ADD COLUMN registration_authority TEXT;
  END IF;
END $$;
```

## Проверка миграции

После выполнения миграции проверьте, что поля добавлены:

### MySQL:
```sql
DESCRIBE clients;
```

или

```sql
SHOW COLUMNS FROM clients;
```

### PostgreSQL:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clients';
```

Вы должны увидеть новые поля:
- `oktmo`
- `okpo`
- `okved`
- `pf_reg_number`
- `sfr_reg_number`
- `registration_date`
- `registration_authority`

## Что дальше?

После успешной миграции:

1. Запустите backend сервер: `npm run dev`
2. Вызовите endpoint синхронизации: `POST /api/clients/sync` (с авторизацией)
3. Данные из СБИС автоматически заполнят новые поля
4. Проверьте данные через: `GET /api/clients/me`

## Автоматическая миграция при запуске

Если проблема с подключением решена, миграция выполнится автоматически при следующем запуске сервера, так как код в `backend/src/database/init.js` проверяет и добавляет недостающие поля.
