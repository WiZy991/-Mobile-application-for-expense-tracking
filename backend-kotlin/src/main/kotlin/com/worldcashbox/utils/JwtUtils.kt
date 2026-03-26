package com.worldcashbox.utils

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import java.nio.charset.StandardCharsets
import java.util.*

object JwtUtils {
    private val jwtSecret: String = EnvUtils.requireEnv("JWT_SECRET")
    private val jwtExpiresIn: String = EnvUtils.getEnv("JWT_EXPIRES_IN") ?: "7d"
    
    fun generateToken(userId: Int, email: String): String {
        val expirationTime = when (jwtExpiresIn) {
            "7d" -> Date(System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000L)
            "30d" -> Date(System.currentTimeMillis() + 30 * 24 * 60 * 60 * 1000L)
            else -> Date(System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000L)
        }
        
        return Jwts.builder()
            .setSubject(userId.toString())
            .claim("userId", userId)
            .claim("email", email)
            .setExpiration(expirationTime)
            .setIssuedAt(Date())
            .signWith(Keys.hmacShaKeyFor(jwtSecret.toByteArray(StandardCharsets.UTF_8)))
            .compact()
    }
}
