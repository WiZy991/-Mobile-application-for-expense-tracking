package com.worldcashbox.utils

import io.github.cdimascio.dotenv.dotenv

object EnvUtils {
    private val dotenv = try {
        dotenv {
            ignoreIfMissing = true
            directory = "./"
        }
    } catch (e: Exception) {
        null
    }
    
    /**
     * Получить переменную окружения из системы или .env файла
     */
    fun getEnv(key: String, defaultValue: String? = null): String? {
        return System.getenv(key) ?: dotenv?.get(key) ?: defaultValue
    }
    
    /**
     * Получить переменную окружения или выбросить исключение, если она не установлена
     */
    fun requireEnv(key: String): String {
        return getEnv(key) ?: throw IllegalStateException("Environment variable $key is required but not set")
    }
    
    /**
     * Получить переменную окружения как Int
     */
    fun getEnvInt(key: String, defaultValue: Int? = null): Int? {
        val value = getEnv(key)
        return value?.toIntOrNull() ?: defaultValue
    }
}
