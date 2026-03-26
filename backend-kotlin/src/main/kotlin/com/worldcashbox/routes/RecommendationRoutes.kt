package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRecommendationRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/recommendations") {
                get("/") {
                    try {
                        val user = call.authenticatedUser()
                        
                        val conn = DatabaseFactory.getConnection()
                        
                        // Получаем услуги, которые клиент уже покупал
                        val purchasedServices = conn.prepareStatement(
                            """
                            SELECT DISTINCT s.id as service_id, s.name, s.code, MAX(t.created_at) as last_purchase
                            FROM transactions t
                            JOIN services s ON t.service_id = s.id
                            WHERE t.client_id = ? AND t.type = 'charge' AND t.status = 'completed'
                            GROUP BY s.id, s.name, s.code
                            ORDER BY last_purchase DESC
                            LIMIT 10
                            """.trimIndent()
                        ).apply { setInt(1, user.userId) }
                            .executeQuery()
                            .let { rs ->
                                mutableListOf<Map<String, Any>>().apply {
                                    while (rs.next()) {
                                        add(mapOf(
                                            "service_id" to rs.getInt("service_id"),
                                            "name" to rs.getString("name"),
                                            "code" to rs.getString("code")
                                        ))
                                    }
                                }
                            }
                        
                        val purchasedServiceIds = purchasedServices.map { it["service_id"] as Int }
                        
                        // Определяем категории
                        fun getCategoryFromCode(code: String?): String {
                            if (code == null) return "other"
                            return when {
                                code.contains("support") -> "support"
                                code.contains("license") -> "license"
                                code.contains("cloud") -> "cloud"
                                code.contains("service") -> "service"
                                code.contains("reporting") -> "reporting"
                                else -> "other"
                            }
                        }
                        
                        val purchasedCategories = purchasedServices.map { 
                            getCategoryFromCode(it["code"] as? String) 
                        }.distinct()
                        
                        // Получаем активные услуги
                        val activeServiceIds = conn.prepareStatement(
                            "SELECT service_id FROM client_services WHERE client_id = ? AND is_active = true"
                        ).apply { setInt(1, user.userId) }
                            .executeQuery()
                            .let { rs ->
                                mutableListOf<Int>().apply {
                                    while (rs.next()) {
                                        add(rs.getInt("service_id"))
                                    }
                                }
                            }
                        
                        val recommendations = mutableListOf<Map<String, Any>>()
                        
                        // Рекомендации на основе категорий
                        if (purchasedCategories.isNotEmpty()) {
                            val categoryCodes = purchasedCategories.map { "service_${it}%" }
                            val placeholders = categoryCodes.indices.map { "?" }.joinToString(" OR s.code LIKE ")
                            
                            val categoryRecommendations = conn.prepareStatement(
                                """
                                SELECT s.*
                                FROM services s
                                WHERE s.is_active = true
                                  AND s.id NOT IN (${activeServiceIds.joinToString(",") { "?" }})
                                  AND (s.code LIKE $placeholders)
                                ORDER BY s.price ASC
                                LIMIT 5
                                """.trimIndent()
                            ).apply {
                                var index = 1
                                activeServiceIds.forEach { setInt(index++, it) }
                                categoryCodes.forEach { setString(index++, it) }
                            }.executeQuery().let { rs ->
                                mutableListOf<Map<String, Any>>().apply {
                                    while (rs.next()) {
                                        add(mapOf(
                                            "id" to rs.getInt("id"),
                                            "name" to rs.getString("name"),
                                            "description" to rs.getString("description"),
                                            "price" to rs.getBigDecimal("price").toDouble(),
                                            "billing_period" to rs.getString("billing_period"),
                                            "category" to getCategoryFromCode(rs.getString("code")),
                                            "reason" to "Похожие на ваши покупки"
                                        ))
                                    }
                                }
                            }
                            
                            recommendations.addAll(categoryRecommendations)
                        }
                        
                        // Если рекомендаций мало, добавляем популярные
                        if (recommendations.size < 3) {
                            val popularServices = conn.prepareStatement(
                                """
                                SELECT s.*, COUNT(cs.id) as subscribers_count
                                FROM services s
                                LEFT JOIN client_services cs ON s.id = cs.service_id AND cs.is_active = true
                                WHERE s.is_active = true
                                  AND s.id NOT IN (${activeServiceIds.joinToString(",") { "?" }})
                                GROUP BY s.id
                                ORDER BY subscribers_count DESC, s.price ASC
                                LIMIT ${5 - recommendations.size}
                                """.trimIndent()
                            ).apply {
                                var index = 1
                                activeServiceIds.forEach { setInt(index++, it) }
                            }.executeQuery().let { rs ->
                                mutableListOf<Map<String, Any>>().apply {
                                    while (rs.next()) {
                                        val serviceId = rs.getInt("id")
                                        if (!recommendations.any { it["id"] == serviceId }) {
                                            add(mapOf(
                                                "id" to serviceId,
                                                "name" to rs.getString("name"),
                                                "description" to rs.getString("description"),
                                                "price" to rs.getBigDecimal("price").toDouble(),
                                                "billing_period" to rs.getString("billing_period"),
                                                "category" to getCategoryFromCode(rs.getString("code")),
                                                "reason" to "Популярные услуги"
                                            ))
                                        }
                                    }
                                }
                            }
                            
                            recommendations.addAll(popularServices)
                        }
                        
                        conn.close()
                        
                        call.respond(mapOf(
                            "recommendations" to recommendations.take(5),
                            "count" to recommendations.size
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get recommendations error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
