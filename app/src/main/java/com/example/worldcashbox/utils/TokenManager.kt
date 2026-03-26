package com.example.worldcashbox.utils

import android.content.Context
import android.content.SharedPreferences

class TokenManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "worldcashbox_prefs",
        Context.MODE_PRIVATE
    )
    
    fun saveToken(token: String) {
        prefs.edit().putString("user_token", token).apply()
    }
    
    fun getToken(): String? {
        return prefs.getString("user_token", null)
    }
    
    fun saveUserType(type: String) {
        prefs.edit().putString("user_type", type).apply()
    }
    
    fun getUserType(): String? {
        return prefs.getString("user_type", null)
    }
    
    fun saveUserRole(role: String?) {
        prefs.edit().putString("user_role", role).apply()
    }
    
    fun getUserRole(): String? {
        return prefs.getString("user_role", null)
    }
    
    fun clearToken() {
        prefs.edit().remove("user_token").apply()
    }
    
    fun clearUserType() {
        prefs.edit().remove("user_type").apply()
    }
    
    fun clearUserRole() {
        prefs.edit().remove("user_role").apply()
    }
    
    fun clear() {
        prefs.edit().clear().apply()
    }
    
    fun isLoggedIn(): Boolean {
        return getToken() != null
    }
}
