-- Скрипт для быстрой настройки базы данных PostgreSQL
-- Выполните этот скрипт от имени пользователя postgres

-- Создание базы данных (если не существует)
-- Примечание: CREATE DATABASE не может быть выполнена в транзакции
SELECT 'CREATE DATABASE billing_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'billing_db')\gexec

-- Создание пользователя (если не существует)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'billing_user') THEN
    CREATE USER billing_user WITH PASSWORD 'SecurePassword123';
  END IF;
END
$$;

-- Выдача прав на базу данных
GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;

-- Подключение к базе billing_db
\c billing_db

-- Выдача прав на схему public (важно для PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO billing_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO billing_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO billing_user;

-- Установка прав по умолчанию для новых объектов
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO billing_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO billing_user;

-- Вывод информации об успешной настройке
\echo '✅ База данных billing_db успешно создана'
\echo '✅ Пользователь billing_user создан'
\echo '✅ Права выданы'
\echo ''
\echo 'Следующий шаг: запустите миграции командой: npm run migrate'

