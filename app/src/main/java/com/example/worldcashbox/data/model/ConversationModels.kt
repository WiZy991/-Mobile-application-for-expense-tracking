package com.example.worldcashbox.data.model

import com.google.gson.annotations.SerializedName

data class Conversation(
    val id: Int,
    val type: String,
    val title: String?,
    @SerializedName("updated_at") val updatedAt: String?,
    @SerializedName("unread_count") val unreadCount: Int = 0,
    @SerializedName("last_message") val lastMessage: String?,
    @SerializedName("last_message_at") val lastMessageAt: String?,
    val participants: List<ConversationParticipant> = emptyList()
)

data class ConversationParticipant(
    @SerializedName("user_id") val userId: Int,
    @SerializedName("user_type") val userType: String,
    val role: String,
    val name: String?
)

data class DirectMessage(
    val id: Int,
    @SerializedName("conversation_id") val conversationId: Int,
    @SerializedName("sender_id") val senderId: Int,
    @SerializedName("sender_type") val senderType: String,
    val message: String,
    @SerializedName("is_read") val isRead: Boolean = false,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("sender_name") val senderName: String?
)

data class ConversationsListResponse(val conversations: List<Conversation>)

data class CreateConversationRequest(
    val clientId: Int? = null,
    val title: String? = null
)

data class CreateConversationResponse(
    val conversationId: Int,
    val existing: Boolean
)

data class ConversationMessagesResponse(val messages: List<DirectMessage>)

data class SendDirectMessageRequest(val message: String)
