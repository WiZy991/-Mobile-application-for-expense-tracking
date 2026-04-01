package com.example.worldcashbox.data.api

import com.example.worldcashbox.data.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    
    // Auth
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
    
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>
    
    // Staff Auth
    @POST("staff/auth")
    suspend fun staffLogin(@Body request: LoginRequest): Response<StaffAuthResponse>
    
    // Client
    @GET("clients/me")
    suspend fun getClientInfo(): Response<Client>
    
    @PUT("clients/me")
    suspend fun updateClientInfo(@Body client: ClientUpdateRequest): Response<Client>
    
    @POST("clients/sync")
    suspend fun syncClientData(): Response<Map<String, Any>>
    
    @GET("clients/balance")
    suspend fun getBalance(): Response<BalanceResponse>
    
    @POST("payments/topup")
    suspend fun topUpBalance(@Body request: TopUpRequest): Response<TopUpResponse>
    
    @GET("clients/me/stats")
    suspend fun getClientStats(): Response<Map<String, Any>>
    
    // Transactions
    @GET("payments/history")
    suspend fun getTransactionHistory(@Query("limit") limit: Int? = null): Response<TransactionsResponse>
    
    @GET("payments/{id}")
    suspend fun getTransaction(@Path("id") id: Int): Response<Transaction>
    
    // Services
    @GET("services/my-services")
    suspend fun getMyServices(): Response<List<Service>>
    
    @GET("services/requests/{id}")
    suspend fun getServiceRequest(@Path("id") id: Int): Response<ServiceRequest>
    
    @POST("sbis-crm/sync-requests")
    suspend fun syncServiceRequests(): Response<Map<String, Any>>
    
    @POST("services/{id}/cancel")
    suspend fun cancelService(@Path("id") id: Int): Response<Map<String, Any>>
    
    // Каталог услуг для вкладки "Услуги"
    @GET("services")
    suspend fun getAvailableServices(): Response<ServicesCatalogResponse>
    
    // Синхронизация услуг из СБИС
    @POST("services/sync")
    suspend fun syncServicesFromSBIS(): Response<Map<String, Any>>
    
    // Analytics
    @GET("analytics")
    suspend fun getAnalytics(@Query("period") period: String = "month"): Response<AnalyticsResponse>
    
    @POST("analytics/sync")
    suspend fun syncAnalytics(): Response<Map<String, Any>>
    
    @GET("analytics/current-year")
    suspend fun getCurrentYearAnalytics(): Response<AnalyticsResponse>
    
    @GET("analytics/yearly/{year}")
    suspend fun getYearlyAnalytics(@Path("year") year: Int): Response<AnalyticsResponse>
    
    // Notifications
    @GET("notifications")
    suspend fun getNotifications(): Response<List<Notification>>
    
    @PUT("notifications/{id}/read")
    suspend fun markNotificationAsRead(@Path("id") id: Int): Response<Unit>
    
    @PUT("notifications/read-all")
    suspend fun markAllNotificationsAsRead(): Response<Unit>

    @POST("notifications/push-token")
    suspend fun registerPushToken(@Body request: PushTokenRequest): Response<Map<String, Any>>

    @HTTP(method = "DELETE", path = "notifications/push-token", hasBody = true)
    suspend fun unregisterPushToken(@Body request: PushTokenRequest): Response<Map<String, Any>>
    
    // Subscriptions
    @GET("subscriptions/plans")
    suspend fun getSubscriptionPlans(): Response<Map<String, List<SubscriptionPlan>>>
    
    @GET("subscriptions/my")
    suspend fun getMySubscriptions(): Response<Map<String, List<Subscription>>>
    
    @POST("subscriptions/subscribe")
    suspend fun subscribe(@Body request: SubscribeRequest): Response<Map<String, Any>>
    
    @PUT("subscriptions/{id}/cancel")
    suspend fun cancelSubscription(@Path("id") id: Int): Response<Map<String, Any>>
    
    @PUT("subscriptions/{id}/auto-renewal")
    suspend fun toggleAutoRenewal(@Path("id") id: Int, @Body request: Map<String, Boolean>): Response<Map<String, Any>>
    
    // Resources
    @GET("resources")
    suspend fun getResources(): Response<ResourcesResponse>
    
    // SBIS
    @GET("sbis-proxy/status")
    suspend fun getSbisStatus(): Response<SbisStatus>
    
    // Support
    @GET("support/tickets")
    suspend fun getTickets(): Response<TicketsResponse>
    
    @GET("support/tickets/{id}")
    suspend fun getTicketDetail(@Path("id") id: Int): Response<TicketDetail>
    
    @POST("support/tickets")
    suspend fun createTicket(@Body request: CreateTicketRequest): Response<Map<String, Any>>
    
    @Multipart
    @POST("support/tickets")
    suspend fun createTicketWithFiles(
        @Part("subject") subject: RequestBody,
        @Part("message") message: RequestBody,
        @Part("priority") priority: RequestBody,
        @Part files: List<MultipartBody.Part>?
    ): Response<Map<String, Any>>
    
    @POST("support/tickets/{id}/messages")
    suspend fun addMessage(@Path("id") id: Int, @Body request: AddMessageRequest): Response<Map<String, Any>>

    @Multipart
    @POST("support/tickets/{id}/messages")
    suspend fun addMessageWithFiles(
        @Path("id") id: Int,
        @Part("message") message: RequestBody,
        @Part files: List<MultipartBody.Part>?
    ): Response<Map<String, Any>>

    @POST("support/tickets/{id}/messages/{messageId}/reactions")
    suspend fun toggleReaction(
        @Path("id") ticketId: Int,
        @Path("messageId") messageId: Int,
        @Body request: Map<String, String>
    ): Response<Map<String, Any>>
    
    @DELETE("support/tickets/{id}")
    suspend fun deleteTicket(@Path("id") id: Int): Response<Map<String, Any>>
    
    // Auth
    @PUT("auth/change-password")
    suspend fun changePassword(@Body request: ChangePasswordRequest): Response<ChangePasswordResponse>
    
    // SBIS (for registration, no auth required)
    @POST("sbis-proxy/auth")
    suspend fun sbisAuth(@Body request: Map<String, String>): Response<Map<String, Any>>
    
    @POST("sbis-proxy/crm-client-oauth")
    suspend fun sbisGetClientFromCRM(@Body request: Map<String, Any>): Response<Map<String, Any>>
    
    @POST("sbis-proxy/contractor-info")
    suspend fun getContractorInfo(@Body request: Map<String, String>): Response<ContractorInfoResponse>
    
    @POST("sbis-proxy/create-invoice")
    suspend fun createTopUpInvoice(@Body request: Map<String, Any>): Response<Map<String, Any>>
    
    // SBIS Resources - KKT and FN
    @GET("sbis-resources/credentials")
    suspend fun getSBISCredentials(): Response<SBISCredentialsResponse>
    
    @PUT("sbis-resources/credentials")
    suspend fun saveSBISCredentials(@Body request: SaveSBISCredentialsRequest): Response<SBISCredentialsResponse>
    
    @POST("sbis-resources/auth")
    suspend fun authSBIS(@Body request: SBISAuthRequest): Response<SBISAuthResponse>
    
    @POST("sbis-resources/confirm-2fa")
    suspend fun confirmSBIS2FA(@Body request: SBIS2FARequest): Response<SBIS2FAResponse>
    
    @GET("sbis-resources/kkts")
    suspend fun getKKTs(@Query("inn") inn: String? = null, @Query("status") status: Int? = null): Response<KKTsResponse>
    
    @GET("sbis-resources/storages")
    suspend fun getFiscalStorages(@Query("inn") inn: String? = null, @Query("regId") regId: String, @Query("status") status: Int? = null): Response<FiscalStoragesResponse>
    
    // SBIS CRM - создание сделок
    @POST("sbis-crm/create-lead")
    suspend fun createCRMLead(
        @Body request: CreateCRMLeadRequest
    ): Response<CreateCRMLeadResponse>
    
    // Stores (магазины)
    @GET("stores")
    suspend fun getStores(): Response<StoresResponse>
    
    @POST("stores")
    suspend fun createStore(@Body request: AddStoreRequest): Response<CreateStoreResponse>
    
    @PUT("stores/{id}")
    suspend fun updateStore(@Path("id") id: Int, @Body request: UpdateStoreRequest): Response<UpdateStoreResponse>
    
    @DELETE("stores/{id}")
    suspend fun deleteStore(@Path("id") id: Int): Response<Map<String, Any>>
    
    // Employees (сотрудники)
    @GET("employees")
    suspend fun getEmployees(): Response<EmployeesResponse>
    
    @POST("employees")
    suspend fun addEmployee(@Body request: AddEmployeeRequest): Response<Map<String, Employee>>
    
    @PUT("employees/{id}")
    suspend fun updateEmployee(@Path("id") id: Int, @Body request: UpdateEmployeeRequest): Response<Map<String, Employee>>
    
    @DELETE("employees/{id}")
    suspend fun deleteEmployee(@Path("id") id: Int): Response<Map<String, Any>>
    
    // Employee Auth (авторизация сотрудника по телефону)
    @POST("employees/auth/phone")
    suspend fun employeeAuthByPhone(@Body request: EmployeeAuthRequest): Response<EmployeeAuthResponse>
    
    // Engineer/Staff Support Tickets
    @GET("staff/support/tickets")
    suspend fun getEngineerTickets(
        @Query("status") status: String? = null,
        @Query("assigned_to") assignedTo: String? = null,
        @Query("limit") limit: Int? = 50,
        @Query("offset") offset: Int? = 0
    ): Response<TicketsResponse>
    
    @GET("staff/support/tickets/{id}")
    suspend fun getEngineerTicketDetail(@Path("id") id: Int): Response<TicketDetail>
    
    @PUT("staff/support/tickets/{id}/status")
    suspend fun updateTicketStatus(
        @Path("id") id: Int,
        @Body request: UpdateTicketStatusRequest
    ): Response<Map<String, Any>>
    
    @Multipart
    @POST("staff/support/tickets/{id}/messages")
    suspend fun addEngineerMessage(
        @Path("id") id: Int,
        @Part("message") message: RequestBody,
        @Part files: List<MultipartBody.Part>?
    ): Response<Map<String, Any>>
    
    @POST("staff/support/tickets/{id}/messages/{messageId}/reactions")
    suspend fun toggleEngineerReaction(
        @Path("id") ticketId: Int,
        @Path("messageId") messageId: Int,
        @Body request: Map<String, String>
    ): Response<Map<String, Any>>

    @DELETE("staff/support/tickets/{id}")
    suspend fun deleteEngineerTicket(@Path("id") id: Int): Response<Map<String, Any>>
    
    @GET("staff/support/analytics")
    suspend fun getEngineerAnalytics(
        @Query("period") period: String = "month",
        @Query("assigned_to") assignedTo: String = "me"
    ): Response<Map<String, Any>>
}
