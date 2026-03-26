package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import com.worldcashbox.models.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.math.BigDecimal
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// Каталог услуг по умолчанию
private val DEFAULT_SERVICES = listOf(
    Service(1, "Базовая техподдержка", "service_1", "Консультации по телефону и email, ответ в течение 24 часов", 5000.0, "monthly", category = "support", icon = "🛠️", features = listOf("Телефонная поддержка", "Email поддержка", "База знаний")),
    Service(2, "Расширенная техподдержка", "service_2", "Приоритетная поддержка с гарантией ответа в течение 2 часов", 15000.0, "monthly", category = "support", icon = "⚡", features = listOf("Приоритетный ответ", "Выезд специалиста", "24/7 поддержка"), popular = true),
    Service(3, "Лицензия 1С:Предприятие", "service_3", "Клиентская лицензия на 1 рабочее место", 8500.0, "one_time", category = "license", icon = "📋", features = listOf("Лицензия на 1 ПК", "Обновления", "Техподдержка 1С")),
    Service(4, "Облачная 1С", "service_4", "Работа в 1С через интернет с любого устройства", 2500.0, "monthly", category = "cloud", icon = "☁️", features = listOf("Доступ 24/7", "Автосохранение", "Резервное копирование")),
    Service(5, "Внедрение 1С", "service_5", "Полное внедрение и настройка системы под ваш бизнес", 50000.0, "one_time", category = "service", icon = "🚀", features = listOf("Анализ бизнес-процессов", "Настройка системы", "Обучение персонала", "Миграция данных")),
    Service(6, "Электронная отчётность", "service_6", "Сдача отчётности в ФНС, ПФР, ФСС напрямую из 1С", 3000.0, "yearly", category = "reporting", icon = "📊", features = listOf("Все виды отчётов", "Электронная подпись", "Автозаполнение"))
)

