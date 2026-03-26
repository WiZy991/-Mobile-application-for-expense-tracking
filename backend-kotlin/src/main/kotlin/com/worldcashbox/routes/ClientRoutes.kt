package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import com.worldcashbox.models.ClientResponse
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.math.BigDecimal

fun Application.configureClientRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/clients") {
                get("/me") {
                    try {
                        val user = call.authenticatedUser()
                        
                        val client = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                SELECT 
                                    id, email, name, phone, balance, inn, kpp, ogrn, 
                                    company_address, sbis_contract_id, created_at, updated_at
                                FROM clients 
                                WHERE id = ?
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    ClientResponse(
                                        id = rs.getInt("id"),
                                        email = rs.getString("email") ?: "",
                                        name = rs.getString("name") ?: "",
                                        phone = rs.getString("phone") ?: "",
                                        balance = (rs.getBigDecimal("balance") ?: BigDecimal.ZERO).toDouble(),
                                        inn = rs.getString("inn") ?: "",
                                        kpp = rs.getString("kpp") ?: "",
                                        ogrn = rs.getString("ogrn") ?: "",
                                        companyAddress = rs.getString("company_address") ?: "",
                                        sbisContractId = rs.getString("sbis_contract_id"),
                                        createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString(),
                                        updatedAt = rs.getTimestamp("updated_at")?.toInstant()?.toString()
                                    )
                                } else null
                            }
                        }
                        
                        if (client == null) {
                            call.respond(
                                HttpStatusCode.NotFound,
                                mapOf("error" to "Client not found")
                            )
                            return@get
                        }
                        
                        call.respond(client)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get client error", e)
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            mapOf("error" to "Internal server error")
                        )
                    }
                }
                
                get("/me/stats") {
                    try {
                        val user = call.authenticatedUser()
                        
                        val stats = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                SELECT 
                                    COALESCE(SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_paid,
                                    COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_spent,
                                    COUNT(CASE WHEN type = 'charge' AND status = 'pending' THEN 1 END) as active_invoices,
                                    COUNT(CASE WHEN type = 'charge' AND status = 'completed' THEN 1 END) as paid_invoices,
                                    COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount
                                FROM transactions 
                                WHERE client_id = ?
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    mapOf(
                                        "totalSpent" to rs.getBigDecimal("total_spent").toDouble(),
                                        "totalPaid" to rs.getBigDecimal("total_paid").toDouble(),
                                        "activeInvoices" to rs.getInt("active_invoices"),
                                        "paidInvoices" to rs.getInt("paid_invoices"),
                                        "pendingAmount" to rs.getBigDecimal("pending_amount").toDouble()
                                    )
                                } else {
                                    mapOf(
                                        "totalSpent" to 0.0,
                                        "totalPaid" to 0.0,
                                        "activeInvoices" to 0,
                                        "paidInvoices" to 0,
                                        "pendingAmount" to 0.0
                                    )
                                }
                            }
                        }
                        
                        val hasTransactions = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("SELECT COUNT(*) as count FROM transactions WHERE client_id = ?").apply {
                                setInt(1, user.userId)
                            }.executeQuery().let { rs ->
                                rs.next() && rs.getInt("count") > 0
                            }
                        }
                        
                        call.respond(stats + ("hasTransactions" to hasTransactions))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get stats error", e)
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            mapOf("error" to "Internal server error")
                        )
                    }
                }
            }
        }
    }
}
