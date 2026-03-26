package com.example.worldcashbox.data.api

import android.content.Context
import android.content.SharedPreferences
import android.os.Build

object ApiConfig {
    private const val PREFS_NAME = "api_config"
    private const val KEY_BASE_URL = "base_url"
    
    // URL по умолчанию
    // Эмулятор Android → обращаемся к локальному бэкенду на ПК (для разработки)
    private const val DEFAULT_EMULATOR_URL = "http://10.0.2.2:3000/api/"
    // Продакшн сервер → удаленный бэкенд на сервере
    private const val DEFAULT_DEVICE_URL = "http://155.212.132.213/api/"
    
    /**
     * Получить базовый URL API
     * Для эмулятора использует 10.0.2.2
     * Для реального устройства можно настроить через SharedPreferences
     */
    fun getBaseUrl(context: Context): String {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedUrl = prefs.getString(KEY_BASE_URL, null)

        // 1) Если пользователь руками задал URL – используем его
        if (!savedUrl.isNullOrBlank()) {
            return savedUrl
        }

        // 2) Иначе выбираем по типу устройства: эмулятор / реальный телефон
        return if (isEmulator()) {
            DEFAULT_EMULATOR_URL
        } else {
            DEFAULT_DEVICE_URL
        }
    }
    
    /**
     * Сохранить кастомный URL (для реального устройства)
     */
    fun setBaseUrl(context: Context, url: String) {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_BASE_URL, url).apply()
    }
    
    /**
     * Сбросить URL на значение по умолчанию
     */
    fun resetBaseUrl(context: Context) {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(KEY_BASE_URL).apply()
    }
    
    /**
     * Проверить, запущено ли приложение на эмуляторе
     */
    fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
                || "google_sdk" == Build.PRODUCT)
    }
    
    /**
     * Получить рекомендуемый URL в зависимости от устройства
     */
    fun getRecommendedUrl(): String = if (isEmulator()) DEFAULT_EMULATOR_URL else DEFAULT_DEVICE_URL
}
