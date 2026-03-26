package com.worldcashbox.middleware

import com.worldcashbox.database.DatabaseFactory
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.response.*
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import java.nio.charset.StandardCharsets
import java.util.*

data class UserPrincipal(val userId: Int, val email: String, val name: String, val balance: java.math.BigDecimal)

fun Application.configureAuth() {
    val jwtSecret = com.worldcashbox.utils.EnvUtils.requireEnv("JWT_SECRET")
    val jwtExpiresIn = com.worldcashbox.utils.EnvUtils.getEnv("JWT_EXPIRES_IN") ?: "7d"
    
    install(Authentication) {
        jwt("jwt-auth") {
            realm = "WorldCashBox"
            verifier {
                try {
                    Jwts.parserBuilder()
                        .setSigningKey(Keys.hmacShaKeyFor(jwtSecret.toByteArray(StandardCharsets.UTF_8)))
                        .build()
                        .parseClaimsJws(it)
                        .body
                } catch (e: Exception) {
                    null
                }
            }
            validate { credential ->
                try {
                    val userId = credential.payload.get("userId", Int::class.java)
                    val email = credential.payload.get("email", String::class.java)
                    
                    // Проверяем, что клиент существует
                    val client = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement("SELECT id, email, name, balance FROM clients WHERE id = ?")
                            .apply {
                                setInt(1, userId)
                            }
                            .executeQuery()
                            .let { rs ->
                                if (rs.next()) {
                                    UserPrincipal(
                                        rs.getInt("id"),
                                        rs.getString("email"),
                                        rs.getString("name"),
                                        rs.getBigDecimal("balance")
                                    )
                                } else null
                            }
                    }
                    
                    client
                } catch (e: Exception) {
                    null
                }
            }
        }
    }
}

suspend fun ApplicationCall.authenticatedUser(): UserPrincipal {
    return principal<UserPrincipal>() ?: throw IllegalStateException("User not authenticated")
}
