package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedStaff
import com.worldcashbox.middleware.StaffPrincipal
import com.worldcashbox.utils.JwtUtils
import com.worldcashbox.utils.PasswordUtils
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.util.regex.Pattern

@Serializable
data class StaffRegisterRequest(
    val email: String,
    val password: String,
    val name: String,
    val role: String = "support",
    val secretKey: String
)

@Serializable
data class StaffAuthRequest(
    val email: String,
    val password: String
)

@Serializable
data class StaffAuthResponse(
    val token: String,
    val staff: StaffInfo
)

@Serializable
data class StaffInfo(
    val id: Int,
    val name: String,
    val email: String,
    val role: String
)

fun Application.configureStaffRoutes() {
    routing {
        route("/api/staff") {
            post("/register") {
                try {
                    val request = call.receive<StaffRegisterRequest>()
                    
                    // Проверяем секретный ключ
                    val requiredSecretKey = System.getenv("STAFF_REGISTRATION_KEY") ?: "CHANGE_THIS_SECRET_KEY"
                    if (request.secretKey != requiredSecretKey) {
                        call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Неверный секретный ключ для регистрации"))
                        return@post
                    }
                    
                    if (request.email.isBlank() || request.password.isBlank() || request.name.isBlank()) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Email, пароль и имя обязательны"))
                        return@post
                    }
                    
                    if (request.password.length < 6) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Пароль должен быть не менее 6 символов"))
                        return@post
                    }
                    
                    if (request.role != "support") {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Роль должна быть support"))
                        return@post
                    }
                    
                    // Проверяем, существует ли email
                    val existing = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement("SELECT id FROM staff WHERE email = ?")
                            .apply { setString(1, request.email.lowercase().trim()) }
                            .executeQuery().next()
                    }
                    
                    if (existing) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Аккаунт с таким email уже существует"))
                        return@post
                    }
                    
                    // Хешируем пароль
                    val passwordHash = PasswordUtils.hash(request.password)
                    
                    // Создаем аккаунт
                    val staff = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement(
                            """
                            INSERT INTO staff (email, name, password_hash, role, is_active)
                            VALUES (?, ?, ?, ?, true)
                            RETURNING id, email, name, role
                            """.trimIndent()
                        ).apply {
                            setString(1, request.email.lowercase().trim())
                            setString(2, request.name.trim())
                            setString(3, passwordHash)
                            setString(4, request.role)
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                StaffInfo(
                                    id = rs.getInt("id"),
                                    email = rs.getString("email"),
                                    name = rs.getString("name"),
                                    role = rs.getString("role")
                                )
                            } else throw IllegalStateException("Failed to create staff")
                        }
                    }
                    
                    call.respond(mapOf(
                        "success" to true,
                        "message" to "Аккаунт успешно создан",
                        "staff" to staff
                    ))
                } catch (e: Exception) {
                    call.application.environment.log.error("Staff registration error", e)
                    call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                }
            }
            
            post("/auth") {
                try {
                    val request = call.receive<StaffAuthRequest>()
                    
                    val staff = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement(
                            "SELECT id, email, name, password_hash, role FROM staff WHERE email = ? AND is_active = true"
                        ).apply { setString(1, request.email.lowercase().trim()) }
                            .executeQuery().let { rs ->
                                if (rs.next()) {
                                    Triple(
                                        rs.getInt("id"),
                                        rs.getString("password_hash"),
                                        StaffInfo(
                                            id = rs.getInt("id"),
                                            email = rs.getString("email"),
                                            name = rs.getString("name"),
                                            role = rs.getString("role")
                                        )
                                    )
                                } else null
                            }
                    }
                    
                    if (staff == null) {
                        call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Неверный email или пароль"))
                        return@post
                    }
                    
                    val (staffId, passwordHash, staffInfo) = staff
                    
                    if (!PasswordUtils.verify(request.password, passwordHash)) {
                        call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Неверный email или пароль"))
                        return@post
                    }
                    
                    // Генерируем токен
                    val token = JwtUtils.generateToken(staffId, request.email)
                    
                    call.respond(StaffAuthResponse(
                        token = token,
                        staff = staffInfo
                    ))
                } catch (e: Exception) {
                    call.application.environment.log.error("Staff auth error", e)
                    call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                }
            }
            
            authenticate("staff-auth") {
                get("/support/tickets") {
                    try {
                        val staff = call.authenticatedStaff()
                        
                        if (staff.role != "support") {
                            call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Доступ только для отдела поддержки"))
                            return@get
                        }
                        
                        val status = call.request.queryParameters["status"]
                        val assignedTo = call.request.queryParameters["assigned_to"]
                        val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 50
                        val offset = call.request.queryParameters["offset"]?.toIntOrNull() ?: 0
                        
                        val queryBuilder = StringBuilder(
                            """
                            SELECT t.*, c.name as client_name, c.email as client_email, c.phone as client_phone
                            FROM support_tickets t
                            JOIN clients c ON t.client_id = c.id
                            WHERE 1=1
                            """.trimIndent()
                        )
                        
                        val params = mutableListOf<Any>()
                        var paramIndex = 1
                        
                        if (status != null) {
                            queryBuilder.append(" AND t.status = ?")
                            params.add(status)
                        }
                        
                        if (assignedTo == "me") {
                            queryBuilder.append(" AND t.assigned_to = ?")
                            params.add(staff.staffId)
                        } else if (assignedTo == "unassigned") {
                            queryBuilder.append(" AND t.assigned_to IS NULL")
                        }
                        
                        queryBuilder.append(" ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, t.created_at DESC LIMIT ? OFFSET ?")
                        params.add(limit)
                        params.add(offset)
                        
                        val tickets = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(queryBuilder.toString()).apply {
                                params.forEachIndexed { index, param ->
                                    when (param) {
                                        is Int -> setInt(index + 1, param)
                                        is String -> setString(index + 1, param)
                                        else -> setObject(index + 1, param)
                                    }
                                }
                            }.executeQuery().let { rs ->
                                mutableListOf<Map<String, Any?>>().apply {
                                    while (rs.next()) {
                                        add(mapOf(
                                            "id" to rs.getInt("id"),
                                            "client_id" to rs.getInt("client_id"),
                                            "subject" to rs.getString("subject"),
                                            "status" to rs.getString("status"),
                                            "priority" to rs.getString("priority"),
                                            "client_name" to rs.getString("client_name"),
                                            "client_email" to rs.getString("client_email"),
                                            "created_at" to rs.getTimestamp("created_at")?.toInstant()?.toString()
                                        ))
                                    }
                                }
                            }
                        }
                        
                        call.respond(mapOf("tickets" to tickets))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get support tickets error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}

