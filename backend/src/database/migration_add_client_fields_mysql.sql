-- Миграция для MySQL: Добавление полей для полных данных клиента из СБИС
-- ВАЖНО: Выполняйте команды по одной, если какая-то колонка уже существует - будет ошибка, это нормально
-- Просто пропустите эту команду и переходите к следующей

-- Добавление поля ОКТМО
ALTER TABLE clients ADD COLUMN oktmo VARCHAR(11) NULL;

-- Добавление поля ОКПО
ALTER TABLE clients ADD COLUMN okpo VARCHAR(10) NULL;

-- Добавление поля ОКВЭД
ALTER TABLE clients ADD COLUMN okved VARCHAR(10) NULL;

-- Добавление поля Рег. номер ПФ
ALTER TABLE clients ADD COLUMN pf_reg_number VARCHAR(50) NULL;

-- Добавление поля Рег. номер СФР
ALTER TABLE clients ADD COLUMN sfr_reg_number VARCHAR(50) NULL;

-- Добавление поля Дата регистрации
ALTER TABLE clients ADD COLUMN registration_date DATE NULL;

-- Добавление поля Орган регистрации
ALTER TABLE clients ADD COLUMN registration_authority TEXT NULL;

-- Проверка: посмотреть все колонки таблицы
-- DESCRIBE clients;
