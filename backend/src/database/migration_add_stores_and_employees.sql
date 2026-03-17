-- Миграция: Добавление таблиц для магазинов и сотрудников
-- Для MySQL

-- Таблица магазинов (stores)
CREATE TABLE IF NOT EXISTS stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX idx_client_id (client_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица сотрудников (employees)
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL COMMENT 'ID директора/компании',
  store_id INT COMMENT 'ID магазина (может быть NULL для сотрудников без привязки к магазину)',
  phone VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'employee' COMMENT 'employee, manager, etc.',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL,
  INDEX idx_client_id (client_id),
  INDEX idx_store_id (store_id),
  INDEX idx_phone (phone),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Добавляем поле role в таблицу clients для определения роли (director, employee)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'director' COMMENT 'director, employee',
ADD COLUMN IF NOT EXISTS parent_client_id INT NULL COMMENT 'ID директора (для сотрудников)',
ADD FOREIGN KEY (parent_client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Индекс для parent_client_id
CREATE INDEX IF NOT EXISTS idx_parent_client_id ON clients(parent_client_id);
