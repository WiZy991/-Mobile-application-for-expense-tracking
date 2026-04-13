// Поддержка как PostgreSQL, так и MySQL
const dbConnection = process.env.DB_CONNECTION || 'postgresql';
let pool;
let isMySQL = false;


if (dbConnection === 'mysql') {
  // MySQL подключение
  const mysql = require('mysql2/promise');
  isMySQL = true;
  
  // Используем хост из переменной окружения (может быть localhost или удаленный хост)
  const dbHost = process.env.DB_HOST || 'localhost';
  
  const mysqlConfig = {
    host: dbHost,
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'wcb-service',
    user: process.env.DB_USERNAME || process.env.DB_USER || 'wcb-service',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 60000 // 60 секунд таймаут подключения
    // acquireTimeout и timeout не поддерживаются для Connection в mysql2
    // Таймауты запросов настраиваются на уровне запросов, а не пула
  };
  
  console.log(`🔌 MySQL connection config:`);
  console.log(`   Host: ${mysqlConfig.host}`);
  console.log(`   Port: ${mysqlConfig.port}`);
  console.log(`   Database: ${mysqlConfig.database}`);
  console.log(`   User: ${mysqlConfig.user}`);
  console.log(`   Password: ${mysqlConfig.password ? '***' : '(empty)'}`);
  
  // Создаем pool для MySQL
  pool = mysql.createPool(mysqlConfig);
} else {
  // PostgreSQL подключение (по умолчанию)
  const { Pool } = require('pg');
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'billing_db',
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });
  
  // Проверка подключения для PostgreSQL
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });
}

