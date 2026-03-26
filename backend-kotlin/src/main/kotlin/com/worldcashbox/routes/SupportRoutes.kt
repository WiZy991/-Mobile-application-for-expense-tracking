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

fun Application.configureSupportRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/support") {
                post("/tickets") {
                    try {
                        val user = call.authenticatedUser()
                        val request = call.receive<CreateTicketRequest>()
                        
                        if (request.subject.isBlank()) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Тема обязательна"))
                            return@post
                        }
                        
                        val conn = DatabaseFactory.getConnection()
                        conn.autoCommit = false
                        
                        try {
                            // Создаем тикет
                            val ticketId = conn.prepareStatement(
                                """
                                INSERT INTO support_tickets (client_id, subject, message, priority, status)
                                VALUES (?, ?, ?, ?, 'open')
                                RETURNING id, subject, status, priority, created_at
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setString(2, request.subject)
                                setString(3, request.message)
                                setString(4, request.priority)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getInt("id")
                                } else throw IllegalStateException("Failed to create ticket")
                            }
                            
                            // Получаем созданный тикет
                            val ticket = conn.prepareStatement(
                                "SELECT * FROM support_tickets WHERE id = ?"
                            ).apply { setInt(1, ticketId) }
                                .executeQuery().let { rs ->
                                    if (rs.next()) {
                                        Ticket(
                                            id = rs.getInt("id"),
                                            clientId = rs.getInt("client_id"),
                                            subject = rs.getString("subject"),
                                            message = rs.getString("message"),
                                            status = rs.getString("status"),
                                            priority = rs.getString("priority"),
                                            createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: "",
                                            updatedAt = rs.getTimestamp("updated_at")?.toInstant()?.toString()
                                        )
                                    } else throw IllegalStateException("Failed to retrieve ticket")
                                }
                            
                            conn.commit()
                            
                            call.respond(CreateTicketResponse(
                                success = true,
                                ticket = ticket,
                                filesCount = 0 // TODO: Поддержка файлов
                            ))
                        } catch (e: Exception) {
                            conn.rollback()
                            throw e
                        } finally {
                            conn.close()
                        }
                    } catch (e: Exception) {
                        call.application.environment.log.error("Create ticket error", e)
                        val errorMessage = if (System.getenv("NODE_ENV") == "development") e.message else "Internal server error"
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to errorMessage))
                    }
                }
                
                get("/tickets") {
                    try {
                        val user = call.authenticatedUser()
                        
                        val tickets = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                SELECT id, subject, status, priority, created_at, updated_at
                                FROM support_tickets
                                WHERE client_id = ?
                                ORDER BY created_at DESC
                                """.trimIndent()
                            ).apply { setInt(1, user.userId) }
                                .executeQuery().let { rs ->
                                    mutableListOf<Ticket>().apply {
                                        while (rs.next()) {
                                            add(Ticket(
                                                id = rs.getInt("id"),
                                                clientId = user.userId,
                                                subject = rs.getString("subject"),
                                                message = null,
                                                status = rs.getString("status"),
                                                priority = rs.getString("priority"),
                                                createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: "",
                                                updatedAt = rs.getTimestamp("updated_at")?.toInstant()?.toString()
                                            ))
                                        }
                                    }
                                }
                        }
                        
                        call.respond(TicketsResponse(tickets = tickets))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get tickets error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                get("/tickets/{id}") {
                    try {
                        val user = call.authenticatedUser()
                        val ticketId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid ticket ID")
                        
                        val conn = DatabaseFactory.getConnection()
                        
                        // Получаем тикет
                        val ticket = conn.prepareStatement(
                            "SELECT * FROM support_tickets WHERE id = ? AND client_id = ?"
                        ).apply {
                            setInt(1, ticketId)
                            setInt(2, user.userId)
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                TicketWithFiles(
                                    id = rs.getInt("id"),
                                    clientId = rs.getInt("client_id"),
                                    subject = rs.getString("subject"),
                                    message = rs.getString("message"),
                                    status = rs.getString("status"),
                                    priority = rs.getString("priority"),
                                    createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: "",
                                    updatedAt = rs.getTimestamp("updated_at")?.toInstant()?.toString(),
                                    files = emptyList() // TODO: Загрузить файлы
                                )
                            } else null
                        }
                        
                        if (ticket == null) {
                            conn.close()
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тикет не найден"))
                            return@get
                        }
                        
                        // Получаем сообщения
                        val messages = conn.prepareStatement(
                            """
                            SELECT 
                                m.*,
                                CASE 
                                    WHEN m.user_type = 'client' THEN 'Вы'
                                    WHEN m.user_type = 'support' THEN 'Сотрудник поддержки'
                                    WHEN m.user_type = 'staff' THEN 'Сотрудник поддержки'
                                    ELSE 'Система'
                                END as user_name
                            FROM support_messages m
                            WHERE m.ticket_id = ?
                            ORDER BY m.created_at ASC
                            """.trimIndent()
                        ).apply { setInt(1, ticketId) }
                            .executeQuery().let { rs ->
                                mutableListOf<Message>().apply {
                                    while (rs.next()) {
                                        add(Message(
                                            id = rs.getInt("id"),
                                            ticketId = rs.getInt("ticket_id"),
                                            userId = rs.getObject("user_id") as? Int,
                                            userType = rs.getString("user_type"),
                                            message = rs.getString("message"),
                                            createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: "",
                                            userName = rs.getString("user_name"),
                                            files = emptyList() // TODO: Загрузить файлы сообщений
                                        ))
                                    }
                                }
                            }
                        
                        conn.close()
                        
                        call.respond(TicketDetail(
                            ticket = ticket,
                            messages = messages
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get ticket details error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                post("/tickets/{id}/messages") {
                    try {
                        val user = call.authenticatedUser()
                        val ticketId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid ticket ID")
                        val request = call.receive<AddMessageRequest>()
                        
                        if (request.message.isBlank()) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Сообщение обязательно"))
                            return@post
                        }
                        
                        val conn = DatabaseFactory.getConnection()
                        conn.autoCommit = false
                        
                        try {
                            // Проверяем, что тикет принадлежит клиенту
                            val ticketExists = conn.prepareStatement(
                                "SELECT client_id FROM support_tickets WHERE id = ?"
                            ).apply { setInt(1, ticketId) }
                                .executeQuery().next()
                            
                            if (!ticketExists) {
                                conn.rollback()
                                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тикет не найден"))
                                return@post
                            }
                            
                            // Добавляем сообщение
                            conn.prepareStatement(
                                """
                                INSERT INTO support_messages (ticket_id, user_id, user_type, message)
                                VALUES (?, ?, 'client', ?)
                                """.trimIndent()
                            ).apply {
                                setInt(1, ticketId)
                                setInt(2, user.userId)
                                setString(3, request.message)
                            }.executeUpdate()
                            
                            // Обновляем статус тикета
                            conn.prepareStatement(
                                "UPDATE support_tickets SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                            ).apply { setInt(1, ticketId) }
                                .executeUpdate()
                            
                            conn.commit()
                            
                            call.respond(mapOf("success" to true))
                        } catch (e: Exception) {
                            conn.rollback()
                            throw e
                        } finally {
                            conn.close()
                        }
                    } catch (e: Exception) {
                        call.application.environment.log.error("Add message error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
