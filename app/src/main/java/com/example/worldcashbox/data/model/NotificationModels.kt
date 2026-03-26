package com.example.worldcashbox.data.model

data class Notification(
    val id: Int,
    val title: String,
    val message: String,
    val type: String, // 'support', 'service', 'payment_reminder', 'low_balance', etc.
    val isRead: Boolean,
    val relatedId: Int? = null,
    val relatedType: String? = null, // 'ticket', 'service', etc.
    val createdAt: String
)
