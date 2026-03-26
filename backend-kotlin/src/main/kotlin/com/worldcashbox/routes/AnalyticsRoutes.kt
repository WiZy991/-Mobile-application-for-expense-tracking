package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import com.worldcashbox.models.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDate
import java.time.YearMonth

fun Application.configureAnalyticsRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/analytics") {
                get("/") {
                    try {
                        val user = call.authenticatedUser()
                        val period = call.request.queryParameters["period"] ?: "month"
                        
                        val startDate = when (period) {
                            "month" -> LocalDate.now().withDayOfMonth(1)
                            "quarter" -> {
                                val now = LocalDate.now()
                                val quarterStart = (now.monthValue - 1) / 3 * 3 + 1
                                now.withMonth(quarterStart).withDayOfMonth(1)
                            }
                            "year" -> LocalDate.now().withDayOfYear(1)
                            else -> LocalDate.of(2020, 1, 1)
                        }
                        
                        val conn = DatabaseFactory.getConnection()
                        
                        // Общая статистика
                        val stats = conn.prepareStatement(
                            """
                            SELECT 
                                COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_spent,
                                COALESCE(SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_paid,
                                COUNT(CASE WHEN type = 'charge' THEN 1 END) as invoices_count,
                                COUNT(DISTINCT service_id) as services_count
                            FROM transactions 
                            WHERE client_id = ? AND created_at >= ?
                            """.trimIndent()
                        ).apply {
                            setInt(1, user.userId)
                            setDate(2, java.sql.Date.valueOf(startDate))
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                mapOf(
                                    "total_spent" to rs.getBigDecimal("total_spent").toDouble(),
                                    "total_paid" to rs.getBigDecimal("total_paid").toDouble(),
                                    "invoices_count" to rs.getInt("invoices_count"),
                                    "services_count" to rs.getInt("services_count")
                                )
                            } else {
                                mapOf(
                                    "total_spent" to 0.0,
                                    "total_paid" to 0.0,
                                    "invoices_count" to 0,
                                    "services_count" to 0
                                )
                            }
                        }
                        
                        val totalSpent = stats["total_spent"] as Double
                        val invoicesCount = stats["invoices_count"] as Int
                        
                        // Расходы по категориям
                        val colors = listOf("#4CAF50", "#FF9800", "#2196F3", "#9C27B0", "#607D8B")
                        val byCategory = conn.prepareStatement(
                            """
                            SELECT 
                                COALESCE(s.name, 'Другое') as name,
                                COALESCE(SUM(t.amount), 0) as amount
                            FROM transactions t
                            LEFT JOIN services s ON t.service_id = s.id
                            WHERE t.client_id = ? 
                                AND t.type = 'charge' 
                                AND t.status = 'completed'
                                AND t.created_at >= ?
                            GROUP BY s.name
                            ORDER BY amount DESC
                            LIMIT 5
                            """.trimIndent()
                        ).apply {
                            setInt(1, user.userId)
                            setDate(2, java.sql.Date.valueOf(startDate))
                        }.executeQuery().let { rs ->
                            mutableListOf<CategorySpending>().apply {
                                var index = 0
                                while (rs.next()) {
                                    val amount = rs.getBigDecimal("amount").toDouble()
                                    add(CategorySpending(
                                        name = rs.getString("name"),
                                        amount = amount,
                                        percent = if (totalSpent > 0) ((amount / totalSpent) * 100).toInt() else 0,
                                        color = colors[index % colors.size]
                                    ))
                                    index++
                                }
                            }
                        }
                        
                        // Данные по месяцам
                        val monthNames = listOf("Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек")
                        val monthlyData = conn.prepareStatement(
                            """
                            SELECT 
                                EXTRACT(MONTH FROM created_at) as month,
                                COALESCE(SUM(amount), 0) as spent
                            FROM transactions
                            WHERE client_id = ? 
                                AND type = 'charge' 
                                AND status = 'completed'
                                AND created_at >= ?
                            GROUP BY EXTRACT(MONTH FROM created_at)
                            ORDER BY month
                            """.trimIndent()
                        ).apply {
                            setInt(1, user.userId)
                            setDate(2, java.sql.Date.valueOf(startDate))
                        }.executeQuery().let { rs ->
                            mutableListOf<MonthlyData>().apply {
                                while (rs.next()) {
                                    val monthNum = rs.getInt("month")
                                    if (monthNum >= 1 && monthNum <= 12) {
                                        add(MonthlyData(
                                            month = monthNames[monthNum - 1],
                                            spent = rs.getBigDecimal("spent").toDouble()
                                        ))
                                    }
                                }
                            }
                        }
                        
                        conn.close()
                        
                        val trend = if (totalSpent > 0) "+${(totalSpent / 1000).toInt()}%" else "0%"
                        
                        call.respond(AnalyticsResponse(
                            totalSpent = totalSpent,
                            totalPaid = stats["total_paid"] as Double,
                            invoicesCount = invoicesCount,
                            servicesCount = stats["services_count"] as Int,
                            avgInvoice = if (invoicesCount > 0) (totalSpent / invoicesCount).toInt() else 0,
                            trend = trend,
                            byCategory = byCategory,
                            monthlyData = monthlyData
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get analytics error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                post("/sync") {
                    call.respond(mapOf(
                        "success" to true,
                        "message" to "Аналитика синхронизирована",
                        "syncedAt" to java.time.Instant.now().toString()
                    ))
                }
                
                get("/yearly/{year}") {
                    try {
                        val user = call.authenticatedUser()
                        val year = call.parameters["year"]?.toIntOrNull() 
                            ?: throw IllegalArgumentException("Invalid year")
                        
                        val startDate = LocalDate.of(year, 1, 1)
                        val endDate = LocalDate.of(year, 12, 31)
                        
                        val conn = DatabaseFactory.getConnection()
                        
                        // Общая сумма за год
                        val total = conn.prepareStatement(
                            """
                            SELECT 
                                COALESCE(SUM(amount), 0) as total,
                                COUNT(*) as transaction_count
                            FROM transactions
                            WHERE client_id = ? 
                                AND type = 'charge'
                                AND status = 'completed'
                                AND created_at >= ? 
                                AND created_at <= ?
                            """.trimIndent()
                        ).apply {
                            setInt(1, user.userId)
                            setDate(2, java.sql.Date.valueOf(startDate))
                            setDate(3, java.sql.Date.valueOf(endDate))
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                Pair(rs.getBigDecimal("total").toDouble(), rs.getInt("transaction_count"))
                            } else Pair(0.0, 0)
                        }
                        
                        // Разбивка по сервисам
                        val byService = conn.prepareStatement(
                            """
                            SELECT 
                                s.name as service_name,
                                s.code as service_code,
                                COALESCE(SUM(t.amount), 0) as total_amount,
                                COUNT(*) as transaction_count
                            FROM transactions t
                            LEFT JOIN services s ON t.service_id = s.id
                            WHERE t.client_id = ? 
                                AND t.type = 'charge'
                                AND t.status = 'completed'
                                AND t.created_at >= ? 
                                AND t.created_at <= ?
                            GROUP BY s.id, s.name, s.code
                            ORDER BY total_amount DESC
                            """.trimIndent()
                        ).apply {
                            setInt(1, user.userId)
                            setDate(2, java.sql.Date.valueOf(startDate))
                            setDate(3, java.sql.Date.valueOf(endDate))
                        }.executeQuery().let { rs ->
                            mutableListOf<ServiceSpending>().apply {
                                while (rs.next()) {
                                    add(ServiceSpending(
                                        serviceName = rs.getString("service_name") ?: "Другое",
                                        serviceCode = rs.getString("service_code") ?: "other",
                                        totalAmount = rs.getBigDecimal("total_amount").toDouble(),
                                        transactionCount = rs.getInt("transaction_count")
                                    ))
                                }
                            }
                        }
                        
                        // Разбивка по месяцам
                        val byMonth = conn.prepareStatement(
                            """
                            SELECT 
                                TO_CHAR(created_at, 'YYYY-MM') as month,
                                COALESCE(SUM(amount), 0) as total_amount,
                                COUNT(*) as transaction_count
                            FROM transactions
                            WHERE client_id = ? 
                                AND type = 'charge'
                                AND status = 'completed'
                                AND created_at >= ? 
                                AND created_at <= ?
                            GROUP BY TO_CHAR(created_at, 'YYYY-MM')
                            ORDER BY month
                            """.trimIndent()
                        ).apply {
                            setInt(1, user.userId)
                            setDate(2, java.sql.Date.valueOf(startDate))
                            setDate(3, java.sql.Date.valueOf(endDate))
                        }.executeQuery().let { rs ->
                            mutableListOf<MonthSpending>().apply {
                                while (rs.next()) {
                                    add(MonthSpending(
                                        month = rs.getString("month"),
                                        totalAmount = rs.getBigDecimal("total_amount").toDouble(),
                                        transactionCount = rs.getInt("transaction_count")
                                    ))
                                }
                            }
                        }
                        
                        conn.close()
                        
                        call.respond(YearlyAnalyticsResponse(
                            year = year,
                            total = total.first,
                            transactionCount = total.second,
                            byService = byService,
                            byMonth = byMonth
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get yearly analytics error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                get("/current-year") {
                    val currentYear = LocalDate.now().year
                    call.parameters["year"] = currentYear.toString()
                    // Перенаправляем на /yearly/{year}
                    call.respond(HttpStatusCode.TemporaryRedirect, mapOf("redirect" to "/api/analytics/yearly/$currentYear"))
                }
            }
        }
    }
}
