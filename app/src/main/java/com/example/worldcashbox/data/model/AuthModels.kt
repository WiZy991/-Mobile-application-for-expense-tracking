package com.example.worldcashbox.data.model

data class LoginRequest(
    val email: String,
    val password: String
)

data class RegisterRequest(
    val email: String,
    val password: String,
    val name: String,
    val phone: String? = null,
    val inn: String? = null,
    val kpp: String? = null,
    val ogrn: String? = null,
    val companyAddress: String? = null,
    val sbisContractId: String? = null
)

data class AuthResponse(
    val token: String,
    val user: UserInfo? = null
)

data class UserInfo(
    val id: Int,
    val email: String,
    val name: String,
    val type: String? = null, // 'client' or 'staff'
    val role: String? = null  // 'support', 'engineer' for staff
)

data class StaffAuthResponse(
    val token: String,
    val staff: StaffInfo
)

data class StaffInfo(
    val id: Int,
    val email: String,
    val name: String,
    val role: String // 'support', 'engineer', 'manager'
)
