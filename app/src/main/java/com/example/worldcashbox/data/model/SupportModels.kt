package com.example.worldcashbox.data.model

import com.google.gson.annotations.SerializedName

data class Ticket(
    val id: Int,
    val subject: String,
    val status: String, // "to_do", "in_progress", "in_review", "done", "closed"
    val priority: String, // "low", "normal", "high", "urgent"
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String?,
    @SerializedName("client_name") val clientName: String? = null,
    @SerializedName("client_email") val clientEmail: String? = null,
    @SerializedName("assigned_to") val assignedTo: Int? = null,
    @SerializedName("sbis_task_id") val sbisTaskId: String? = null
)

data class TicketDetail(
    val ticket: Ticket,
    val messages: List<Message>
)

data class Message(
    val id: Int,
    val message: String,
    @SerializedName("user_type") val userType: String, // "client", "support", "staff"
    @SerializedName("user_name") val userName: String?,
    @SerializedName("created_at") val createdAt: String,
    val files: List<MessageFile>? = null,
    val reactions: List<MessageReaction>? = null
)

data class MessageFile(
    val id: Int,
    @SerializedName("file_name") val fileName: String,
    @SerializedName("file_path") val filePath: String?,
    @SerializedName("file_type") val fileType: String?,
    @SerializedName("file_size") val fileSize: Int?,
    @SerializedName("mime_type") val mimeType: String?,
    @SerializedName("file_url") val fileUrl: String? = null
)

data class MessageReaction(
    val id: Int,
    @SerializedName("message_id") val messageId: Int,
    val emoji: String,
    @SerializedName("user_id") val userId: Int,
    @SerializedName("user_type") val userType: String,
    @SerializedName("user_name") val userName: String? = null
)

data class CreateTicketRequest(
    val subject: String,
    val message: String?,
    val priority: String = "normal"
)

data class AddMessageRequest(
    val message: String
)

data class TicketsResponse(
    val tickets: List<Ticket>
)

data class UpdateTicketStatusRequest(
    val status: String // "to_do", "in_progress", "in_review", "done", "closed"
)
