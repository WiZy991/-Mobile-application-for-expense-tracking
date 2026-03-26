package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import com.worldcashbox.models.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureNotificationRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/notifications") {
                get("/unread/count") {
                    try {
                        val user = call.authenticatedUser()
                        
                        val count = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("SELECT COUNT(*) as count FROM notifications WHERE client_id = ? AND is_read = false")
                                .apply { setInt(1, user.userId) }
                                .executeQuery()
                                .let { rs ->
                                    if (rs.next()) {
                                        rs.getInt("count")
                                    } else 0
                                }
                        }
                        
                        call.respond(UnreadCountResponse(count = count))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get unread count error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                get("/") {
                    try {
                        val user = call.authenticatedUser()
                        val isRead = call.request.queryParameters["is_read"]
                        val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 50
                        
                        val queryBuilder = StringBuilder("SELECT * FROM notifications WHERE client_id = ?")
                        val params = mutableListOf<Any>(user.userId)
                        
                        if (isRead != null) {
                            queryBuilder.append(" AND is_read = ?")
                            params.add(isRead == "true")
                        }
                        
                        queryBuilder.append(" ORDER BY created_at DESC LIMIT ?")
                        params.add(limit)
                        
                        val notifications = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(queryBuilder.toString()).apply {
                                params.forEachIndexed { index, param ->
                                    when (param) {
                                        is Int -> setInt(index + 1, param)
                                        is Boolean -> setBoolean(index + 1, param)
                                        else -> setObject(index + 1, param)
                                    }
                                }
                            }.executeQuery().let { rs ->
                                mutableListOf<Notification>().apply {
                                    while (rs.next()) {
                                        add(Notification(
                                            id = rs.getInt("id"),
                                            clientId = rs.getInt("client_id"),
                                            type = rs.getString("type"),
                                            title = rs.getString("title"),
                                            message = rs.getString("message"),
                                            isRead = rs.getBoolean("is_read"),
                                            relatedId = rs.getObject("related_id") as? Int,
                                            relatedType = rs.getString("related_type"),
                                            createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: ""
                                        ))
                                    }
                                }
                            }
                        }
                        
                        call.respond(notifications)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get notifications error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                put("/{id}/read") {
                    try {
                        val user = call.authenticatedUser()
                        val notificationId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid notification ID")
                        
                        val notification = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                "UPDATE notifications SET is_read = true WHERE id = ? AND client_id = ? RETURNING *"
                            ).apply {
                                setInt(1, notificationId)
                                setInt(2, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    Notification(
                                        id = rs.getInt("id"),
                                        clientId = rs.getInt("client_id"),
                                        type = rs.getString("type"),
                                        title = rs.getString("title"),
                                        message = rs.getString("message"),
                                        isRead = rs.getBoolean("is_read"),
                                        relatedId = rs.getObject("related_id") as? Int,
                                        relatedType = rs.getString("related_type"),
                                        createdAt = rs.getTimestamp("created_at")?.toInstant()?.toString() ?: ""
                                    )
                                } else null
                            }
                        }
                        
                        if (notification == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Notification not found"))
                            return@put
                        }
                        
                        call.respond(notification)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Mark notification as read error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                put("/read-all") {
                    try {
                        val user = call.authenticatedUser()
                        
                        DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                "UPDATE notifications SET is_read = true WHERE client_id = ? AND is_read = false"
                            ).apply {
                                setInt(1, user.userId)
                            }.executeUpdate()
                        }
                        
                        call.respond(mapOf("message" to "All notifications marked as read"))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Mark all notifications as read error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
