package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import com.worldcashbox.models.*
import com.worldcashbox.models.UserInfo
import com.worldcashbox.utils.JwtUtils
import com.worldcashbox.utils.PasswordUtils
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.math.BigDecimal
import java.time.Instant
import java.util.regex.Pattern

fun Application.configureAuthRoutes() {
    routing {
        route("/api/auth") {
            post("/register") {
                try {
                    val request = call.receive<RegisterRequest>()
                    
                    // Валидация
                    val errors = mutableListOf<String>()
                    
                    if (!isValidEmail(request.email)) {
                        errors.add("Некорректный email")
                    }
                    if (request.password.length < 6) {
                        errors.add("Пароль должен быть не менее 6 символов")
                    }
                    if (request.name.trim().isEmpty()) {
                        errors.add("Имя обязательно для заполнения")
                    }
                    
                    if (errors.isNotEmpty()) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            mapOf("error" to errors.joinToString(", "), "errors" to errors)
                        )
                        return@post
                    }
                    
                    val email = request.email.lowercase().trim()
                    val phone = request.phone?.trim()?.takeIf { it.isNotEmpty() }
                    val inn = request.inn?.trim()?.takeIf { it.isNotEmpty() }
                    
                    // Проверяем, существует ли клиент
                    val existingClient = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement("SELECT id FROM clients WHERE email = ?").apply {
                            setString(1, email)
                        }.executeQuery().next()
                    }
                    
                    if (existingClient) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            mapOf("error" to "Клиент с таким email уже существует")
                        )
                        return@post
                    }
                    
                    // Хешируем пароль
                    val passwordHash = PasswordUtils.hash(request.password)
                    
                    // Создаём клиента
                    val clientId = DatabaseFactory.getConnection().use { conn ->
                        val sql = if (inn != null) {
                            "INSERT INTO clients (email, password_hash, name, phone, inn) VALUES (?, ?, ?, ?, ?) RETURNING id, email, name, balance"
                        } else {
                            "INSERT INTO clients (email, password_hash, name, phone) VALUES (?, ?, ?, ?) RETURNING id, email, name, balance"
                        }
                        
                        conn.prepareStatement(sql).apply {
                            setString(1, email)
                            setString(2, passwordHash)
                            setString(3, request.name.trim())
                            setString(4, phone)
                            if (inn != null) {
                                setString(5, inn)
                            }
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                val id = rs.getInt("id")
                                val token = JwtUtils.generateToken(id, rs.getString("email"))
                                
                                val clientResponse = ClientResponse(
                                    id = id,
                                    email = rs.getString("email"),
                                    name = rs.getString("name"),
                                    balance = rs.getBigDecimal("balance").toDouble()
                                )
                                
                                call.respond(
                                    HttpStatusCode.Created,
                                    AuthResponse(
                                        token = token,
                                        client = clientResponse,
                                        user = UserInfo(
                                            id = id,
                                            email = rs.getString("email"),
                                            name = rs.getString("name"),
                                            type = "client"
                                        )
                                    )
                                )
                                id
                            } else {
                                throw IllegalStateException("Failed to create client")
                            }
                        }
                    }
                } catch (e: Exception) {
                    call.application.environment.log.error("Registration error", e)
                    val errorMessage = if (System.getenv("NODE_ENV") == "development") e.message else "Internal server error"
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        mapOf("error" to errorMessage)
                    )
                }
            }
            
            post("/login") {
                try {
                    val request = call.receive<LoginRequest>()
                    
                    // Валидация
                    if (!isValidEmail(request.email)) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            mapOf("error" to "Некорректный email")
                        )
                        return@post
                    }
                    
                    if (request.password.isEmpty()) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            mapOf("error" to "Пароль обязателен для заполнения")
                        )
                        return@post
                    }
                    
                    val email = request.email.lowercase().trim()
                    
                    // Находим клиента
                    val client = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement("SELECT * FROM clients WHERE email = ?").apply {
                            setString(1, email)
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                Triple(
                                    rs.getInt("id"),
                                    rs.getString("password_hash"),
                                    rs.getBigDecimal("balance")
                                )
                            } else null
                        }
                    }
                    
                    if (client == null) {
                        call.respond(
                            HttpStatusCode.Unauthorized,
                            mapOf("error" to "Invalid email or password")
                        )
                        return@post
                    }
                    
                    val (userId, passwordHash, balance) = client
                    
                    // Проверяем пароль
                    if (!PasswordUtils.verify(request.password, passwordHash)) {
                        call.respond(
                            HttpStatusCode.Unauthorized,
                            mapOf("error" to "Invalid email or password")
                        )
                        return@post
                    }
                    
                    // Получаем данные клиента для ответа
                    val clientData = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement("SELECT id, email, name, balance FROM clients WHERE id = ?").apply {
                            setInt(1, userId)
                        }.executeQuery().let { rs ->
                            if (rs.next()) {
                                ClientResponse(
                                    id = rs.getInt("id"),
                                    email = rs.getString("email"),
                                    name = rs.getString("name"),
                                    balance = rs.getBigDecimal("balance").toDouble()
                                )
                            } else null
                        }
                    }
                    
                    if (clientData == null) {
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            mapOf("error" to "Server error: invalid client data")
                        )
                        return@post
                    }
                    
                    // Генерируем токен
                    val token = JwtUtils.generateToken(userId, email)
                    
                    call.respond(
                        AuthResponse(
                            token = token,
                            client = clientData,
                            user = UserInfo(
                                id = userId,
                                email = email,
                                name = clientData.name,
                                type = "client"
                            )
                        )
                    )
                } catch (e: Exception) {
                    call.application.environment.log.error("Login error", e)
                    val errorMessage = if (System.getenv("NODE_ENV") == "development") e.message else "Internal server error"
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        mapOf("error" to errorMessage)
                    )
                }
            }
            
            authenticate("jwt-auth") {
                put("/change-password") {
                    try {
                        val request = call.receive<ChangePasswordRequest>()
                        val user = call.authenticatedUser()
                        
                        if (request.currentPassword.isEmpty() || request.newPassword.isEmpty()) {
                            call.respond(
                                HttpStatusCode.BadRequest,
                                mapOf("error" to "Текущий и новый пароль обязательны")
                            )
                            return@put
                        }
                        
                        if (request.newPassword.length < 6) {
                            call.respond(
                                HttpStatusCode.BadRequest,
                                mapOf("error" to "Новый пароль должен быть не менее 6 символов")
                            )
                            return@put
                        }
                        
                        // Получаем текущий пароль
                        val currentPasswordHash = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("SELECT password_hash FROM clients WHERE id = ?").apply {
                                setInt(1, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    rs.getString("password_hash")
                                } else null
                            }
                        }
                        
                        if (currentPasswordHash == null) {
                            call.respond(
                                HttpStatusCode.NotFound,
                                mapOf("error" to "Пользователь не найден")
                            )
                            return@put
                        }
                        
                        // Проверяем текущий пароль
                        if (!PasswordUtils.verify(request.currentPassword, currentPasswordHash)) {
                            call.respond(
                                HttpStatusCode.Unauthorized,
                                mapOf("error" to "Неверный текущий пароль")
                            )
                            return@put
                        }
                        
                        // Хешируем новый пароль
                        val newPasswordHash = PasswordUtils.hash(request.newPassword)
                        
                        // Обновляем пароль
                        DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement("UPDATE clients SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").apply {
                                setString(1, newPasswordHash)
                                setInt(2, user.userId)
                            }.executeUpdate()
                        }
                        
                        call.respond(mapOf("success" to true, "message" to "Пароль успешно изменен"))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Change password error", e)
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

private fun isValidEmail(email: String): Boolean {
    val emailPattern = Pattern.compile(
        "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$",
        Pattern.CASE_INSENSITIVE
    )
    return emailPattern.matcher(email).matches()
}
