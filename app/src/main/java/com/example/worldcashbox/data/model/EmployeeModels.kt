package com.example.worldcashbox.data.model

data class Store(
    val id: Int,
    @com.google.gson.annotations.SerializedName("client_id")
    val clientId: Int,
    val name: String,
    val address: String,
    val phone: String? = null,
    @com.google.gson.annotations.SerializedName("is_active")
    val isActiveRaw: Int? = 1, // MySQL возвращает 0/1, не boolean
    @com.google.gson.annotations.SerializedName("created_at")
    val createdAt: String? = null,
    @com.google.gson.annotations.SerializedName("updated_at")
    val updatedAt: String? = null
) {
    // Computed property для удобства
    val isActive: Boolean
        get() = isActiveRaw == 1
}

data class Employee(
    val id: Int,
    @com.google.gson.annotations.SerializedName("client_id")
    val clientId: Int,
    @com.google.gson.annotations.SerializedName("store_id")
    val storeId: Int? = null,
    val phone: String,
    val name: String? = null,
    val role: String = "employee",
    @com.google.gson.annotations.SerializedName("is_active")
    val isActiveRaw: Int? = 1, // MySQL возвращает 0/1, не boolean
    @com.google.gson.annotations.SerializedName("last_login_at")
    val lastLoginAt: String? = null,
    @com.google.gson.annotations.SerializedName("created_at")
    val createdAt: String? = null,
    @com.google.gson.annotations.SerializedName("updated_at")
    val updatedAt: String? = null,
    @com.google.gson.annotations.SerializedName("store_name")
    val storeName: String? = null,
    @com.google.gson.annotations.SerializedName("store_address")
    val storeAddress: String? = null
) {
    // Computed property для удобства
    val isActive: Boolean
        get() = isActiveRaw == 1
}

data class StoresResponse(
    val stores: List<Store>
)

data class EmployeesResponse(
    val employees: List<Employee>
)

data class AddEmployeeRequest(
    val phone: String,
    val name: String? = null,
    val storeId: Int? = null,
    val role: String = "employee"
)

data class UpdateEmployeeRequest(
    val name: String? = null,
    val storeId: Int? = null,
    val role: String? = null,
    val isActive: Boolean? = null
)

data class AddStoreRequest(
    val name: String,
    val address: String,
    val phone: String? = null
)

data class UpdateStoreRequest(
    val name: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val isActive: Boolean? = null
)

data class EmployeeAuthRequest(
    val phone: String
)

data class EmployeeAuthResponse(
    val token: String,
    val employee: Employee,
    val client: Map<String, Any>
)

data class CreateStoreResponse(
    val store: Store
)

data class UpdateStoreResponse(
    val store: Store
)
