package com.example.worldcashbox.data.model

data class SubscriptionPlan(
    val id: Int,
    val name: String,
    val description: String?,
    val price: Double,
    val period: String, // "month", "quarter", "year"
    val features: List<String>?
)

data class Subscription(
    val id: Int,
    val planId: Int,
    val planName: String,
    val status: String, // "active", "cancelled", "expired"
    val startDate: String,
    val endDate: String?,
    val autoRenewal: Boolean,
    val price: Double
)

data class SubscribeRequest(
    val planId: Int
)

data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String
)

data class ChangePasswordResponse(
    val success: Boolean,
    val message: String?
)
