package com.worldcashbox.models

import kotlinx.serialization.Serializable

@Serializable
data class AnalyticsResponse(
    val totalSpent: Double,
    val totalPaid: Double,
    val invoicesCount: Int,
    val servicesCount: Int,
    val avgInvoice: Int,
    val trend: String,
    val byCategory: List<CategorySpending>,
    val monthlyData: List<MonthlyData>
)

@Serializable
data class CategorySpending(
    val name: String,
    val amount: Double,
    val percent: Int,
    val color: String
)

@Serializable
data class MonthlyData(
    val month: String,
    val spent: Double
)

@Serializable
data class YearlyAnalyticsResponse(
    val year: Int,
    val total: Double,
    val transactionCount: Int,
    val byService: List<ServiceSpending>,
    val byMonth: List<MonthSpending>
)

@Serializable
data class ServiceSpending(
    val serviceName: String,
    val serviceCode: String,
    val totalAmount: Double,
    val transactionCount: Int
)

@Serializable
data class MonthSpending(
    val month: String,
    val totalAmount: Double,
    val transactionCount: Int
)
