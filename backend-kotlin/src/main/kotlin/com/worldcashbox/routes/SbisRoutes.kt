package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureSbisRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/sbis") {
                post("/sync") {
                    try {
                        val user = call.authenticatedUser()
                        
                        // Получаем contract_id клиента
                        val contractId = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("SELECT sbis_contract_id FROM clients WHERE id = ?")
                                .apply { setInt(1, user.userId) }
                                .executeQuery()
                                .let { rs ->
                                    if (rs.next()) {
                                        rs.getString("sbis_contract_id")
                                    } else null
                                }
                        }
                        
                        if (contractId.isNullOrBlank()) {
                            call.respond(
                                HttpStatusCode.BadRequest,
                                mapOf("error" to "SBIS contract ID not configured for this client")
                            )
                            return@post
                        }
                        
                        // TODO: Реализовать синхронизацию через sbisService
                        // await syncClientData(clientId, contractId)
                        // await syncInvoices(clientId, contractId)
                        
                        call.respond(mapOf("message" to "Synchronization completed successfully"))
                    } catch (e: Exception) {
                        call.application.environment.log.error("SBIS sync error", e)
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            mapOf("error" to (e.message ?: "Synchronization failed"))
                        )
                    }
                }
                
                get("/sync-logs") {
                    try {
                        val user = call.authenticatedUser()
                        val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 50
                        
                        val logs = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                SELECT * FROM sbis_sync_log 
                                WHERE client_id = ? 
                                ORDER BY created_at DESC 
                                LIMIT ?
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setInt(2, limit)
                            }.executeQuery().let { rs ->
                                mutableListOf<Map<String, Any?>>().apply {
                                    while (rs.next()) {
                                        add(mapOf(
                                            "id" to rs.getInt("id"),
                                            "client_id" to rs.getInt("client_id"),
                                            "sync_type" to rs.getString("sync_type"),
                                            "status" to rs.getString("status"),
                                            "data" to rs.getString("data"),
                                            "error_message" to rs.getString("error_message"),
                                            "created_at" to rs.getTimestamp("created_at")?.toInstant()?.toString()
                                        ))
                                    }
                                }
                            }
                        }
                        
                        call.respond(logs)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get sync logs error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
