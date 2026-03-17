-- Миграция: Добавление полей для полных данных клиента из СБИС
-- Дата: 2024
-- Описание: Добавляет поля ОКТМО, ОКПО, ОКВЭД, рег. номер ПФ, рег. номер СФР, дата регистрации, орган регистрации

-- Для MySQL
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS oktmo VARCHAR(11) NULL,
ADD COLUMN IF NOT EXISTS okpo VARCHAR(10) NULL,
ADD COLUMN IF NOT EXISTS okved VARCHAR(10) NULL,
ADD COLUMN IF NOT EXISTS pf_reg_number VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS sfr_reg_number VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS registration_date DATE NULL,
ADD COLUMN IF NOT EXISTS registration_authority TEXT NULL;

-- Для PostgreSQL (альтернативный вариант)
-- DO $$ 
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'oktmo') THEN
--     ALTER TABLE clients ADD COLUMN oktmo VARCHAR(11);
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'okpo') THEN
--     ALTER TABLE clients ADD COLUMN okpo VARCHAR(10);
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'okved') THEN
--     ALTER TABLE clients ADD COLUMN okved VARCHAR(10);
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'pf_reg_number') THEN
--     ALTER TABLE clients ADD COLUMN pf_reg_number VARCHAR(50);
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'sfr_reg_number') THEN
--     ALTER TABLE clients ADD COLUMN sfr_reg_number VARCHAR(50);
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'registration_date') THEN
--     ALTER TABLE clients ADD COLUMN registration_date DATE;
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'registration_authority') THEN
--     ALTER TABLE clients ADD COLUMN registration_authority TEXT;
--   END IF;
-- END $$;
