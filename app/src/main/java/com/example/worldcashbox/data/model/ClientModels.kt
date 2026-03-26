package com.example.worldcashbox.data.model

data class Client(
    val id: Int,
    val email: String,
    val name: String,
    val phone: String?,
    val balance: Double,
    val inn: String? = null,
    val kpp: String? = null,
    val ogrn: String? = null,
    @com.google.gson.annotations.SerializedName("company_address")
    val companyAddress: String? = null,
    @com.google.gson.annotations.SerializedName("sbis_contract_id")
    val sbisContractId: String? = null,
    val oktmo: String? = null,
    val okpo: String? = null,
    val okved: String? = null,
    @com.google.gson.annotations.SerializedName("pf_reg_number")
    val pfRegNumber: String? = null,
    @com.google.gson.annotations.SerializedName("sfr_reg_number")
    val sfrRegNumber: String? = null,
    @com.google.gson.annotations.SerializedName("registration_date")
    val registrationDate: String? = null,
    @com.google.gson.annotations.SerializedName("registration_authority")
    val registrationAuthority: String? = null,
    val director: String? = null,
    @com.google.gson.annotations.SerializedName("created_at")
    val createdAt: String? = null,
    @com.google.gson.annotations.SerializedName("updated_at")
    val updatedAt: String? = null
)

data class ClientUpdateRequest(
    val name: String? = null,
    val phone: String? = null
)

data class BalanceResponse(
    val balance: Double,
    val currency: String = "RUB"
)

data class TopUpRequest(
    val amount: Int
)

data class TopUpResponse(
    val success: Boolean,
    val balance: Double,
    val transaction: Transaction? = null,
    val message: String? = null
)

data class SbisStatus(
    val connected: Boolean? = null,
    val sessionId: String? = null,
    val sppSessionId: String? = null
)

data class ContractorInfoResponse(
    val success: Boolean,
    val inn: String,
    val kpp: String? = null,
    val name: String? = null,
    val legalAddress: String? = null,
    val countryCode: String? = null,
    val branchCode: String? = null,
    val identifier: String? = null,
    val identifiers: List<Map<String, Any>>? = null,
    val ogrnip: String? = null, // ОГРНИП для ИП
    val ogrn: String? = null, // ОГРН для ООО
    val type: String? = null, // 'IP' or 'OOO'
    val error: String? = null,
    val message: String? = null
)