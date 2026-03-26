package com.worldcashbox.models

import kotlinx.serialization.Serializable

@Serializable
data class Resource(
    val id: Int,
    val clientId: Int,
    val resourceType: String,
    val resourceName: String,
    val serialNumber: String? = null,
    val model: String? = null,
    val startDate: String? = null,
    val expiryDate: String,
    val renewalPrice: Double,
    val autoRenewal: Boolean,
    val status: String,
    val daysUntilExpiry: Int,
    val calculatedStatus: String? = null
)

@Serializable
data class ResourcesResponse(
    val resources: List<Resource>
)

@Serializable
data class CreateResourceRequest(
    val resourceType: String,
    val resourceName: String,
    val serialNumber: String? = null,
    val model: String? = null,
    val startDate: String? = null,
    val expiryDate: String,
    val renewalPrice: Double? = null,
    val autoRenewal: Boolean? = null,
    val sbisResourceId: String? = null,
    val metadata: Map<String, String>? = null
)

@Serializable
data class CreateResourceResponse(
    val success: Boolean,
    val resource: Resource
)
