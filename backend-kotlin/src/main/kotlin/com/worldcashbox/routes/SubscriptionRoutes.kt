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
import java.time.temporal.ChronoUnit

fun Application.configureSubscriptionRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/subscriptions") {
                get("/plans") {
                    try {
                        val plans = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                "SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC, price ASC"
                            ).executeQuery().let { rs ->
                                val uniquePlans = mutableMapOf<String, SubscriptionPlan>()
                                while (rs.next()) {
                                    val code = rs.getString("code")
                                    if (!uniquePlans.containsKey(code)) {
                                        val featuresJson = rs.getString("features")
                                        val features = try {
                                            if (featuresJson != null && featuresJson.startsWith("[")) {
                                                // Простой парсинг JSON массива
                                                featuresJson.removeSurrounding("[", "]")
                                                    .split(",")
                                                    .map { it.trim().removeSurrounding("\"") }
                                                    .filter { it.isNotEmpty() }
                                            } else {
                                                emptyList()
                                            }
                                        } catch (e: Exception) {
                                            emptyList()
                                        }
                                        
                                        uniquePlans[code] = SubscriptionPlan(
                                            id = rs.getInt("id"),
                                            name = rs.getString("name"),
                                            code = code,
                                            description = rs.getString("description"),
                                            price = rs.getBigDecimal("price").toDouble(),
                                            billingPeriod = rs.getString("billing_period"),
                                            features = features,
                                            isPopular = rs.getBoolean("is_popular"),
                                            isActive = rs.getBoolean("is_active"),
                                            sortOrder = rs.getInt("sort_order")
                                        )
                                    }
                                }
                                uniquePlans.values.toList()
                            }
                        }
                        
                        call.respond(SubscriptionPlansResponse(plans = plans))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get subscription plans error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                get("/my") {
                    try {
                        val user = call.authenticatedUser()
                        
                        val subscriptions = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                SELECT 
                                    cs.*,
                                    sp.name as plan_name, sp.code as plan_code, sp.description as plan_description,
                                    sp.price as plan_price, sp.billing_period as plan_billing_period, sp.features as plan_features
                                FROM client_subscriptions cs
                                JOIN subscription_plans sp ON cs.plan_id = sp.id
                                WHERE cs.client_id = ?
                                ORDER BY cs.created_at DESC
                                """.trimIndent()
                            ).apply { setInt(1, user.userId) }
                                .executeQuery()
                                .let { rs ->
                                    mutableListOf<ClientSubscription>().apply {
                                        while (rs.next()) {
                                            val featuresJson = rs.getString("plan_features")
                                            val features = try {
                                                if (featuresJson != null && featuresJson.startsWith("[")) {
                                                    featuresJson.removeSurrounding("[", "]")
                                                        .split(",")
                                                        .map { it.trim().removeSurrounding("\"") }
                                                        .filter { it.isNotEmpty() }
                                                } else {
                                                    emptyList()
                                                }
                                            } catch (e: Exception) {
                                                emptyList()
                                            }
                                            
                                            val nextBillingDate = rs.getDate("next_billing_date")?.toLocalDate()
                                            val daysUntilRenewal = if (nextBillingDate != null) {
                                                ChronoUnit.DAYS.between(LocalDate.now(), nextBillingDate).toInt().coerceAtLeast(0)
                                            } else 0
                                            
                                            add(ClientSubscription(
                                                id = rs.getInt("id"),
                                                clientId = rs.getInt("client_id"),
                                                planId = rs.getInt("plan_id"),
                                                startDate = rs.getDate("start_date").toString(),
                                                endDate = rs.getDate("end_date").toString(),
                                                nextBillingDate = rs.getDate("next_billing_date").toString(),
                                                autoRenewal = rs.getBoolean("auto_renewal"),
                                                status = rs.getString("status"),
                                                planName = rs.getString("plan_name"),
                                                planCode = rs.getString("plan_code"),
                                                planDescription = rs.getString("plan_description"),
                                                planPrice = rs.getBigDecimal("plan_price").toDouble(),
                                                planBillingPeriod = rs.getString("plan_billing_period"),
                                                planFeatures = features,
                                                daysUntilRenewal = daysUntilRenewal
                                            ))
                                        }
                                    }
                                }
                        }
                        
                        call.respond(MySubscriptionsResponse(subscriptions = subscriptions))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get my subscriptions error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                post("/subscribe") {
                    try {
                        val user = call.authenticatedUser()
                        val request = call.receive<SubscribeRequest>()
                        
                        if (request.planId <= 0) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "plan_id is required"))
                            return@post
                        }
                        
                        val conn = DatabaseFactory.getConnection()
                        conn.autoCommit = false
                        
                        try {
                            // Получаем тариф
                            val plan = conn.prepareStatement(
                                "SELECT * FROM subscription_plans WHERE id = ? AND is_active = true"
                            ).apply { setInt(1, request.planId) }
                                .executeQuery()
                                .let { rs ->
                                    if (rs.next()) {
                                        mapOf(
                                            "id" to rs.getInt("id"),
                                            "name" to rs.getString("name"),
                                            "price" to rs.getBigDecimal("price"),
                                            "billing_period" to rs.getString("billing_period")
                                        )
                                    } else null
                                }
                            
                            if (plan == null) {
                                conn.rollback()
                                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Subscription plan not found"))
                                return@post
                            }
                            
                            // Получаем данные клиента
                            val clientData = conn.prepareStatement(
                                "SELECT balance, inn, kpp, name FROM clients WHERE id = ? FOR UPDATE"
                            ).apply { setInt(1, user.userId) }
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
                                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Client not found"))
                                return@post
                            }
                            
                            val currentBalance = (clientData["balance"] as BigDecimal).toDouble()
                            val planPrice = (plan["price"] as BigDecimal).toDouble()
                            
                            // Проверяем баланс
                            if (currentBalance < planPrice) {
                                conn.rollback()
                                call.respond(HttpStatusCode.BadRequest, mapOf(
                                    "error" to "Insufficient balance",
                                    "required" to planPrice,
                                    "current" to currentBalance
                                ))
                                return@post
                            }
                            
                            // Вычисляем даты
                            val startDate = LocalDate.now()
                            val billingPeriod = plan["billing_period"] as String
                            val (endDate, nextBillingDate) = when (billingPeriod) {
                                "yearly" -> startDate.plusYears(1) to startDate.plusYears(1)
                                "half_yearly" -> startDate.plusMonths(6) to startDate.plusMonths(6)
                                "quarterly" -> startDate.plusMonths(3) to startDate.plusMonths(3)
                                else -> startDate.plusMonths(1) to startDate.plusMonths(1) // monthly
                            }
                            
                            // Создаем транзакцию
                            val transactionId = conn.prepareStatement(
                                """
                                INSERT INTO transactions (client_id, type, amount, description, status)
                                VALUES (?, 'charge', ?, ?, 'completed')
                                RETURNING id, amount, type, status, created_at
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setBigDecimal(2, BigDecimal.valueOf(planPrice))
                                setString(3, "Подписка: ${plan["name"]}")
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getInt("id")
                                } else throw IllegalStateException("Failed to create transaction")
                            }
                            
                            // Списываем с баланса
                            val newBalance = conn.prepareStatement(
                                "UPDATE clients SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING balance"
                            ).apply {
                                setBigDecimal(1, BigDecimal.valueOf(planPrice))
                                setInt(2, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getBigDecimal("balance").toDouble()
                                } else throw IllegalStateException("Failed to update balance")
                            }
                            
                            // Создаем подписку
                            val subscriptionId = conn.prepareStatement(
                                """
                                INSERT INTO client_subscriptions 
                                (client_id, plan_id, start_date, end_date, next_billing_date, auto_renewal, status)
                                VALUES (?, ?, ?, ?, ?, true, 'active')
                                RETURNING id
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setInt(2, request.planId)
                                setDate(3, java.sql.Date.valueOf(startDate))
                                setDate(4, java.sql.Date.valueOf(endDate))
                                setDate(5, java.sql.Date.valueOf(nextBillingDate))
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getInt("id")
                                } else throw IllegalStateException("Failed to create subscription")
                            }
                            
                            // Получаем полную информацию о подписке для ответа
                            val subscription = conn.prepareStatement(
                                """
                                SELECT 
                                    cs.*, sp.name as plan_name, sp.code as plan_code, sp.description as plan_description,
                                    sp.price as plan_price, sp.billing_period as plan_billing_period, sp.features as plan_features
                                FROM client_subscriptions cs
                                JOIN subscription_plans sp ON cs.plan_id = sp.id
                                WHERE cs.id = ?
                                """.trimIndent()
                            ).apply { setInt(1, subscriptionId) }
                                .executeQuery()
                                .let { rs ->
                                    if (rs.next()) {
                                        val featuresJson = rs.getString("plan_features")
                                        val features = try {
                                            if (featuresJson != null && featuresJson.startsWith("[")) {
                                                featuresJson.removeSurrounding("[", "]")
                                                    .split(",")
                                                    .map { it.trim().removeSurrounding("\"") }
                                                    .filter { it.isNotEmpty() }
                                            } else {
                                                emptyList()
                                            }
                                        } catch (e: Exception) {
                                            emptyList()
                                        }
                                        
                                        val nextBillingDateValue = rs.getDate("next_billing_date")?.toLocalDate()
                                        val daysUntilRenewal = if (nextBillingDateValue != null) {
                                            ChronoUnit.DAYS.between(LocalDate.now(), nextBillingDateValue).toInt().coerceAtLeast(0)
                                        } else 0
                                        
                                        ClientSubscription(
                                            id = rs.getInt("id"),
                                            clientId = rs.getInt("client_id"),
                                            planId = rs.getInt("plan_id"),
                                            startDate = rs.getDate("start_date").toString(),
                                            endDate = rs.getDate("end_date").toString(),
                                            nextBillingDate = rs.getDate("next_billing_date").toString(),
                                            autoRenewal = rs.getBoolean("auto_renewal"),
                                            status = rs.getString("status"),
                                            planName = rs.getString("plan_name"),
                                            planCode = rs.getString("plan_code"),
                                            planDescription = rs.getString("plan_description"),
                                            planPrice = rs.getBigDecimal("plan_price").toDouble(),
                                            planBillingPeriod = rs.getString("plan_billing_period"),
                                            planFeatures = features,
                                            daysUntilRenewal = daysUntilRenewal
                                        )
                                    } else throw IllegalStateException("Failed to retrieve subscription")
                                }
                            
                            // Создаем уведомление
                            conn.prepareStatement(
                                "INSERT INTO notifications (client_id, type, title, message, related_id, related_type) VALUES (?, 'subscription', 'Подписка активирована', ?, ?, 'subscription')"
                            ).apply {
                                setInt(1, user.userId)
                                setString(2, "Подписка \"${plan["name"]}\" успешно активирована")
                                setInt(3, subscriptionId)
                            }.executeUpdate()
                            
                            conn.commit()
                            
                            call.respond(SubscribeResponse(
                                success = true,
                                message = "Подписка успешно активирована",
                                subscription = subscription,
                                transaction = TransactionResponse(
                                    id = transactionId,
                                    amount = planPrice,
                                    type = "charge",
                                    status = "completed",
                                    createdAt = java.time.Instant.now().toString()
                                ),
                                balance = newBalance
                            ))
                        } catch (e: Exception) {
                            conn.rollback()
                            throw e
                        } finally {
                            conn.close()
                        }
                    } catch (e: Exception) {
                        call.application.environment.log.error("Subscribe error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                put("/{id}/cancel") {
                    try {
                        val user = call.authenticatedUser()
                        val subscriptionId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid subscription ID")
                        
                        val subscription = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                UPDATE client_subscriptions 
                                SET status = 'cancelled', auto_renewal = false, updated_at = CURRENT_TIMESTAMP
                                WHERE id = ? AND client_id = ? AND status = 'active'
                                RETURNING *
                                """.trimIndent()
                            ).apply {
                                setInt(1, subscriptionId)
                                setInt(2, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    mapOf(
                                        "id" to rs.getInt("id"),
                                        "status" to rs.getString("status"),
                                        "auto_renewal" to rs.getBoolean("auto_renewal")
                                    )
                                } else null
                            }
                        }
                        
                        if (subscription == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Subscription not found or already cancelled"))
                            return@put
                        }
                        
                        call.respond(mapOf(
                            "success" to true,
                            "subscription" to subscription
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Cancel subscription error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                put("/{id}/auto-renewal") {
                    try {
                        val user = call.authenticatedUser()
                        val subscriptionId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid subscription ID")
                        val request = call.receiveOrNull<Map<String, Boolean>>()
                        val autoRenewal = request?.get("auto_renewal") ?: true
                        
                        val subscription = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                UPDATE client_subscriptions 
                                SET auto_renewal = ?, updated_at = CURRENT_TIMESTAMP
                                WHERE id = ? AND client_id = ?
                                RETURNING *
                                """.trimIndent()
                            ).apply {
                                setBoolean(1, autoRenewal)
                                setInt(2, subscriptionId)
                                setInt(3, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    mapOf(
                                        "id" to rs.getInt("id"),
                                        "auto_renewal" to rs.getBoolean("auto_renewal"),
                                        "status" to rs.getString("status")
                                    )
                                } else null
                            }
                        }
                        
                        if (subscription == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Subscription not found"))
                            return@put
                        }
                        
                        call.respond(mapOf(
                            "success" to true,
                            "subscription" to subscription
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Toggle auto-renewal error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
