-- Миграция: Добавление колонки director в таблицу clients
-- Выполните этот SQL в phpMyAdmin или через MySQL клиент

ALTER TABLE clients ADD COLUMN director VARCHAR(255) NULL;
