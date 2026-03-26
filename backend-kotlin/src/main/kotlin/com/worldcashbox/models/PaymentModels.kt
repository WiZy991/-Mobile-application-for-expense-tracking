package com.worldcashbox.models

import kotlinx.serialization.Serializable

@Serializable
data class Transaction(
    val id: Int,
    val type: String,
    val amount: Double,
    val description: String? = null,
    val serviceName: String? = null,
    val serviceCode: String? = null,
    val periodStart: String? = null,
    val periodEnd: String? = null,
    val status: String,
    val createdAt: String
)

@Serializable
data class PaymentHistoryResponse(
    val transactions: List<Transaction>,
    val pagination: Pagination
)

@Serializable
data class Pagination(
    val page: Int,
    val limit: Int,
    val total: Int,
    val pages: Int,
    val hasMore: Boolean
)

@Serializable
data class TopUpRequest(
    val amount: Double
)

@Serializable
data class TopUpResponse(
    val success: Boolean,
    val balance: Double,
    val transaction: Transaction,
    val message: String
)