async function initDatabase() {
  try {
    // Проверяем подключение
    if (isMySQL) {
      try {
        // Для MySQL используем getConnection для проверки
        console.log('🔍 Testing MySQL connection...');
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.query('SELECT NOW() as now, DATABASE() as db, USER() as user');
          console.log(`✅ MySQL database connection established!`);
          console.log(`   Connected to database: '${rows[0].db}'`);
          console.log(`   As user: ${rows[0].user}`);
          console.log(`   Server time: ${rows[0].now}`);
        } finally {
          connection.release();
        }
      } catch (mysqlError) {
        console.error('\n❌ MySQL connection error!');
        console.error('   Error message:', mysqlError.message);
        console.error('   Error code:', mysqlError.code);
        console.error('   Error errno:', mysqlError.errno);
        console.error('\n   Current configuration:');
        console.error('   DB_CONNECTION:', process.env.DB_CONNECTION);
        console.error('   DB_HOST:', process.env.DB_HOST || 'localhost');
        console.error('   DB_PORT:', process.env.DB_PORT || 3306);
        console.error('   DB_DATABASE:', process.env.DB_DATABASE || process.env.DB_NAME || 'wcb-service');
        console.error('   DB_USERNAME:', process.env.DB_USERNAME || process.env.DB_USER || 'wcb-service');
        console.error('   DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : '(empty)');
        
        if (mysqlError.code === 'EACCES' || mysqlError.code === 'ECONNREFUSED' || mysqlError.errno === -4078) {
          console.error('\n   💡 Possible solutions:');
          console.error('      1. Check if MySQL server is running on port', process.env.DB_PORT || 3306);
          console.error('      2. Verify database name exists: wcb-service');
          console.error('      3. Check user credentials in backend/.env file');
          console.error('      4. Try connecting with MySQL client to verify credentials');
        } else if (mysqlError.code === 'ER_ACCESS_DENIED_ERROR' || mysqlError.errno === 1045) {
          console.error('\n   💡 Authentication failed!');
          console.error('      Check username and password in backend/.env file');
        } else if (mysqlError.code === 'ER_BAD_DB_ERROR' || mysqlError.errno === 1049) {
          console.error('\n   💡 Database does not exist!');
          console.error('      Create database: CREATE DATABASE `wcb-service`;');
        } else if (mysqlError.code === 'ER_HOST_NOT_PRIVILEGED' || mysqlError.errno === 1130) {
          console.error('\n   💡 Host is not allowed to connect!');
          console.error('      Your IP address is not whitelisted in MySQL server.');
          console.error('      Solution: Add your IP to MySQL whitelist in Beget panel');
          console.error('      Or use localhost if backend runs on the same server');
        }
        throw mysqlError;
      }
    } else {
      await pool.query('SELECT NOW()');
      console.log('✅ PostgreSQL database connection established');
    }

    // Создаём таблицы
    await createTables();
    console.log('✅ Database tables created');

    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Хелперы для генерации SQL в зависимости от типа БД
function getPrimaryKeyType() {
  return isMySQL ? 'INT AUTO_INCREMENT' : 'SERIAL PRIMARY KEY';
}

function getJsonType() {
  return isMySQL ? 'JSON' : 'JSONB';
}

function getJsonDefault() {
  return isMySQL ? "'[]'" : "'[]'::jsonb";
}

// Хелпер для создания индексов (MySQL не поддерживает IF NOT EXISTS)
async function createIndexIfNotExists(client, indexName, tableName, columns) {
  if (isMySQL) {
    try {
      // Проверяем существование индекса
      const [rows] = await client.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.statistics 
        WHERE table_schema = DATABASE() 
        AND table_name = ? 
        AND index_name = ?
      `, [tableName, indexName]);
      
      if (rows[0].count === 0) {
        await client.query(`CREATE INDEX ${indexName} ON ${tableName}(${columns})`);
      }
    } catch (err) {
      // Игнорируем ошибки, если индекс уже существует
      if (err.code !== 'ER_DUP_KEYNAME') {
        console.log(`   Note: Could not create index ${indexName}:`, err.message);
      }
    }
  } else {
    // PostgreSQL поддерживает IF NOT EXISTS
    await client.query(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns})`);
  }
}

async function createTables() {
  let client;
  let shouldRelease = false;
  
  if (isMySQL) {
    // Для MySQL используем pool напрямую
    client = pool;
    await client.query('START TRANSACTION');
  } else {
    // Для PostgreSQL получаем клиент из pool
    client = await pool.connect();
    shouldRelease = true;
    await client.query('BEGIN');
  }
  
  try {

    // Таблица клиентов
    if (isMySQL) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS clients (
          id INT AUTO_INCREMENT PRIMARY KEY,
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
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Добавляем колонки если их нет (MySQL синтаксис)
      const columnsToAdd = [
        { name: 'inn', type: 'VARCHAR(12)' },
        { name: 'kpp', type: 'VARCHAR(9)' },
        { name: 'ogrn', type: 'VARCHAR(15)' },
        { name: 'company_address', type: 'TEXT' },
        { name: 'oktmo', type: 'VARCHAR(11)' },
        { name: 'okpo', type: 'VARCHAR(10)' },
        { name: 'okved', type: 'VARCHAR(10)' },
        { name: 'pf_reg_number', type: 'VARCHAR(50)' },
        { name: 'sfr_reg_number', type: 'VARCHAR(50)' },
        { name: 'registration_date', type: 'DATE' },
        { name: 'registration_authority', type: 'TEXT' },
        { name: 'director', type: 'VARCHAR(255)' },
        { name: 'sbis_login', type: 'VARCHAR(255)' },
        { name: 'sbis_password', type: 'TEXT' },
        { name: 'sbis_notes', type: 'TEXT' }
      ];
      
      for (const col of columnsToAdd) {
        try {
          const [rows] = await client.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'clients' 
            AND column_name = ?
          `, [col.name]);
          
          if (rows[0].count === 0) {
            await client.query(`ALTER TABLE clients ADD COLUMN ${col.name} ${col.type}`);
            console.log(`   Added column: clients.${col.name}`);
          }
        } catch (err) {
          // Игнорируем ошибки, если колонка уже существует
          if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log(`   Note: Could not add column ${col.name}:`, err.message);
          }
        }
      }
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS clients (
          id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
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

      // Добавляем колонки если их нет (PostgreSQL синтаксис)
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'inn') THEN
            ALTER TABLE clients ADD COLUMN inn VARCHAR(12);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'kpp') THEN
            ALTER TABLE clients ADD COLUMN kpp VARCHAR(9);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'ogrn') THEN
            ALTER TABLE clients ADD COLUMN ogrn VARCHAR(15);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'company_address') THEN
            ALTER TABLE clients ADD COLUMN company_address TEXT;
          END IF;
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
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'director') THEN
            ALTER TABLE clients ADD COLUMN director VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'sbis_login') THEN
            ALTER TABLE clients ADD COLUMN sbis_login VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'sbis_password') THEN
            ALTER TABLE clients ADD COLUMN sbis_password TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'sbis_notes') THEN
            ALTER TABLE clients ADD COLUMN sbis_notes TEXT;
          END IF;
        END $$;
      `);
    }

    // Таблица услуг
    if (isMySQL) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS services (
          id ${getPrimaryKeyType()} PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          price DECIMAL(10, 2) NOT NULL,
          billing_period VARCHAR(50) DEFAULT 'monthly',
          category VARCHAR(100) DEFAULT 'other',
          subcategory VARCHAR(255),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Добавляем поля category и subcategory если их нет (MySQL)
      // MySQL не поддерживает IF NOT EXISTS для ALTER TABLE, поэтому проверяем через INFORMATION_SCHEMA
      try {
        const [columns] = await client.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'services' 
          AND COLUMN_NAME IN ('category', 'subcategory', 'updated_at')
        `);
        
        const existingColumns = columns.map(col => col.COLUMN_NAME);
        
        if (!existingColumns.includes('category')) {
          await client.query(`ALTER TABLE services ADD COLUMN category VARCHAR(100) DEFAULT 'other'`);
          console.log('✅ Added column: category to services table');
        }
        
        if (!existingColumns.includes('subcategory')) {
          await client.query(`ALTER TABLE services ADD COLUMN subcategory VARCHAR(255)`);
          console.log('✅ Added column: subcategory to services table');
        }
        
        if (!existingColumns.includes('updated_at')) {
          await client.query(`ALTER TABLE services ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
          console.log('✅ Added column: updated_at to services table');
        }
      } catch (err) {
        console.error('Error adding columns to services table:', err.message);
        // Продолжаем выполнение даже если есть ошибка
      }
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS services (
          id ${getPrimaryKeyType()},
          name VARCHAR(255) NOT NULL,
          code VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          price DECIMAL(10, 2) NOT NULL,
          billing_period VARCHAR(50) DEFAULT 'monthly',
          category VARCHAR(100) DEFAULT 'other',
          subcategory VARCHAR(255),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Добавляем поля category и subcategory если их нет (PostgreSQL)
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'category') THEN
            ALTER TABLE services ADD COLUMN category VARCHAR(100) DEFAULT 'other';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'subcategory') THEN
            ALTER TABLE services ADD COLUMN subcategory VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'updated_at') THEN
            ALTER TABLE services ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          END IF;
        END $$;
      `);
    }

    // Таблица связи клиент-услуга
    if (isMySQL) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS client_services (
          id ${getPrimaryKeyType()},
          client_id INT NOT NULL,
          service_id INT NOT NULL,
          sbis_service_id VARCHAR(255),
          start_date DATE NOT NULL,
          end_date DATE,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS client_services (
          id ${getPrimaryKeyType()},
          client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
          service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
          sbis_service_id VARCHAR(255),
          start_date DATE NOT NULL,
          end_date DATE,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Таблица платежей и начислений
    if (isMySQL) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id ${getPrimaryKeyType()},
          client_id INT NOT NULL,
          service_id INT,
          type VARCHAR(50) NOT NULL,
          amount DECIMAL(12, 2) NOT NULL,
          description TEXT,
          period_start DATE,
          period_end DATE,
          sbis_invoice_id VARCHAR(255),
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id),
          CHECK (type IN ('charge', 'payment', 'refund')),
          CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id ${getPrimaryKeyType()},
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
    }

    // Таблица интеграций со СБИС
    if (isMySQL) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sbis_sync_log (
          id ${getPrimaryKeyType()} PRIMARY KEY,
          client_id INT NOT NULL,
          sync_type VARCHAR(50) NOT NULL,
          status VARCHAR(50) NOT NULL,
          data ${getJsonType()},
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sbis_sync_log (
          id ${getPrimaryKeyType()},
          client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
          sync_type VARCHAR(50) NOT NULL,
          status VARCHAR(50) NOT NULL,
          data ${getJsonType()},
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Таблица уведомлений
    if (isMySQL) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id ${getPrimaryKeyType()} PRIMARY KEY,
          client_id INT NOT NULL,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          related_id INT,
          related_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id ${getPrimaryKeyType()},
          client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          related_id INTEGER,
          related_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Таблица кэша контрагентов из СБИС CRM
    await client.query(`
      CREATE TABLE IF NOT EXISTS sbis_contractors (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
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
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
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

    // Таблица заказов
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id),
        amount DECIMAL(12, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
        invoice_number VARCHAR(100),
        manager_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица сообщений поддержки
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'to_do' CHECK (status IN ('to_do', 'in_progress', 'in_review', 'done', 'closed')),
        priority VARCHAR(50) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        assigned_to INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица ответов в тикетах поддержки
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
        user_id INTEGER,
        user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('client', 'support', 'staff', 'manager')),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица файлов тикетов
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_ticket_files (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES support_messages(id) ON DELETE SET NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(100),
        uploaded_by INTEGER NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица реакций на сообщения
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        message_id INTEGER REFERENCES support_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        user_type VARCHAR(50) NOT NULL,
        emoji VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица менеджеров и сотрудников поддержки
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('manager', 'director', 'support', 'engineer')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица рекомендаций (связь услуг)
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_recommendations (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        recommended_service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
        weight DECIMAL(5, 2) DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(service_id, recommended_service_id)
      )
    `);

    // Таблица ресурсов клиентов (ФН, лицензии, подписки и т.д.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_resources (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('fn', 'evotor', 'atol', 'ofd', 'license', 'subscription', 'other')),
        resource_name VARCHAR(255) NOT NULL,
        serial_number VARCHAR(255),
        model VARCHAR(255),
        start_date DATE,
        expiry_date DATE NOT NULL,
        renewal_price DECIMAL(12, 2) DEFAULT 0,
        auto_renewal BOOLEAN DEFAULT false,
        sbis_resource_id VARCHAR(255),
        sbis_contract_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'expiring_soon', 'renewed', 'cancelled')),
        last_notified_at TIMESTAMP,
        renewal_notification_sent BOOLEAN DEFAULT false,
        metadata ${getJsonType()},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица заявок на услуги (service requests)
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        service_name VARCHAR(255) NOT NULL,
        service_code VARCHAR(100),
        price DECIMAL(12, 2) NOT NULL,
        quantity INTEGER DEFAULT 1,
        total_amount DECIMAL(12, 2) NOT NULL,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
        sbis_document_id INTEGER,
        sbis_document_uuid VARCHAR(255),
        invoice_number VARCHAR(100),
        invoice_url VARCHAR(500),
        invoice_file_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP${isMySQL ? ` ON UPDATE CURRENT_TIMESTAMP` : ``}
      )
    `);

    // Индексы для оптимизации
    const indexes = [
      { name: 'idx_clients_email', table: 'clients', columns: 'email' },
      { name: 'idx_clients_inn', table: 'clients', columns: 'inn' },
      { name: 'idx_transactions_client_id', table: 'transactions', columns: 'client_id' },
      { name: 'idx_transactions_created_at', table: 'transactions', columns: 'created_at' },
      { name: 'idx_transactions_type', table: 'transactions', columns: 'type' },
      { name: 'idx_client_services_client_id', table: 'client_services', columns: 'client_id' },
      { name: 'idx_service_requests_client_id', table: 'service_requests', columns: 'client_id' },
      { name: 'idx_service_requests_status', table: 'service_requests', columns: 'status' },
      { name: 'idx_service_requests_created_at', table: 'service_requests', columns: 'created_at' },
      { name: 'idx_notifications_client_id', table: 'notifications', columns: 'client_id' },
      { name: 'idx_notifications_is_read', table: 'notifications', columns: 'is_read' },
      { name: 'idx_sbis_contractors_inn', table: 'sbis_contractors', columns: 'inn' },
      { name: 'idx_sbis_contractors_sbis_id', table: 'sbis_contractors', columns: 'sbis_id' },
      { name: 'idx_sbis_deals_contractor_id', table: 'sbis_deals', columns: 'contractor_id' },
      { name: 'idx_sbis_deals_sbis_id', table: 'sbis_deals', columns: 'sbis_id' },
      { name: 'idx_orders_client_id', table: 'orders', columns: 'client_id' },
      { name: 'idx_orders_status', table: 'orders', columns: 'status' },
      { name: 'idx_orders_manager_id', table: 'orders', columns: 'manager_id' },
      { name: 'idx_support_tickets_client_id', table: 'support_tickets', columns: 'client_id' },
      { name: 'idx_support_tickets_status', table: 'support_tickets', columns: 'status' },
      { name: 'idx_support_tickets_assigned_to', table: 'support_tickets', columns: 'assigned_to' },
      { name: 'idx_support_messages_ticket_id', table: 'support_messages', columns: 'ticket_id' },
      { name: 'idx_support_ticket_files_ticket_id', table: 'support_ticket_files', columns: 'ticket_id' },
      { name: 'idx_support_ticket_files_message_id', table: 'support_ticket_files', columns: 'message_id' },
      { name: 'idx_service_recommendations_service_id', table: 'service_recommendations', columns: 'service_id' },
      { name: 'idx_client_resources_client_id', table: 'client_resources', columns: 'client_id' },
      { name: 'idx_client_resources_expiry_date', table: 'client_resources', columns: 'expiry_date' },
      { name: 'idx_client_resources_status', table: 'client_resources', columns: 'status' },
      { name: 'idx_client_resources_resource_type', table: 'client_resources', columns: 'resource_type' }
    ];
    
    for (const idx of indexes) {
      await createIndexIfNotExists(client, idx.name, idx.table, idx.columns);
    }

    // Таблица тарифов подписок
    if (isMySQL) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
          id ${getPrimaryKeyType()} PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          price DECIMAL(10, 2) NOT NULL,
          billing_period VARCHAR(50) DEFAULT 'monthly',
          features ${getJsonType()} NOT NULL,
          is_popular BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
          id ${getPrimaryKeyType()},
          name VARCHAR(255) NOT NULL,
          code VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          price DECIMAL(10, 2) NOT NULL,
          billing_period VARCHAR(50) DEFAULT 'monthly',
          features ${getJsonType()} NOT NULL DEFAULT '[]'::${getJsonType()},
          is_popular BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Обновляем constraint для billing_period, если таблица уже существует
    // MySQL поддерживает CHECK constraints с версии 8.0.16, но синтаксис немного отличается
    if (!isMySQL) {
      try {
        await client.query(`
          ALTER TABLE subscription_plans 
          DROP CONSTRAINT IF EXISTS subscription_plans_billing_period_check;
        `);
        await client.query(`
          ALTER TABLE subscription_plans 
          ADD CONSTRAINT subscription_plans_billing_period_check 
          CHECK (billing_period IN ('monthly', 'quarterly', 'half_yearly', 'yearly'));
        `);
        console.log('✅ Updated subscription_plans billing_period constraint');
      } catch (error) {
        console.log('Note: Could not update constraint (may already be correct):', error.message);
      }
    }

    // Таблица активных подписок клиентов
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_subscriptions (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        next_billing_date DATE NOT NULL,
        auto_renewal BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
        sbis_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индексы для подписок
    const subscriptionIndexes = [
      { name: 'idx_client_subscriptions_client_id', table: 'client_subscriptions', columns: 'client_id' },
      { name: 'idx_client_subscriptions_plan_id', table: 'client_subscriptions', columns: 'plan_id' },
      { name: 'idx_client_subscriptions_status', table: 'client_subscriptions', columns: 'status' },
      { name: 'idx_client_subscriptions_end_date', table: 'client_subscriptions', columns: 'end_date' },
      { name: 'idx_client_subscriptions_next_billing_date', table: 'client_subscriptions', columns: 'next_billing_date' }
    ];
    
    for (const idx of subscriptionIndexes) {
      await createIndexIfNotExists(client, idx.name, idx.table, idx.columns);
    }

    // Обновляем constraint для billing_period, если таблица уже существует
    // Это нужно для поддержки новых периодов (quarterly, half_yearly)
    // MySQL поддерживает CHECK constraints с версии 8.0.16, но синтаксис немного отличается
    if (!isMySQL) {
      try {
        await client.query(`
          ALTER TABLE subscription_plans 
          DROP CONSTRAINT IF EXISTS subscription_plans_billing_period_check;
        `);
        await client.query(`
          ALTER TABLE subscription_plans 
          ADD CONSTRAINT subscription_plans_billing_period_check 
          CHECK (billing_period IN ('monthly', 'quarterly', 'half_yearly', 'yearly'));
        `);
        console.log('✅ Updated subscription_plans billing_period constraint');
      } catch (error) {
        console.log('Note: Could not update constraint (may already be correct):', error.message);
      }
    }

    // Вставка тарифов по умолчанию
    // Все тарифы имеют одинаковый набор функций, различаются только периодом и ценой
    const commonFeatures = [
      'Диагностика оборудования: Быстрое выявление и устранение',
      'Ремонт оборудования: Профессиональный ремонт кассовой техники',
      'Скидка на товары и услуги: Выгодные цены',
      'Бонусная система: Накапливайте бонусы',
      'Приоритет задач: Заявки пользователей приложения обрабатываются в первую очередь',
      'Контроль и мониторинг ресурсов: Своевременное оповещение об окончании срока действия ФН, ОФД, подписок и других важных ресурсов'
    ];

    // Удаляем старые тарифы и вставляем новые точно по скриншоту
    // Используем ON CONFLICT/ON DUPLICATE KEY для обновления существующих тарифов
    const featuresJson = JSON.stringify(commonFeatures);
    
    if (isMySQL) {
      await client.query(`
        INSERT INTO subscription_plans (name, code, description, price, billing_period, features, is_popular, sort_order) VALUES
        ('Месяц', 'month', '1 месяц', 3990, 'monthly', ?, false, 1),
        ('Квартал', 'quarter', '3 месяца', 10470, 'quarterly', ?, false, 2),
        ('Полгода', 'half_year', '6 месяцев', 13740, 'half_yearly', ?, false, 3),
        ('Год', 'year', '12 месяцев', 23880, 'yearly', ?, false, 4)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          price = VALUES(price),
          billing_period = VALUES(billing_period),
          features = VALUES(features),
          is_popular = VALUES(is_popular),
          sort_order = VALUES(sort_order),
          updated_at = CURRENT_TIMESTAMP
      `, [featuresJson, featuresJson, featuresJson, featuresJson]);
    } else {
      await client.query(`
        INSERT INTO subscription_plans (name, code, description, price, billing_period, features, is_popular, sort_order) VALUES
        ('Месяц', 'month', '1 месяц', 3990, 'monthly', 
         $1::${getJsonType()}, 
         false, 1),
        ('Квартал', 'quarter', '3 месяца', 10470, 'quarterly',
         $1::${getJsonType()},
         false, 2),
        ('Полгода', 'half_year', '6 месяцев', 13740, 'half_yearly',
         $1::${getJsonType()},
         false, 3),
        ('Год', 'year', '12 месяцев', 23880, 'yearly',
         $1::${getJsonType()},
         false, 4)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          billing_period = EXCLUDED.billing_period,
          features = EXCLUDED.features,
          is_popular = EXCLUDED.is_popular,
          sort_order = EXCLUDED.sort_order,
          updated_at = CURRENT_TIMESTAMP
      `, [featuresJson]);
    }

    // Удаляем тарифы, которых нет в новом списке (кроме тех, на которые есть ссылки)
    await client.query(`
      DELETE FROM subscription_plans 
      WHERE code NOT IN ('month', 'quarter', 'half_year', 'year')
      AND id NOT IN (SELECT DISTINCT plan_id FROM client_subscriptions WHERE plan_id IS NOT NULL)
    `);

    // Таблица уведомлений для инженеров/сотрудников
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_notifications (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        related_id INTEGER,
        related_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индексы для уведомлений инженеров
    const staffNotificationIndexes = [
      { name: 'idx_staff_notifications_staff_id', table: 'staff_notifications', columns: 'staff_id' },
      { name: 'idx_staff_notifications_is_read', table: 'staff_notifications', columns: 'is_read' },
      { name: 'idx_staff_notifications_created_at', table: 'staff_notifications', columns: 'created_at' }
    ];
    
    for (const idx of staffNotificationIndexes) {
      await createIndexIfNotExists(client, idx.name, idx.table, idx.columns);
    }

    // Добавляем поля для отслеживания времени выполнения задач
    if (isMySQL) {
      // MySQL: добавляем колонки если их нет
      const supportTicketColumns = [
        { name: 'started_at', type: 'TIMESTAMP NULL' },
        { name: 'completed_at', type: 'TIMESTAMP NULL' },
        { name: 'time_spent_minutes', type: 'INT DEFAULT 0' },
        { name: 'sbis_task_id', type: 'VARCHAR(100)' },
        { name: 'sbis_dialog_id', type: 'VARCHAR(100)' }
      ];
      
      for (const col of supportTicketColumns) {
        try {
          const [rows] = await client.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'support_tickets' 
            AND column_name = ?
          `, [col.name]);
          
          if (rows[0].count === 0) {
            await client.query(`ALTER TABLE support_tickets ADD COLUMN ${col.name} ${col.type}`);
            console.log(`   Added column: support_tickets.${col.name}`);
          }
        } catch (err) {
          if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log(`   Note: Could not add column support_tickets.${col.name}:`, err.message);
          }
        }
      }
    } else {
      // PostgreSQL: добавляем колонки если их нет
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'started_at') THEN
            ALTER TABLE support_tickets ADD COLUMN started_at TIMESTAMP;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'completed_at') THEN
            ALTER TABLE support_tickets ADD COLUMN completed_at TIMESTAMP;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'time_spent_minutes') THEN
            ALTER TABLE support_tickets ADD COLUMN time_spent_minutes INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'sbis_task_id') THEN
            ALTER TABLE support_tickets ADD COLUMN sbis_task_id VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'sbis_dialog_id') THEN
            ALTER TABLE support_tickets ADD COLUMN sbis_dialog_id VARCHAR(100);
          END IF;
        END $$;
      `);
    }

    // Добавляем поле full_name в таблицу staff, если его нет
    if (isMySQL) {
      try {
        const [rows] = await client.query(`
          SELECT COUNT(*) as count 
          FROM information_schema.columns 
          WHERE table_schema = DATABASE() 
          AND table_name = 'staff' 
          AND column_name = 'full_name'
        `);
        
        if (rows[0].count === 0) {
          await client.query(`ALTER TABLE staff ADD COLUMN full_name VARCHAR(255)`);
          console.log(`   Added column: staff.full_name`);
        }
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
          console.log(`   Note: Could not add column staff.full_name:`, err.message);
        }
      }
    } else {
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff' AND column_name = 'full_name') THEN
            ALTER TABLE staff ADD COLUMN full_name VARCHAR(255);
          END IF;
        END $$;
      `);
    }

    // Расширяем staff.role: добавляем director (как у существующих БД с CHECK)
    try {
      if (isMySQL) {
        const [chkRows] = await client.query(`
          SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
          WHERE table_schema = DATABASE() AND table_name = 'staff' AND constraint_type = 'CHECK'
        `);
        for (const row of chkRows || []) {
          const cn = row.CONSTRAINT_NAME;
          if (cn) {
            await client.query(`ALTER TABLE staff DROP CHECK \`${cn}\``);
          }
        }
        await client.query(`
          ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN ('manager', 'director', 'support', 'engineer'))
        `);
        console.log('✅ staff.role CHECK updated (director)');
      } else {
        await client.query(`ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check`);
        await client.query(`
          ALTER TABLE staff ADD CONSTRAINT staff_role_check
          CHECK (role IN ('manager', 'director', 'support', 'engineer'))
        `);
        console.log('✅ staff.role CHECK updated (director)');
      }
    } catch (err) {
      console.log('Note: staff.role CHECK (director) may already apply:', err.message);
    }

    // Обновляем constraint для support_messages, если нужно
    // MySQL поддерживает CHECK constraints с версии 8.0.16, но синтаксис немного отличается
    if (!isMySQL) {
      try {
        await client.query(`
          ALTER TABLE support_messages 
          DROP CONSTRAINT IF EXISTS support_messages_user_type_check;
        `);
        await client.query(`
          ALTER TABLE support_messages 
          ADD CONSTRAINT support_messages_user_type_check 
          CHECK (user_type IN ('client', 'support', 'staff', 'manager'));
        `);
        console.log('✅ Updated support_messages user_type constraint');
      } catch (error) {
        // Игнорируем ошибки, если constraint уже правильный или таблицы нет
        console.log('Note: Could not update constraint (may already be correct):', error.message);
      }
    }

    // Добавляем колонку sbis_message_id в support_messages, если её нет
    try {
      if (isMySQL) {
        const [rows] = await client.query(`
          SELECT COUNT(*) as count 
          FROM information_schema.columns 
          WHERE table_schema = DATABASE() 
          AND table_name = 'support_messages' 
          AND column_name = 'sbis_message_id'
        `);
        
        if (rows[0].count === 0) {
          await client.query(`ALTER TABLE support_messages ADD COLUMN sbis_message_id VARCHAR(100)`);
          console.log('✅ Added column: support_messages.sbis_message_id');
        }
      } else {
        await client.query(`
          DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_messages' AND column_name = 'sbis_message_id') THEN
              ALTER TABLE support_messages ADD COLUMN sbis_message_id VARCHAR(100);
            END IF;
          END $$;
        `);
        console.log('✅ Added column: support_messages.sbis_message_id');
      }
    } catch (error) {
      console.log('Note: Could not add sbis_message_id column (may already exist):', error.message);
    }

    // Добавляем поля related_id и related_type в notifications, если их нет
    try {
      if (isMySQL) {
        const columnsToAdd = [
          { name: 'related_id', type: 'INT' },
          { name: 'related_type', type: 'VARCHAR(50)' }
        ];
        
        for (const col of columnsToAdd) {
          try {
            const [rows] = await client.query(`
              SELECT COUNT(*) as count 
              FROM information_schema.columns 
              WHERE table_schema = DATABASE() 
              AND table_name = 'notifications' 
              AND column_name = ?
            `, [col.name]);
            
            if (rows[0].count === 0) {
              await client.query(`ALTER TABLE notifications ADD COLUMN ${col.name} ${col.type}`);
            }
          } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
              // Игнорируем ошибки
            }
          }
        }
        console.log('✅ Updated notifications table with related_id and related_type');
      } else {
        await client.query(`
          DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'related_id') THEN
              ALTER TABLE notifications ADD COLUMN related_id INTEGER;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'related_type') THEN
              ALTER TABLE notifications ADD COLUMN related_type VARCHAR(50);
            END IF;
          END $$;
        `);
        console.log('✅ Updated notifications table with related_id and related_type');
      }
    } catch (error) {
      console.log('Note: Could not update notifications table (may already be updated):', error.message);
    }

    // Таблица магазинов (stores)
    // ВАЖНО: Создаем после таблицы clients, чтобы внешний ключ работал
    if (isMySQL) {
      // Для MySQL используем явный тип INT, чтобы совпадал с clients.id
      await client.query(`
        CREATE TABLE IF NOT EXISTS stores (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          address TEXT NOT NULL,
          phone VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_stores_client_id (client_id),
          INDEX idx_stores_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Добавляем внешний ключ отдельно, чтобы избежать ошибок при создании таблицы
      try {
        await client.query(`
          ALTER TABLE stores 
          ADD CONSTRAINT fk_stores_client_id 
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        `);
      } catch (err) {
        // Игнорируем ошибку, если внешний ключ уже существует
        if (err.code !== 'ER_DUP_FKEY' && err.code !== 'ER_CANNOT_ADD_FOREIGN') {
          console.log('   Note: Could not add foreign key for stores.client_id:', err.message);
        }
      }
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS stores (
          id ${getPrimaryKeyType()},
          client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          address TEXT NOT NULL,
          phone VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await createIndexIfNotExists(client, 'idx_stores_client_id', 'stores', 'client_id');
      await createIndexIfNotExists(client, 'idx_stores_is_active', 'stores', 'is_active');
    }

    // Таблица сотрудников (employees)
    // ВАЖНО: Создаем после таблиц clients и stores
    if (isMySQL) {
      // Для MySQL используем явный тип INT
      await client.query(`
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
          INDEX idx_employees_client_id (client_id),
          INDEX idx_employees_store_id (store_id),
          INDEX idx_employees_phone (phone),
          INDEX idx_employees_is_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Добавляем внешние ключи отдельно
      try {
        await client.query(`
          ALTER TABLE employees 
          ADD CONSTRAINT fk_employees_client_id 
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        `);
      } catch (err) {
        if (err.code !== 'ER_DUP_FKEY' && err.code !== 'ER_CANNOT_ADD_FOREIGN') {
          console.log('   Note: Could not add foreign key for employees.client_id:', err.message);
        }
      }
      
      try {
        await client.query(`
          ALTER TABLE employees 
          ADD CONSTRAINT fk_employees_store_id 
          FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
        `);
      } catch (err) {
        if (err.code !== 'ER_DUP_FKEY' && err.code !== 'ER_CANNOT_ADD_FOREIGN') {
          console.log('   Note: Could not add foreign key for employees.store_id:', err.message);
        }
      }
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS employees (
          id ${getPrimaryKeyType()},
          client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
          store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
          phone VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(255),
          role VARCHAR(50) DEFAULT 'employee',
          is_active BOOLEAN DEFAULT true,
          last_login_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await createIndexIfNotExists(client, 'idx_employees_client_id', 'employees', 'client_id');
      await createIndexIfNotExists(client, 'idx_employees_store_id', 'employees', 'store_id');
      await createIndexIfNotExists(client, 'idx_employees_phone', 'employees', 'phone');
      await createIndexIfNotExists(client, 'idx_employees_is_active', 'employees', 'is_active');
    }

    // Добавляем поля role и parent_client_id в таблицу clients
    if (isMySQL) {
      const clientColumnsToAdd = [
        { name: 'role', type: "VARCHAR(50) DEFAULT 'director' COMMENT 'director, employee'" },
        { name: 'parent_client_id', type: 'INT NULL COMMENT \'ID директора (для сотрудников)\'' }
      ];
      
      for (const col of clientColumnsToAdd) {
        try {
          const [rows] = await client.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.columns 
            WHERE table_schema = DATABASE() 
            AND table_name = 'clients' 
            AND column_name = ?
          `, [col.name]);
          
          if (rows[0].count === 0) {
            await client.query(`ALTER TABLE clients ADD COLUMN ${col.name} ${col.type}`);
            console.log(`   Added column: clients.${col.name}`);
          }
        } catch (err) {
          if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log(`   Note: Could not add column clients.${col.name}:`, err.message);
          }
        }
      }
      
      // Добавляем внешний ключ для parent_client_id
      try {
        await client.query(`
          ALTER TABLE clients 
          ADD CONSTRAINT fk_clients_parent_client_id 
          FOREIGN KEY (parent_client_id) REFERENCES clients(id) ON DELETE CASCADE
        `);
      } catch (err) {
        if (err.code !== 'ER_DUP_FKEY') {
          console.log('   Note: Could not add foreign key for parent_client_id:', err.message);
        }
      }
      
      await createIndexIfNotExists(client, 'idx_clients_parent_client_id', 'clients', 'parent_client_id');
    } else {
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'role') THEN
            ALTER TABLE clients ADD COLUMN role VARCHAR(50) DEFAULT 'director';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'parent_client_id') THEN
            ALTER TABLE clients ADD COLUMN parent_client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE;
          END IF;
        END $$;
      `);
      await createIndexIfNotExists(client, 'idx_clients_parent_client_id', 'clients', 'parent_client_id');
    }

    // Проверяем и создаем таблицу staff_notifications, если её нет
    try {
      let tableExists = false;
      
      if (isMySQL) {
        const [rows] = await client.query(`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_schema = DATABASE() 
          AND table_name = 'staff_notifications'
        `);
        tableExists = rows[0].count > 0;
      } else {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'staff_notifications'
          ) as exists;
        `);
        tableExists = result.rows[0].exists;
      }
      
      if (!tableExists) {
        if (isMySQL) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS staff_notifications (
              id ${getPrimaryKeyType()} PRIMARY KEY,
              staff_id INT NOT NULL,
              type VARCHAR(50) NOT NULL,
              title VARCHAR(255) NOT NULL,
              message TEXT NOT NULL,
              is_read BOOLEAN DEFAULT false,
              related_id INT,
              related_type VARCHAR(50),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
        } else {
          await client.query(`
            CREATE TABLE IF NOT EXISTS staff_notifications (
              id ${getPrimaryKeyType()},
              staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
              type VARCHAR(50) NOT NULL,
              title VARCHAR(255) NOT NULL,
              message TEXT NOT NULL,
              is_read BOOLEAN DEFAULT false,
              related_id INTEGER,
              related_type VARCHAR(50),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
        }
        
        const staffNotificationIndexes = [
          { name: 'idx_staff_notifications_staff_id', table: 'staff_notifications', columns: 'staff_id' },
          { name: 'idx_staff_notifications_is_read', table: 'staff_notifications', columns: 'is_read' },
          { name: 'idx_staff_notifications_created_at', table: 'staff_notifications', columns: 'created_at' }
        ];
        
        for (const idx of staffNotificationIndexes) {
          await createIndexIfNotExists(client, idx.name, idx.table, idx.columns);
        }
        
        console.log('✅ Created staff_notifications table');
      }
    } catch (error) {
      console.log('Note: Could not create staff_notifications table (may already exist):', error.message);
    }

    // Таблица чатов (direct messaging)
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        type VARCHAR(20) DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
        title VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('client', 'staff')),
        role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'observer')),
        last_read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL,
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('client', 'staff')),
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const chatIndexes = [
      { name: 'idx_conv_participants_conv_id', table: 'conversation_participants', columns: 'conversation_id' },
      { name: 'idx_conv_participants_user', table: 'conversation_participants', columns: 'user_id, user_type' },
      { name: 'idx_direct_messages_conv_id', table: 'direct_messages', columns: 'conversation_id' },
      { name: 'idx_direct_messages_created_at', table: 'direct_messages', columns: 'created_at' }
    ];
    for (const idx of chatIndexes) {
      await createIndexIfNotExists(client, idx.name, idx.table, idx.columns);
    }

    // Таблица токенов устройств для push-уведомлений
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id ${getPrimaryKeyType()}${isMySQL ? ` PRIMARY KEY` : ``},
        user_id INTEGER NOT NULL,
        user_type VARCHAR(20) NOT NULL,
        token VARCHAR(500) NOT NULL,
        platform VARCHAR(20) DEFAULT 'android',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(token)
      )
    `);
    await createIndexIfNotExists(client, 'idx_device_tokens_user', 'device_tokens', 'user_id, user_type');

    if (isMySQL) {
      await client.query('COMMIT');
    } else {
      await client.query('COMMIT');
      if (shouldRelease) {
        client.release();
      }
    }
  } catch (error) {
    try {
      if (isMySQL) {
        await client.query('ROLLBACK');
      } else {
        await client.query('ROLLBACK');
        if (shouldRelease) {
          client.release();
        }
      }
    } catch (rollbackError) {
      console.error('Error during rollback:', rollbackError);
    }
    throw error;
  }
}

// Функция-обертка для адаптации SQL запросов под MySQL и PostgreSQL
// connection - опциональный параметр для транзакций (если передан, используется он, иначе pool)
async function dbQuery(sql, params = [], connection = null) {
  const queryExecutor = connection || pool;
  
  if (isMySQL) {
    // Конвертируем PostgreSQL параметры $1, $2, $3 в MySQL параметры ?, ?, ?
    // PostgreSQL позволяет повторно использовать $1, $2 в одном запросе,
    // MySQL требует отдельный ? для каждого использования с дублированием параметров
    let mysqlSql = sql;
    const paramMatches = [...sql.matchAll(/\$(\d+)/g)];
    let mysqlParams = params;
    if (paramMatches.length > 0) {
      // Строим новый массив параметров в порядке появления $N в SQL
      mysqlParams = paramMatches.map(match => params[parseInt(match[1]) - 1]);
      // Заменяем все $N на ? в обратном порядке
      for (let i = paramMatches.length - 1; i >= 0; i--) {
        const match = paramMatches[i];
        mysqlSql = mysqlSql.substring(0, match.index) + '?' + mysqlSql.substring(match.index + match[0].length);
      }
      params = mysqlParams;
    }
    
    // Обрабатываем RETURNING - для MySQL нужно использовать другой подход
    let returningColumns = null;
    const returningIndex = mysqlSql.toUpperCase().indexOf('RETURNING');
    if (returningIndex !== -1) {
      // Извлекаем колонки из RETURNING
      const returningPart = mysqlSql.substring(returningIndex + 9).trim(); // 9 = длина "RETURNING"
      // Убираем точку с запятой в конце, если есть
      const returningPartClean = returningPart.replace(/;?\s*$/, '');
      returningColumns = returningPartClean.split(',').map(col => col.trim());
      
      // Удаляем RETURNING и все после него
      mysqlSql = mysqlSql.substring(0, returningIndex).trim();
      console.log(`[dbQuery] Removed RETURNING clause. Columns: ${returningColumns.join(', ')}`);
      console.log(`[dbQuery] SQL after removal: ${mysqlSql}`);
    }
    
    // Выполняем запрос
    const [rows, fields] = await queryExecutor.query(mysqlSql, params);
    
    // Если был RETURNING в INSERT, получаем вставленную запись
    if (returningColumns && mysqlSql.trim().toUpperCase().startsWith('INSERT')) {
      const insertId = rows.insertId;
      const tableMatch = mysqlSql.match(/INTO\s+`?(\w+)`?/i);
      const tableName = tableMatch ? tableMatch[1] : null;
      if (tableName && insertId) {
        const selectColumns = returningColumns.join(', ');
        try {
          const [insertedRows] = await queryExecutor.query(
            `SELECT ${selectColumns} FROM \`${tableName}\` WHERE id = ?`,
            [insertId]
          );
          const result = { 
            rows: insertedRows.length > 0 ? [insertedRows[0]] : [],
            affectedRows: insertedRows.length > 0 ? 1 : 0
          };
          console.log(`[dbQuery] INSERT with RETURNING (insertId=${insertId}): inserted ${insertedRows.length} row(s) into ${tableName}`, result.rows[0]);
          return result;
        } catch (selectError) {
          console.error(`[dbQuery] Error selecting inserted row from ${tableName}:`, selectError.message);
          return { rows: [{ id: insertId }], affectedRows: 1 };
        }
      } else if (insertId) {
        return { rows: [{ id: insertId }], affectedRows: 1 };
      }
    }
    
    // Нормализуем результат для совместимости с PostgreSQL
    // Для DELETE/UPDATE запросов rows - это ResultSetHeader с affectedRows
    // Для SELECT запросов rows - это массив строк
    const result = { rows: Array.isArray(rows) ? rows : [] };
    
    // Извлекаем affectedRows из ResultSetHeader (для DELETE/UPDATE/INSERT)
    if (rows && typeof rows === 'object' && 'affectedRows' in rows) {
      result.affectedRows = rows.affectedRows;
    } else if (Array.isArray(rows)) {
      // Для SELECT запросов affectedRows = длина массива
      result.affectedRows = rows.length;
    } else {
      result.affectedRows = 0;
    }
    
    return result;
  } else {
    // PostgreSQL - используем как есть
    if (connection) {
      return await connection.query(sql, params);
    } else {
      return await pool.query(sql, params);
    }
  }
}

module.exports = { initDatabase, pool, dbQuery, isMySQL };

