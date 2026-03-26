package com.worldcashbox.models

import kotlinx.serialization.Serializable

@Serializable
data class Service(
    val id: Int,
    val name: String,
    val code: String,
    val description: String? = null,
    val price: Double,
    val billingPeriod: String,
    val isActive: Boolean = true,
    val category: String? = null,
    val icon: String? = null,
    val features: List<String> = emptyList(),
    val popular: Boolean = false
)

@Serializable
data class ServicesResponse(
    val services: List<Service>,
    val activeServices: List<Int>
)

@Serializable
data class SubscribeServiceRequest(
    val price: Double? = null
)

@Serializable
data class SubscribeServiceResponse(
    val success: Boolean,
    val message: String,
    val serviceId: Int,
    val transaction: TransactionResponse,
    val balance: Double,
    val service: ServiceInfo
)

@Serializable
data class TransactionResponse(
    val id: Int,
    val amount: Double,
    val type: String,
    val status: String,
    val createdAt: String
)

@Serializable
data class ServiceInfo(
    val id: Int,
    val name: String,
    val price: Double
)
