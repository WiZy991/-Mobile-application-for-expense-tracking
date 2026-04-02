package com.example.worldcashbox.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.ApiConfig
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.ui.chat.ChatDetailActivity
import com.example.worldcashbox.ui.chat.ChatListActivity
import com.example.worldcashbox.ui.engineer.EngineerTicketDetailActivity
import com.example.worldcashbox.ui.support.SupportActivity
import com.example.worldcashbox.utils.TokenManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class FCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMService"
        const val CHANNEL_CHAT = "chat_messages"
        const val CHANNEL_TICKETS = "ticket_updates"

        fun createNotificationChannels(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val manager = context.getSystemService(NotificationManager::class.java)

                val chatChannel = NotificationChannel(
                    CHANNEL_CHAT, "Сообщения чата",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Уведомления о новых сообщениях в чате"
                    enableVibration(true)
                }

                val ticketChannel = NotificationChannel(
                    CHANNEL_TICKETS, "Обновления тикетов",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Уведомления об обновлениях в тикетах поддержки"
                }

                manager.createNotificationChannel(chatChannel)
                manager.createNotificationChannel(ticketChannel)
            }
        }
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "New FCM token: $token")
        sendTokenToServer(token)
    }

    private fun sendTokenToServer(token: String) {
        val tokenManager = TokenManager(this)
        val authToken = tokenManager.getToken() ?: return

        RetrofitClient.initialize(this)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.registerPushToken(
                    mapOf("token" to token, "platform" to "android")
                )
                if (response.isSuccessful) {
                    Log.d(TAG, "FCM token registered on server")
                } else {
                    Log.e(TAG, "Failed to register token: ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error registering token", e)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Log.d(TAG, "Push received: ${message.data}")

        val type = message.data["type"] ?: "general"
        val title = message.data["title"] ?: message.notification?.title ?: "WorldCashBox"
        val body = message.data["body"] ?: message.notification?.body ?: ""

        when (type) {
            "chat_message" -> showChatNotification(title, body, message.data)
            "ticket_reply" -> showTicketNotification(title, body, message.data)
            "ticket_status" -> showTicketNotification(title, body, message.data)
            else -> showGeneralNotification(title, body)
        }
    }

    private fun showChatNotification(title: String, body: String, data: Map<String, String>) {
        val conversationId = data["conversation_id"]?.toIntOrNull() ?: 0

        val intent = if (conversationId > 0) {
            Intent(this, ChatDetailActivity::class.java).apply {
                putExtra("conversationId", conversationId)
                putExtra("title", data["conversation_title"] ?: "Чат")
            }
        } else {
            Intent(this, ChatListActivity::class.java)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)

        showNotification(CHANNEL_CHAT, title, body, intent, conversationId)
    }

    private fun showTicketNotification(title: String, body: String, data: Map<String, String>) {
        val ticketId = data["ticket_id"]?.toIntOrNull() ?: 0
        val tokenManager = TokenManager(this)
        val userType = tokenManager.getUserType()

        val intent = if (ticketId > 0 && userType == "staff") {
            Intent(this, EngineerTicketDetailActivity::class.java).apply {
                putExtra("ticketId", ticketId)
            }
        } else {
            Intent(this, SupportActivity::class.java)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)

        showNotification(CHANNEL_TICKETS, title, body, intent, 1000 + ticketId)
    }

    private fun showGeneralNotification(title: String, body: String) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
            ?: return
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)

        showNotification(CHANNEL_TICKETS, title, body, intent, 0)
    }

    private fun showNotification(channelId: String, title: String, body: String, intent: Intent, notificationId: Int) {
        val pendingIntent = PendingIntent.getActivity(
            this, notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_send)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(notificationId, notification)
    }
}
