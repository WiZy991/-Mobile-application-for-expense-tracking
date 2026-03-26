package com.example.worldcashbox.data.model

data class Resource(
    val id: Int,
    val type: String, // "fn", "license", "evotor", "atol", "ofd"
    val name: String,
    val description: String?,
    val serialNumber: String?,
    val status: String, // "active", "expired", "expiring_soon"
    val expiryDate: String?,
    val autoRenewal: Boolean
)

data class ResourcesResponse(
    val resources: List<Resource>
)

// Модели для ККТ (Контрольно-кассовая техника)
// Пункт 19: Все поля из документации СБИС ОФД API
data class KKT(
    val factoryId: String?,              // Заводской номер ККТ
    val model: String?,                  // Название модели ККТ
    val fsNumber: String?,               // Заводской номер ФН
    val fsFinishDate: String?,           // Дата окончания срока действия ФН (YYYY-MM-DD)
    val regId: String?,                  // Регистрационный номер ККТ, выданный ФНС
    val status: Int,                     // Статус регистрации ККТ в ОФД
    val organizationName: String?,       // Название организации
    val kktSalesPoint: String?,          // Наименование точки продаж
    val kktSalesPointSPPId: String?,     // Идентификатор точки продаж
    val address: String?,                // Адрес установки ККТ
    val kpp: String?,                    // КПП (код причины постановки)
    val firstShiftDate: String?,        // Дата открытия первой по порядку смены (YYYY-MM-DDThh:mm:ss)
    val licenseStartDate: String?,       // Дата привязки ККТ к лицензии (YYYY-MM-DD)
    val licenseFinishDate: String?       // Дата окончания действия лицензии для ККТ (YYYY-MM-DD)
)

data class KKTsResponse(
    val success: Boolean,
    val data: List<KKT>? = null,
    val count: Int = 0,
    val error: String? = null,
    val details: String? = null,
    val requiresAuth: Boolean? = null
)

// Модели для фискальных накопителей (ФН)
// Пункт 20: Все поля из документации СБИС ОФД API
data class FiscalStorage(
    val storageId: String?,              // Номер фискального накопителя
    val model: String?,                  // Название модели ККТ
    val status: Int,                     // Статус регистрации ФН в ОФД
    val effectiveFrom: String?,        // Время начала работы накопителя (YYYY-MM-DDThh:mm:ss)
    val effectiveTo: String?,           // Время окончания работы накопителя (YYYY-MM-DDThh:mm:ss), отсутствует для действующего
    val fsFinishDate: String?,          // Дата окончания срока действия ФН (YYYY-MM-DD)
    val workDurationDays: Int?,         // Количество дней работы накопителя (вычисляется)
    val daysRemaining: Int?,            // Осталось дней до окончания срока действия (вычисляется)
    val isActive: Boolean                // Активен ли накопитель (вычисляется: !effectiveTo)
)

data class FiscalStoragesResponse(
    val success: Boolean,
    val data: List<FiscalStorage>? = null,
    val count: Int = 0,
    val error: String? = null,
    val details: String? = null
)

// Модели для авторизации в СБИС
data class SBISCredentialsResponse(
    val success: Boolean,
    val data: SBISCredentialsData? = null,
    val error: String? = null
)

data class SBISCredentialsData(
    val login: String? = null,
    val hasPassword: Boolean = false,
    val notes: String? = null
)

data class SaveSBISCredentialsRequest(
    val login: String? = null,
    val password: String? = null,
    val notes: String? = null
)

data class SBISAuthRequest(
    val login: String? = null,
    val password: String? = null
)

data class SBISAuthResponse(
    val success: Boolean,
    val requires2FA: Boolean = false,
    val sid: String? = null,
    val message: String? = null,
    val sessionId: String? = null,
    val resourceId: String? = null,
    val methodToValidate: String? = null,
    val error: String? = null,
    val details: String? = null
)

data class SBIS2FARequest(
    val code: String
)

data class SBIS2FAResponse(
    val success: Boolean,
    val sid: String? = null,
    val message: String? = null,
    val error: String? = null,
    val details: String? = null
)