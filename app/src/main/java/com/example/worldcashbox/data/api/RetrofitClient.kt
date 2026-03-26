package com.example.worldcashbox.data.api

import android.content.Context
import com.example.worldcashbox.utils.TokenManager
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.FieldNamingPolicy
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    private var baseUrl: String = "http://155.212.132.213/api/" // Production server
    private var tokenManager: TokenManager? = null
    private var retrofit: Retrofit? = null
    private var apiServiceInstance: ApiService? = null
    
    fun initialize(context: Context) {
        tokenManager = TokenManager(context)
        baseUrl = ApiConfig.getBaseUrl(context)
        // Пересоздаем retrofit с новым URL
        retrofit = null
        apiServiceInstance = null
    }
    
    fun setBaseUrl(url: String) {
        baseUrl = url
        retrofit = null
        apiServiceInstance = null
    }
    
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }
    
    private val authInterceptor = Interceptor { chain ->
        val originalRequest = chain.request()
        val token = tokenManager?.getToken()
        
        val requestBuilder = originalRequest.newBuilder()
        
        if (token != null) {
            requestBuilder.header("Authorization", "Bearer $token")
        }
        
        // Отключаем кэширование для всех запросов, чтобы получать свежие данные
        requestBuilder.header("Cache-Control", "no-cache, no-store, must-revalidate")
        requestBuilder.header("Pragma", "no-cache")
        requestBuilder.header("Expires", "0")
        
        // Устанавливаем Content-Type только если его нет (для multipart запросов)
        if (originalRequest.header("Content-Type") == null && 
            originalRequest.body?.contentType()?.toString()?.contains("multipart") != true) {
            requestBuilder.header("Content-Type", "application/json")
        }
        
        chain.proceed(requestBuilder.build())
    }
    
    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .addInterceptor(authInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .cache(null) // Отключаем кэш полностью
        .build()
    
    private val gson: Gson = GsonBuilder()
        .setFieldNamingPolicy(FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES) // API возвращает snake_case, поэтому используем LOWER_CASE_WITH_UNDERSCORES
        .setLenient()
        .registerTypeAdapter(Boolean::class.javaObjectType, BooleanTypeAdapter())
        .registerTypeAdapter(Boolean::class.javaPrimitiveType, BooleanTypeAdapter())
        .create()
    
    private fun getRetrofit(): Retrofit {
        if (retrofit == null) {
            retrofit = Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create(gson))
                .build()
        }
        return retrofit!!
    }
    
    val apiService: ApiService
        get() {
            if (apiServiceInstance == null) {
                apiServiceInstance = getRetrofit().create(ApiService::class.java)
            }
            return apiServiceInstance!!
        }
    
    fun getTokenManager(): TokenManager? = tokenManager
}
