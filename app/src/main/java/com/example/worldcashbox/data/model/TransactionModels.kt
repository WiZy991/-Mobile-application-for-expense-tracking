package com.example.worldcashbox.data.model

data class Transaction(
    val id: Int,
    val type: String, // 'payment', 'charge', or 'service_request'
    val amount: Double,
    val description: String,
    val serviceName: String? = null,
    val service_id: Int? = null,
    val date: String? = null,
    val created_at: String? = null,
    val period: String? = null,
    val status: String? = null,
    // Поля для заявок на услуги
    val item_type: String? = "transaction", // 'transaction' or 'service_request'
    val request_id: Int? = null,
    val invoice_number: String? = null,
    val invoice_url: String? = null,
    val invoice_file_name: String? = null,
    val quantity: Int? = null,
    val price: Double? = null
)

data class TransactionsResponse(
    val transactions: List<Transaction>
)
