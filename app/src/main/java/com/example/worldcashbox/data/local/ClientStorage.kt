package com.example.worldcashbox.data.local

import android.content.Context
import android.content.SharedPreferences
import com.example.worldcashbox.data.model.Client
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * Простой кэш клиентских данных в SharedPreferences.
 * Нужен, чтобы профиль, дашборд и настройки сразу показывали данные,
 * не ожидая ответа от бэкенда.
 */
object ClientStorage {
    private const val PREFS_NAME = "client_cache"
    private const val KEY_CLIENT = "client_json"
    private const val KEY_STATS = "client_stats_json"
    private const val KEY_UPDATED_AT = "client_updated_at"

    private val gson = Gson()

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveClient(context: Context, client: Client) {
        try {
            val json = gson.toJson(client)
            prefs(context).edit()
                .putString(KEY_CLIENT, json)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {
        }
    }

    fun getClient(context: Context): Client? {
        return try {
            val json = prefs(context).getString(KEY_CLIENT, null) ?: return null
            gson.fromJson(json, Client::class.java)
        } catch (e: Exception) {
            null
        }
    }

    fun saveStats(context: Context, stats: Map<String, Any>) {
        try {
            val json = gson.toJson(stats)
            prefs(context).edit()
                .putString(KEY_STATS, json)
                .apply()
        } catch (_: Exception) {
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun getStats(context: Context): Map<String, Any>? {
        return try {
            val json = prefs(context).getString(KEY_STATS, null) ?: return null
            val type = object : TypeToken<Map<String, Any>>() {}.type
            gson.fromJson<Map<String, Any>>(json, type)
        } catch (e: Exception) {
            null
        }
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }
}

