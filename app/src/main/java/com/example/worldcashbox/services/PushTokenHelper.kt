package com.example.worldcashbox.services

import android.content.Context
import android.util.Log
import com.example.worldcashbox.data.api.RetrofitClient
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

object PushTokenHelper {
    private const val TAG = "PushTokenHelper"

    fun registerIfNeeded(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val token = FirebaseMessaging.getInstance().token.await()
                Log.d(TAG, "FCM token: $token")

                RetrofitClient.initialize(context)
                val response = RetrofitClient.apiService.registerPushToken(
                    mapOf("token" to token, "platform" to "android")
                )
                if (response.isSuccessful) {
                    Log.d(TAG, "Token registered successfully")
                } else {
                    Log.e(TAG, "Token registration failed: ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error registering push token", e)
            }
        }
    }

    fun unregister(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val token = FirebaseMessaging.getInstance().token.await()
                RetrofitClient.initialize(context)
                RetrofitClient.apiService.unregisterPushToken(mapOf("token" to token))
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering token", e)
            }
        }
    }
}
