package com.example.worldcashbox.data.model

data class AnalyticsResponse(
    val year: Int? = null,
    val totalSpent: Double? = null,
    val totalPaid: Double? = null,
    val invoicesCount: Int? = null,
    val servicesCount: Int? = null,
    val avgInvoice: Double? = null,
    val trend: String? = null,
    val monthlyData: List<MonthlyData>? = null,
    val serviceData: List<ServiceData>? = null,
    val byCategory: List<CategoryData>? = null
)

data class MonthlyData(
    val month: Int? = null,
    val monthName: String? = null,
    val total: Double? = null,
    val spent: Double? = null
)

data class ServiceData(
    val serviceName: String,
    val total: Double
)

data class CategoryData(
    val name: String,
    val amount: Double,
    val percent: Double? = null,
    val color: String? = null
)
