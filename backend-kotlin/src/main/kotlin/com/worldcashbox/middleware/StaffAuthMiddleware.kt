package com.worldcashbox.middleware

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.utils.JwtUtils
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.response.*
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import java.nio.charset.StandardCharsets

data class StaffPrincipal(val staffId: Int, val role: String, val email: String, val name: String)

fun Application.configureStaffAuth() {
    val jwtSecret = com.worldcashbox.utils.EnvUtils.requireEnv("JWT_SECRET")
    
    install(Authentication) {
        jwt("staff-auth") {
            realm = "WorldCashBox Staff"
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
                    val role = credential.payload.get("role", String::class.java)
                    
                    // Проверяем, что это сотрудник
                    val staff = DatabaseFactory.getConnection().use { conn ->
                        conn.prepareStatement("SELECT id, role, email, name, is_active FROM staff WHERE id = ?")
                            .apply { setInt(1, userId) }
                            .executeQuery()
                            .let { rs ->
                                if (rs.next() && rs.getBoolean("is_active")) {
                                    StaffPrincipal(
                                        staffId = rs.getInt("id"),
                                        role = rs.getString("role"),
                                        email = rs.getString("email"),
                                        name = rs.getString("name")
                                    )
                                } else null
                            }
                    }
                    
                    staff
                } catch (e: Exception) {
                    null
                }
            }
        }
    }
}

suspend fun ApplicationCall.authenticatedStaff(): StaffPrincipal {
    return principal<StaffPrincipal>() ?: throw IllegalStateException("Staff not authenticated")
}
