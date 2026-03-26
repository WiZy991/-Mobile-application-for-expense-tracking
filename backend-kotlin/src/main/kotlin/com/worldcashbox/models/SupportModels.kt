package com.worldcashbox.models

import kotlinx.serialization.Serializable

@Serializable
data class CreateTicketRequest(
    val subject: String,
    val message: String? = null,
    val priority: String = "normal"
)

@Serializable
data class CreateTicketResponse(
    val success: Boolean,
    val ticket: Ticket,
    val filesCount: Int = 0
)

@Serializable
data class Ticket(
    val id: Int,
    val clientId: Int,
    val subject: String,
    val message: String? = null,
    val status: String,
    val priority: String,
    val createdAt: String,
    val updatedAt: String? = null
)

@Serializable
data class TicketDetail(
    val ticket: TicketWithFiles,
    val messages: List<Message>
)

@Serializable
data class TicketWithFiles(
    val id: Int,
    val clientId: Int,
    val subject: String,
    val message: String? = null,
    val status: String,
    val priority: String,
    val createdAt: String,
    val updatedAt: String? = null,
    val files: List<TicketFile> = emptyList()
)

@Serializable
data class Message(
    val id: Int,
    val ticketId: Int,
    val userId: Int? = null,
    val userType: String,
    val message: String,
    val createdAt: String,
    val userName: String? = null,
    val files: List<TicketFile> = emptyList()
)

@Serializable
data class TicketFile(
    val id: Int,
    val ticketId: Int,
    val messageId: Int? = null,
    val fileName: String,
    val filePath: String,
    val fileType: String,
    val fileSize: Int,
    val mimeType: String? = null,
    val uploadedAt: String
)

@Serializable
data class AddMessageRequest(
    val message: String
)

@Serializable
data class TicketsResponse(
    val tickets: List<Ticket>
)
