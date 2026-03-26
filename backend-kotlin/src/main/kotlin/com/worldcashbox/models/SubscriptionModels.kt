package com.worldcashbox.models

import kotlinx.serialization.Serializable

@Serializable
data class SubscriptionPlan(
    val id: Int,
    val name: String,
    val code: String,
    val description: String? = null,
    val price: Double,
    val billingPeriod: String,
    val features: List<String> = emptyList(),
    val isPopular: Boolean = false,
    val isActive: Boolean = true,
    val sortOrder: Int = 0
)

@Serializable
data class SubscriptionPlansResponse(
    val plans: List<SubscriptionPlan>
)

@Serializable
data class ClientSubscription(
    val id: Int,
    val clientId: Int,
    val planId: Int,
    val startDate: String,
    val endDate: String,
    val nextBillingDate: String,
    val autoRenewal: Boolean,
    val status: String,
    val planName: String,
    val planCode: String,
    val planDescription: String? = null,
    val planPrice: Double,
    val planBillingPeriod: String,
    val planFeatures: List<String> = emptyList(),
    val daysUntilRenewal: Int
)

@Serializable
data class MySubscriptionsResponse(
    val subscriptions: List<ClientSubscription>
)

@Serializable
data class SubscribeRequest(
    val planId: Int
)

@Serializable
data class SubscribeResponse(
    val success: Boolean,
    val message: String,
    val subscription: ClientSubscription,
    val transaction: TransactionResponse,
    val balance: Double
)
