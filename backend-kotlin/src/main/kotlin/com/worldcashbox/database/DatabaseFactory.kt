package com.worldcashbox.database

import com.worldcashbox.utils.EnvUtils
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.transactions.transaction
import java.sql.Connection

object DatabaseFactory {
    private var dataSource: HikariDataSource? = null
    
    fun init() {
        val dbHost = EnvUtils.getEnv("DB_HOST") ?: "localhost"
        val dbPort = EnvUtils.getEnvInt("DB_PORT") ?: 3306
        // Используем DB_DATABASE и DB_USERNAME из .env (как указано в файле)
        val dbName = EnvUtils.getEnv("DB_DATABASE") ?: EnvUtils.getEnv("DB_NAME") ?: "wcb-service"
        val dbUser = EnvUtils.getEnv("DB_USERNAME") ?: EnvUtils.getEnv("DB_USER") ?: "wcb-service"
        val dbPassword = EnvUtils.getEnv("DB_PASSWORD") ?: "Wcb12345@!"
        
        val config = HikariConfig().apply {
            jdbcUrl = "jdbc:mysql://$dbHost:$dbPort/$dbName?useSSL=false&serverTimezone=UTC&characterEncoding=utf8"
            driverClassName = "com.mysql.cj.jdbc.Driver"
            username = dbUser
            password = dbPassword
            maximumPoolSize = 10
            minimumIdle = 2
            connectionTimeout = 30000
            idleTimeout = 600000
            maxLifetime = 1800000
        }
        
        dataSource = HikariDataSource(config)
        Database.connect(dataSource!!)
        
        // Проверка подключения
        transaction {
            exec("SELECT NOW()")
        }
        
        println("✅ Database connection established")
        
        // Создание таблиц
        createTables()
        println("✅ Database tables created")
    }
    
    fun checkConnection() {
        transaction {
            exec("SELECT NOW()")
        }
    }
    
    fun getConnection(): Connection {
        return dataSource?.connection ?: throw IllegalStateException("Database not initialized")
    }
    
    private fun createTables() {
        transaction {
            // SQL для MySQL (исправлен синтаксис)
            exec(
                """
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
                """.trimIndent()
            )
            
            // Добавляем колонки если их нет (MySQL синтаксис)
            try {
                exec("ALTER TABLE clients ADD COLUMN inn VARCHAR(12)")
            } catch (e: Exception) {
                // Колонка уже существует
            }
            try {
                exec("ALTER TABLE clients ADD COLUMN kpp VARCHAR(9)")
            } catch (e: Exception) {
                // Колонка уже существует
            }
            try {
                exec("ALTER TABLE clients ADD COLUMN ogrn VARCHAR(15)")
            } catch (e: Exception) {
                // Колонка уже существует
            }
            try {
                exec("ALTER TABLE clients ADD COLUMN company_address TEXT")
            } catch (e: Exception) {
                // Колонка уже существует
            }
            
            // Продолжаем создание остальных таблиц для MySQL
            exec(
                """
                CREATE TABLE IF NOT EXISTS services (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    code VARCHAR(100) UNIQUE NOT NULL,
                    description TEXT,
                    price DECIMAL(10, 2) NOT NULL,
                    billing_period VARCHAR(50) DEFAULT 'monthly',
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """.trimIndent()
            )
            
            exec(
                """
                CREATE TABLE IF NOT EXISTS client_services (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    client_id INT NOT NULL,
                    service_id INT NOT NULL,
                    sbis_service_id VARCHAR(255),
                    start_date DATE NOT NULL,
                    end_date DATE,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """.trimIndent()
            )
            
            exec(
                """
                CREATE TABLE IF NOT EXISTS transactions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
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
                    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                    FOREIGN KEY (service_id) REFERENCES services(id),
                    CHECK (type IN ('charge', 'payment', 'refund')),
                    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'))
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """.trimIndent()
            )
            
            exec(
                """
                CREATE TABLE IF NOT EXISTS notifications (
                    id INT AUTO_INCREMENT PRIMARY KEY,
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
                """.trimIndent()
            )
            
            exec(
                """
                CREATE TABLE IF NOT EXISTS staff (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(50) NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    CHECK (role IN ('manager', 'support'))
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """.trimIndent()
            )
            
            exec(
                """
                CREATE TABLE IF NOT EXISTS subscription_plans (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    code VARCHAR(100) UNIQUE NOT NULL,
                    description TEXT,
                    price DECIMAL(10, 2) NOT NULL,
                    billing_period VARCHAR(50) DEFAULT 'monthly',
                    features JSON NOT NULL,
                    is_popular BOOLEAN DEFAULT false,
                    is_active BOOLEAN DEFAULT true,
                    sort_order INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """.trimIndent()
            )
            
            exec(
                """
                CREATE TABLE IF NOT EXISTS client_subscriptions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    client_id INT NOT NULL,
                    plan_id INT NOT NULL,
                    start_date DATE NOT NULL,
                    end_date DATE NOT NULL,
                    next_billing_date DATE NOT NULL,
                    auto_renewal BOOLEAN DEFAULT true,
                    status VARCHAR(50) DEFAULT 'active',
                    sbis_subscription_id VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
                    CHECK (status IN ('active', 'expired', 'cancelled', 'suspended'))
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """.trimIndent()
            )
            
            // Создаем индексы
            exec("CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)")
            exec("CREATE INDEX IF NOT EXISTS idx_clients_inn ON clients(inn)")
            exec("CREATE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions(client_id)")
            exec("CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)")
            exec("CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON notifications(client_id)")
            exec("CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)")
            
            // Вставка тарифов по умолчанию
            val commonFeatures = """["Диагностика оборудования: Быстрое выявление и устранение", "Ремонт оборудования: Профессиональный ремонт кассовой техники", "Скидка на товары и услуги: Выгодные цены", "Бонусная система: Накапливайте бонусы", "Приоритет задач: Заявки пользователей приложения обрабатываются в первую очередь", "Контроль и мониторинг ресурсов: Своевременное оповещение об окончании срока действия ФН, ОФД, подписок и других важных ресурсов"]"""
            
            // Используем прямой SQL с параметрами через Connection (MySQL синтаксис)
            getConnection().use { conn ->
                conn.prepareStatement(
                    """
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
                    """.trimIndent()
                ).apply {
                    setString(1, commonFeatures)
                    setString(2, commonFeatures)
                    setString(3, commonFeatures)
                    setString(4, commonFeatures)
                }.executeUpdate()
            }
        }
    }
}
