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

fun Application.configurePaymentRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/payments") {
                get("/history") {
                    try {
                        val user = call.authenticatedUser()
                        val page = call.request.queryParameters["page"]?.toIntOrNull() ?: 1
                        val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 50
                        val type = call.request.queryParameters["type"]
                        val startDate = call.request.queryParameters["start_date"]
                        val endDate = call.request.queryParameters["end_date"]
                        val offset = (page - 1) * limit
                        
                        val conn = DatabaseFactory.getConnection()
                        
                        // Строим запрос
                        val queryBuilder = StringBuilder(
                            """
                            SELECT 
                                t.id, t.type, t.amount, t.description, t.period_start, t.period_end,
                                t.status, t.created_at,
                                s.name as service_name, s.code as service_code
                            FROM transactions t
                            LEFT JOIN services s ON t.service_id = s.id
                            WHERE t.client_id = ?
                            """.trimIndent()
                        )
                        
                        val params = mutableListOf<Any>(user.userId)
                        var paramIndex = 2
                        
                        if (type != null) {
                            queryBuilder.append(" AND t.type = ?")
                            params.add(type)
                        }
                        
                        if (startDate != null) {
                            queryBuilder.append(" AND t.created_at >= ?")
                            params.add(startDate)
                        }
                        
                        if (endDate != null) {
                            queryBuilder.append(" AND t.created_at <= ?")
                            params.add(endDate)
                        }
                        
                        queryBuilder.append(" ORDER BY t.created_at DESC LIMIT ? OFFSET ?")
                        params.add(limit)
                        params.add(offset)
                        
                        val transactions = conn.prepareStatement(queryBuilder.toString()).apply {
                            params.forEachIndexed { index, param ->
                                when (param) {
                                    is Int -> setInt(index + 1, param)
                                    is String -> setString(index + 1, param)
                                    else -> setObject(index + 1, param)
                                }
                            }
                        }.executeQuery().let { rs ->
                            mutableListOf<Transaction>().apply {
                                while (rs.next()) {
                                    add(Transaction(
                                        id = rs.getInt("id"),
                                        type = rs.getString("type"),
                                        amount = rs.getBigDecimal("amount").toDouble(),
                                        description = rs.getString("description"),
                                        serviceName = rs.getString("service_name"),
                                        serviceCode = rs.getString("service_code"),
                                        periodStart = rs.getDate("period_start")?.toString(),
                                        periodEnd = rs.getDate("period_end")?.toString(),
                                        status = rs.getString("status") ?: "pending",
                                        createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: ""
                                    ))
                                }
                            }
                        }
                        
                        // Получаем общее количество
                        val countQuery = if (type != null) {
                            "SELECT COUNT(*) as total FROM transactions WHERE client_id = ? AND type = ?"
                        } else {
                            "SELECT COUNT(*) as total FROM transactions WHERE client_id = ?"
                        }
                        
                        val total = conn.prepareStatement(countQuery).apply {
                            setInt(1, user.userId)
                            if (type != null) {
                                setString(2, type)
                            }
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                rs.getInt("total")
                            } else 0
                        }
                        
                        conn.close()
                        
                        call.respond(PaymentHistoryResponse(
                            transactions = transactions,
                            pagination = Pagination(
                                page = page,
                                limit = limit,
                                total = total,
                                pages = (total + limit - 1) / limit,
                                hasMore = total > (page * limit)
                            )
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get payment history error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                get("/{id}") {
                    try {
                        val user = call.authenticatedUser()
                        val transactionId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid transaction ID")
                        
                        val transaction = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                SELECT 
                                    t.*, s.name as service_name, s.code as service_code, s.description as service_description
                                FROM transactions t
                                LEFT JOIN services s ON t.service_id = s.id
                                WHERE t.id = ? AND t.client_id = ?
                                """.trimIndent()
                            ).apply {
                                setInt(1, transactionId)
                                setInt(2, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    mapOf(
                                        "id" to rs.getInt("id"),
                                        "type" to rs.getString("type"),
                                        "amount" to rs.getBigDecimal("amount").toDouble(),
                                        "description" to rs.getString("description"),
                                        "service_name" to rs.getString("service_name"),
                                        "service_code" to rs.getString("service_code"),
                                        "service_description" to rs.getString("service_description"),
                                        "period_start" to rs.getDate("period_start")?.toString(),
                                        "period_end" to rs.getDate("period_end")?.toString(),
                                        "status" to rs.getString("status"),
                                        "created_at" to rs.getTimestamp("created_at")?.toInstant()?.toString()
                                    )
                                } else null
                            }
                        }
                        
                        if (transaction == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Transaction not found"))
                            return@get
                        }
                        
                        call.respond(transaction)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get transaction error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                post("/topup") {
                    try {
                        val user = call.authenticatedUser()
                        val request = call.receive<TopUpRequest>()
                        
                        if (request.amount < 100) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Минимальная сумма пополнения - 100 ₽"))
                            return@post
                        }
                        
                        if (request.amount > 1000000) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Максимальная сумма пополнения - 1 000 000 ₽"))
                            return@post
                        }
                        
                        val conn = DatabaseFactory.getConnection()
                        conn.autoCommit = false
                        
                        try {
                            // Обновляем баланс
                            val newBalance = conn.prepareStatement(
                                "UPDATE clients SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING balance"
                            ).apply {
                                setBigDecimal(1, BigDecimal.valueOf(request.amount))
                                setInt(2, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getBigDecimal("balance").toDouble()
                                } else {
                                    conn.rollback()
                                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Клиент не найден"))
                                    return@post
                                }
                            }
                            
                            // Создаем транзакцию
                            val transaction = conn.prepareStatement(
                                """
                                INSERT INTO transactions (client_id, type, amount, description, status)
                                VALUES (?, 'payment', ?, 'Пополнение баланса', 'completed')
                                RETURNING id, type, amount, description, status, created_at
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setBigDecimal(2, BigDecimal.valueOf(request.amount))
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    Transaction(
                                        id = rs.getInt("id"),
                                        type = rs.getString("type"),
                                        amount = rs.getBigDecimal("amount").toDouble(),
                                        description = rs.getString("description"),
                                        status = rs.getString("status"),
                                        createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: ""
                                    )
                                } else throw IllegalStateException("Failed to create transaction")
                            }
                            
                            conn.commit()
                            
                            call.respond(TopUpResponse(
                                success = true,
                                balance = newBalance,
                                transaction = transaction,
                                message = "Баланс успешно пополнен"
                            ))
                        } catch (e: Exception) {
                            conn.rollback()
                            throw e
                        } finally {
                            conn.close()
                        }
                    } catch (e: Exception) {
                        call.application.environment.log.error("Top up error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                post("/sync") {
                    call.respond(mapOf(
                        "success" to true,
                        "message" to "Платежи синхронизированы",
                        "syncedAt" to java.time.Instant.now().toString()
                    ))
                }
            }
        }
    }
}
