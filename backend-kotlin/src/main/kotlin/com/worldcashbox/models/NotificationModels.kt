package com.worldcashbox.models

import kotlinx.serialization.Serializable

@Serializable
data class Notification(
    val id: Int,
    val clientId: Int,
    val type: String,
    val title: String,
    val message: String,
    val isRead: Boolean,
    val relatedId: Int? = null,
    val relatedType: String? = null,
    val createdAt: String
)

@Serializable
data class UnreadCountResponse(
    val count: Int
)
