const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'billing_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// Проверка подключения
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function initDatabase() {
  try {
    // Проверяем подключение
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');

    // Создаём таблицы
    await createTables();
    console.log('✅ Database tables created');

    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

async function createTables() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Таблица клиентов
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        balance DECIMAL(12, 2) DEFAULT 0.00,
        inn VARCHAR(12),
        kpp VARCHAR(9),
        ogrn VARCHAR(15),
        company_address TEXT,
        sbis_contract_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Добавляем колонку inn если её нет (для существующих БД)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'inn') THEN
          ALTER TABLE clients ADD COLUMN inn VARCHAR(12);
        END IF;
      END $$;
    `);

    // Таблица услуг
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        billing_period VARCHAR(50) DEFAULT 'monthly',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица связи клиент-услуга
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_services (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        sbis_service_id VARCHAR(255),
        start_date DATE NOT NULL,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица платежей и начислений
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id),
        type VARCHAR(50) NOT NULL CHECK (type IN ('charge', 'payment', 'refund')),
        amount DECIMAL(12, 2) NOT NULL,
        description TEXT,
        period_start DATE,
        period_end DATE,
        sbis_invoice_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица интеграций со СБИС
    await client.query(`
      CREATE TABLE IF NOT EXISTS sbis_sync_log (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        sync_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        data JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица уведомлений
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица кэша контрагентов из СБИС CRM
    await client.query(`
      CREATE TABLE IF NOT EXISTS sbis_contractors (
        id SERIAL PRIMARY KEY,
        sbis_id VARCHAR(100) UNIQUE NOT NULL,
        inn VARCHAR(12) NOT NULL,
        kpp VARCHAR(9),
        ogrn VARCHAR(15),
        name VARCHAR(500),
        short_name VARCHAR(255),
        full_name VARCHAR(500),
        address TEXT,
        legal_address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        director VARCHAR(255),
        deals_count INTEGER DEFAULT 0,
        documents_count INTEGER DEFAULT 0,
        total_amount DECIMAL(15, 2) DEFAULT 0.00,
        last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица сделок из СБИС CRM (кэш)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sbis_deals (
        id SERIAL PRIMARY KEY,
        sbis_id VARCHAR(100) UNIQUE NOT NULL,
        contractor_id INTEGER REFERENCES sbis_contractors(id) ON DELETE CASCADE,
        theme_id VARCHAR(100),
        theme_name VARCHAR(255),
        amount DECIMAL(15, 2),
        status VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индексы для оптимизации
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
      CREATE INDEX IF NOT EXISTS idx_clients_inn ON clients(inn);
      CREATE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions(client_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_client_services_client_id ON client_services(client_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON notifications(client_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_sbis_contractors_inn ON sbis_contractors(inn);
      CREATE INDEX IF NOT EXISTS idx_sbis_contractors_sbis_id ON sbis_contractors(sbis_id);
      CREATE INDEX IF NOT EXISTS idx_sbis_deals_contractor_id ON sbis_deals(contractor_id);
      CREATE INDEX IF NOT EXISTS idx_sbis_deals_sbis_id ON sbis_deals(sbis_id);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initDatabase, pool };