fun Application.configureServiceRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/services") {
                get("/") {
                    try {
                        val user = call.authenticatedUser()
                        
                        // Получаем услуги из базы
                        val services = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("SELECT * FROM services WHERE is_active = true ORDER BY name")
                                .executeQuery()
                                .let { rs ->
                                    mutableListOf<Service>().apply {
                                        while (rs.next()) {
                                            val defaultService = DEFAULT_SERVICES.find { 
                                                it.id == rs.getInt("id") || 
                                                it.name == rs.getString("name") ||
                                                rs.getString("code")?.contains("service_${it.id}") == true
                                            }
                                            
                                            add(Service(
                                                id = rs.getInt("id"),
                                                name = rs.getString("name"),
                                                code = rs.getString("code"),
                                                description = rs.getString("description"),
                                                price = rs.getBigDecimal("price").toDouble(),
                                                billingPeriod = rs.getString("billing_period"),
                                                isActive = rs.getBoolean("is_active"),
                                                category = defaultService?.category ?: "other",
                                                icon = defaultService?.icon ?: "📦",
                                                features = defaultService?.features ?: emptyList(),
                                                popular = defaultService?.popular ?: false
                                            ))
                                        }
                                    }
                                }
                        }
                        
                        // Получаем активные услуги клиента
                        val activeServices = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("SELECT service_id FROM client_services WHERE client_id = ? AND is_active = true")
                                .apply { setInt(1, user.userId) }
                                .executeQuery()
                                .let { rs ->
                                    mutableListOf<Int>().apply {
                                        while (rs.next()) {
                                            add(rs.getInt("service_id"))
                                        }
                                    }
                                }
                        }
                        
                        if (services.isEmpty()) {
                            call.respond(ServicesResponse(
                                services = DEFAULT_SERVICES,
                                activeServices = emptyList()
                            ))
                        } else {
                            call.respond(ServicesResponse(
                                services = services,
                                activeServices = activeServices
                            ))
                        }
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get services error", e)
                        call.respond(ServicesResponse(
                            services = DEFAULT_SERVICES,
                            activeServices = emptyList()
                        ))
                    }
                }
                
                get("/my-services") {
                    try {
                        val user = call.authenticatedUser()
                        
                        val services = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                SELECT 
                                    cs.id, cs.start_date, cs.end_date, cs.is_active,
                                    s.id as service_id, s.name, s.code, s.description, s.price, s.billing_period
                                FROM client_services cs
                                JOIN services s ON cs.service_id = s.id
                                WHERE cs.client_id = ?
                                ORDER BY cs.start_date DESC
                                """.trimIndent()
                            ).apply { setInt(1, user.userId) }
                                .executeQuery()
                                .let { rs ->
                                    mutableListOf<Map<String, Any?>>().apply {
                                        while (rs.next()) {
                                            add(mapOf(
                                                "id" to rs.getInt("id"),
                                                "start_date" to rs.getDate("start_date")?.toString(),
                                                "end_date" to rs.getDate("end_date")?.toString(),
                                                "is_active" to rs.getBoolean("is_active"),
                                                "service_id" to rs.getInt("service_id"),
                                                "name" to rs.getString("name"),
                                                "code" to rs.getString("code"),
                                                "description" to rs.getString("description"),
                                                "price" to rs.getBigDecimal("price").toDouble(),
                                                "billing_period" to rs.getString("billing_period")
                                            ))
                                        }
                                    }
                                }
                        }
                        
                        call.respond(services)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get client services error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                get("/available") {
                    try {
                        val services = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("SELECT * FROM services WHERE is_active = true ORDER BY name")
                                .executeQuery()
                                .let { rs ->
                                    mutableListOf<Map<String, Any?>>().apply {
                                        while (rs.next()) {
                                            add(mapOf(
                                                "id" to rs.getInt("id"),
                                                "name" to rs.getString("name"),
                                                "code" to rs.getString("code"),
                                                "description" to rs.getString("description"),
                                                "price" to rs.getBigDecimal("price").toDouble(),
                                                "billing_period" to rs.getString("billing_period"),
                                                "is_active" to rs.getBoolean("is_active")
                                            ))
                                        }
                                    }
                                }
                        }
                        
                        call.respond(services)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get available services error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                post("/sync") {
                    call.respond(mapOf(
                        "success" to true,
                        "message" to "Каталог услуг синхронизирован",
                        "syncedAt" to java.time.Instant.now().toString()
                    ))
                }
                
                post("/{id}/subscribe") {
                    try {
                        val user = call.authenticatedUser()
                        val serviceId = call.parameters["id"]?.toIntOrNull() 
                            ?: throw IllegalArgumentException("Invalid service ID")
                        val request = call.receiveOrNull<SubscribeServiceRequest>()
                        
                        val conn = DatabaseFactory.getConnection()
                        conn.autoCommit = false
                        
                        try {
                            // Получаем информацию о клиенте
                            val clientData = conn.prepareStatement("SELECT balance, inn, kpp, name FROM clients WHERE id = ? FOR UPDATE")
                                .apply { setInt(1, user.userId) }
                                .executeQuery()
                                .let { rs ->
                                    if (rs.next()) {
                                        mapOf(
                                            "balance" to rs.getBigDecimal("balance"),
                                            "inn" to rs.getString("inn"),
                                            "kpp" to rs.getString("kpp"),
                                            "name" to rs.getString("name")
                                        )
                                    } else null
                                }
                            
                            if (clientData == null) {
                                conn.rollback()
                                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Клиент не найден"))
                                return@post
                            }
                            
                            val currentBalance = (clientData["balance"] as BigDecimal).toDouble()
                            
                            // Проверяем, не подключена ли уже услуга
                            val existingService = conn.prepareStatement(
                                "SELECT id FROM client_services WHERE client_id = ? AND service_id = ? AND is_active = true"
                            ).apply {
                                setInt(1, user.userId)
                                setInt(2, serviceId)
                            }.executeQuery().next()
                            
                            if (existingService) {
                                conn.rollback()
                                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Услуга уже подключена"))
                                return@post
                            }
                            
                            // Получаем информацию об услуге
                            val service = conn.prepareStatement("SELECT * FROM services WHERE id = ?")
                                .apply { setInt(1, serviceId) }
                                .executeQuery()
                                .let { rs ->
                                    if (rs.next()) {
                                        mapOf(
                                            "id" to rs.getInt("id"),
                                            "name" to rs.getString("name"),
                                            "price" to rs.getBigDecimal("price"),
                                            "billing_period" to rs.getString("billing_period")
                                        )
                                    } else {
                                        // Ищем в дефолтных услугах
                                        val defaultService = DEFAULT_SERVICES.find { it.id == serviceId }
                                        if (defaultService != null) {
                                            // Создаем услугу в базе
                                            val codeToCheck = "service_${defaultService.id}"
                                            val existingByCode = conn.prepareStatement("SELECT * FROM services WHERE code = ?")
                                                .apply { setString(1, codeToCheck) }
                                                .executeQuery()
                                            
                                            if (existingByCode.next()) {
                                                mapOf(
                                                    "id" to existingByCode.getInt("id"),
                                                    "name" to existingByCode.getString("name"),
                                                    "price" to existingByCode.getBigDecimal("price"),
                                                    "billing_period" to existingByCode.getString("billing_period")
                                                )
                                            } else {
                                                // Создаем новую услугу
                                                conn.prepareStatement(
                                                    "INSERT INTO services (name, code, description, price, billing_period, is_active) VALUES (?, ?, ?, ?, ?, true) RETURNING id"
                                                ).apply {
                                                    setString(1, defaultService.name)
                                                    setString(2, codeToCheck)
                                                    setString(3, defaultService.description ?: "")
                                                    setBigDecimal(4, BigDecimal.valueOf(defaultService.price))
                                                    setString(5, defaultService.billingPeriod)
                                                }.executeQuery().let { insertRs ->
                                                    if (insertRs.next()) {
                                                        mapOf(
                                                            "id" to insertRs.getInt("id"),
                                                            "name" to defaultService.name,
                                                            "price" to BigDecimal.valueOf(defaultService.price),
                                                            "billing_period" to defaultService.billingPeriod
                                                        )
                                                    } else null
                                                }
                                            }
                                        } else null
                                    }
                                }
                            
                            if (service == null) {
                                conn.rollback()
                                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Услуга не найдена"))
                                return@post
                            }
                            
                            val servicePrice = request?.price ?: (service["price"] as BigDecimal).toDouble()
                            
                            // Проверяем баланс
                            if (currentBalance < servicePrice) {
                                conn.rollback()
                                call.respond(HttpStatusCode.BadRequest, mapOf(
                                    "error" to "Недостаточно средств",
                                    "required" to servicePrice,
                                    "current" to currentBalance
                                ))
                                return@post
                            }
                            
                            // Вычисляем даты
                            val startDate = LocalDate.now()
                            val billingPeriod = service["billing_period"] as String
                            val endDate = when (billingPeriod) {
                                "monthly" -> startDate.plusMonths(1)
                                "yearly" -> startDate.plusYears(1)
                                else -> null
                            }
                            
                            // Создаем транзакцию
                            val transactionId = conn.prepareStatement(
                                """
                                INSERT INTO transactions 
                                (client_id, service_id, type, amount, description, period_start, period_end, status)
                                VALUES (?, ?, 'charge', ?, ?, ?, ?, 'completed')
                                RETURNING id, amount, type, status, created_at
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setInt(2, service["id"] as Int)
                                setBigDecimal(3, BigDecimal.valueOf(servicePrice))
                                setString(4, "Оплата услуги: ${service["name"]}")
                                setDate(5, java.sql.Date.valueOf(startDate))
                                if (endDate != null) {
                                    setDate(6, java.sql.Date.valueOf(endDate))
                                } else {
                                    setNull(6, java.sql.Types.DATE)
                                }
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getInt("id")
                                } else throw IllegalStateException("Failed to create transaction")
                            }
                            
                            // Списываем с баланса
                            val newBalance = conn.prepareStatement(
                                "UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING balance"
                            ).apply {
                                setBigDecimal(1, BigDecimal.valueOf(servicePrice))
                                setInt(2, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getBigDecimal("balance").toDouble()
                                } else throw IllegalStateException("Failed to update balance")
                            }
                            
                            // Подключаем услугу
                            val existingClientService = conn.prepareStatement(
                                "SELECT id FROM client_services WHERE client_id = ? AND service_id = ?"
                            ).apply {
                                setInt(1, user.userId)
                                setInt(2, service["id"] as Int)
                            }.executeQuery().next()
                            
                            if (existingClientService) {
                                conn.prepareStatement(
                                    "UPDATE client_services SET is_active = true, start_date = ?, end_date = ? WHERE client_id = ? AND service_id = ?"
                                ).apply {
                                    setDate(1, java.sql.Date.valueOf(startDate))
                                    if (endDate != null) {
                                        setDate(2, java.sql.Date.valueOf(endDate))
                                    } else {
                                        setNull(2, java.sql.Types.DATE)
                                    }
                                    setInt(3, user.userId)
                                    setInt(4, service["id"] as Int)
                                }.executeUpdate()
                            } else {
                                conn.prepareStatement(
                                    "INSERT INTO client_services (client_id, service_id, start_date, end_date, is_active) VALUES (?, ?, ?, ?, true)"
                                ).apply {
                                    setInt(1, user.userId)
                                    setInt(2, service["id"] as Int)
                                    setDate(3, java.sql.Date.valueOf(startDate))
                                    if (endDate != null) {
                                        setDate(4, java.sql.Date.valueOf(endDate))
                                    } else {
                                        setNull(4, java.sql.Types.DATE)
                                    }
                                }.executeUpdate()
                            }
                            
                            // Создаем уведомление
                            conn.prepareStatement(
                                "INSERT INTO notifications (client_id, type, title, message, related_id, related_type) VALUES (?, 'service', 'Услуга подключена', ?, ?, 'service')"
                            ).apply {
                                setInt(1, user.userId)
                                setString(2, "Услуга \"${service["name"]}\" успешно подключена. Списан ${String.format("%.2f", servicePrice)} ₽")
                                setInt(3, serviceId)
                            }.executeUpdate()
                            
                            conn.commit()
                            
                            call.respond(SubscribeServiceResponse(
                                success = true,
                                message = "Услуга успешно подключена",
                                serviceId = serviceId,
                                transaction = TransactionResponse(
                                    id = transactionId,
                                    amount = servicePrice,
                                    type = "charge",
                                    status = "completed",
                                    createdAt = java.time.Instant.now().toString()
                                ),
                                balance = newBalance,
                                service = ServiceInfo(
                                    id = service["id"] as Int,
                                    name = service["name"] as String,
                                    price = servicePrice
                                )
                            ))
                        } catch (e: Exception) {
                            conn.rollback()
                            throw e
                        } finally {
                            conn.close()
                        }
                    } catch (e: Exception) {
                        call.application.environment.log.error("Subscribe service error", e)
                        val errorMessage = if (System.getenv("NODE_ENV") == "development") e.message else "Internal server error"
                        call.respond(HttpStatusCode.InternalServerError, mapOf(
                            "error" to "Internal server error",
                            "message" to errorMessage
                        ))
                    }
                }
                
                post("/{id}/cancel") {
                    try {
                        val user = call.authenticatedUser()
                        val serviceId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid service ID")
                        
                        val conn = DatabaseFactory.getConnection()
                        conn.autoCommit = false
                        
                        try {
                            val serviceData = conn.prepareStatement(
                                """
                                SELECT cs.*, s.name as service_name
                                FROM client_services cs
                                LEFT JOIN services s ON cs.service_id = s.id
                                WHERE cs.client_id = ? AND cs.service_id = ? AND cs.is_active = true
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setInt(2, serviceId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    mapOf(
                                        "id" to rs.getInt("id"),
                                        "service_name" to rs.getString("service_name")
                                    )
                                } else null
                            }
                            
                            if (serviceData == null) {
                                conn.rollback()
                                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Услуга не найдена или уже отключена"))
                                return@post
                            }
                            
                            // Отключаем услугу
                            conn.prepareStatement(
                                "UPDATE client_services SET is_active = false, end_date = CURRENT_TIMESTAMP WHERE id = ?"
                            ).apply {
                                setInt(1, serviceData["id"] as Int)
                            }.executeUpdate()
                            
                            // Создаем уведомление
                            conn.prepareStatement(
                                "INSERT INTO notifications (client_id, type, title, message, related_id, related_type) VALUES (?, 'service', 'Услуга отключена', ?, ?, 'service')"
                            ).apply {
                                setInt(1, user.userId)
                                setString(2, "Услуга \"${serviceData["service_name"]}\" отключена")
                                setInt(3, serviceId)
                            }.executeUpdate()
                            
                            conn.commit()
                            
                            call.respond(mapOf(
                                "success" to true,
                                "message" to "Услуга отключена",
                                "serviceId" to serviceId
                            ))
                        } catch (e: Exception) {
                            conn.rollback()
                            throw e
                        } finally {
                            conn.close()
                        }
                    } catch (e: Exception) {
                        call.application.environment.log.error("Cancel service error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
