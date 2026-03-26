package com.example.worldcashbox.data.model

import com.google.gson.annotations.SerializedName
import java.io.Serializable

data class Service(
    val id: Int,
    @SerializedName("service_id")
    val serviceId: Int? = null, // Для my-services это service_id
    val name: String,
    val description: String?,
    val price: Double?,
    @SerializedName("billing_period")
    val billingPeriod: String? = null, // "monthly", "yearly", "one_time"
    val category: String? = null, // Категория услуги
    val subcategory: String? = null, // Подкатегория услуги
    @SerializedName("start_date")
    val startDate: String? = null,
    @SerializedName("end_date")
    val endDate: String? = null,
    @SerializedName("is_active")
    val isActive: Boolean? = true,
    val type: String? = "service", // 'service' или 'request'
    // Поля для заявок
    @SerializedName("invoice_number")
    val invoiceNumber: String? = null,
    @SerializedName("invoice_url")
    val invoiceUrl: String? = null,
    @SerializedName("invoice_file_name")
    val invoiceFileName: String? = null,
    val status: String? = null,
    val quantity: Int? = null,
    @SerializedName("total_amount")
    val totalAmount: Double? = null
) : Serializable

// Ответ каталога услуг (для вкладки "Услуги")
data class ServicesCatalogResponse(
    val services: List<Service> = emptyList(),
    val activeServices: List<Int> = emptyList()
)

// Модели для создания сделки в CRM СБИС
data class CreateCRMLeadRequest(
    @SerializedName("serviceName") val serviceName: String,
    @SerializedName("serviceCode") val serviceCode: String,
    val price: Double,
    val count: Int,
    val notes: String? = null,
    @SerializedName("themeName") val themeName: String? = null
)

data class CreateCRMLeadResponse(
    val success: Boolean,
    val data: CRMLeadData? = null,
    val message: String? = null,
    val error: String? = null
)

data class CRMLeadData(
    val documentId: Int? = null,
    val documentUUID: String? = null,
    val reglament: Int? = null,
    val client: Any? = null,
    val contactPerson: Any? = null,
    val notes: String? = null,
    val source: Int? = null,
    val invoice: InvoiceData? = null,
    val invoiceError: String? = null
)

data class InvoiceData(
    val id: String? = null,
    val number: String? = null,
    val date: String? = null,
    val amount: Double? = null,
    val status: String? = null,
    val url: String? = null,
    val fileName: String? = null
)

// Модель заявки на услугу
data class ServiceRequest(
    val id: Int,
    val service_name: String,
    val service_code: String? = null,
    val price: Double,
    val quantity: Int,
    val total_amount: Double,
    val notes: String? = null,
    val status: String,
    val sbis_document_id: Int? = null,
    val sbis_document_uuid: String? = null,
    val invoice_number: String? = null,
    val invoice_url: String? = null,
    val invoice_file_name: String? = null,
    val created_at: String,
    val updated_at: String? = null,
    val type: String? = "request" // 'service' или 'request'
)