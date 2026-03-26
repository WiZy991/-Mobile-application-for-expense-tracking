package com.worldcashbox.models

import kotlinx.serialization.Serializable
import java.math.BigDecimal
import java.time.Instant

@Serializable
data class Client(
    val id: Int,
    val email: String,
    val name: String,
    val phone: String? = null,
    val balance: BigDecimal = BigDecimal.ZERO,
    val inn: String? = null,
    val kpp: String? = null,
    val ogrn: String? = null,
    val companyAddress: String? = null,
    val sbisContractId: String? = null,
    val createdAt: Instant? = null,
    val updatedAt: Instant? = null
)

@Serializable
data class ClientResponse(
    val id: Int,
    val email: String,
    val name: String,
    val phone: String = "",
    val balance: Double = 0.0,
    val inn: String = "",
    val kpp: String = "",
    val ogrn: String = "",
    val companyAddress: String = "",
    val sbisContractId: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val name: String,
    val phone: String? = null,
    val inn: String? = null
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class AuthResponse(
    val token: String,
    val client: ClientResponse? = null,
    val user: UserInfo? = null // Для совместимости с Android приложением
)

@Serializable
data class UserInfo(
    val id: Int,
    val email: String,
    val name: String,
    val type: String? = null, // 'client' or 'staff'
    val role: String? = null  // 'support' for staff
)

@Serializable
data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String
)
