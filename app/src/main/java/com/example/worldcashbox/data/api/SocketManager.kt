package com.example.worldcashbox.data.api

import android.content.Context
import android.util.Log
import com.example.worldcashbox.utils.TokenManager
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

object SocketManager {
    private const val TAG = "SocketManager"
    private var socket: Socket? = null

    fun connect(context: Context) {
        if (socket?.connected() == true) return

        val token = TokenManager(context).getToken() ?: return
        val baseUrl = ApiConfig.getBaseUrl(context).trimEnd('/').removeSuffix("/api")

        try {
            val opts = IO.Options().apply {
                auth = mapOf("token" to token)
                reconnection = true
                reconnectionDelay = 2000
                reconnectionDelayMax = 10000
                timeout = 20000
            }
            socket = IO.socket(URI.create(baseUrl), opts)
            socket?.connect()
            socket?.on(Socket.EVENT_CONNECT) { Log.d(TAG, "Connected") }
            socket?.on(Socket.EVENT_DISCONNECT) { Log.d(TAG, "Disconnected") }
            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.w(TAG, "Connection error: ${args.firstOrNull()}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect", e)
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }

    fun joinTicket(ticketId: Int) {
        socket?.emit("join_ticket", ticketId)
    }

    fun leaveTicket(ticketId: Int) {
        socket?.emit("leave_ticket", ticketId)
    }

    fun joinConversation(conversationId: Int) {
        socket?.emit("join_conversation", conversationId)
    }

    fun leaveConversation(conversationId: Int) {
        socket?.emit("leave_conversation", conversationId)
    }

    fun sendTyping(ticketId: Int) {
        socket?.emit("typing", JSONObject().put("ticketId", ticketId))
    }

    fun sendStopTyping(ticketId: Int) {
        socket?.emit("stop_typing", JSONObject().put("ticketId", ticketId))
    }

    fun onNewMessage(listener: (JSONObject) -> Unit) {
        socket?.on("new_message") { args ->
            (args.firstOrNull() as? JSONObject)?.let(listener)
        }
    }

    fun onStatusChanged(listener: (JSONObject) -> Unit) {
        socket?.on("status_changed") { args ->
            (args.firstOrNull() as? JSONObject)?.let(listener)
        }
    }

    fun onTyping(listener: (JSONObject) -> Unit) {
        socket?.on("typing") { args ->
            (args.firstOrNull() as? JSONObject)?.let(listener)
        }
    }

    fun onStopTyping(listener: (JSONObject) -> Unit) {
        socket?.on("stop_typing") { args ->
            (args.firstOrNull() as? JSONObject)?.let(listener)
        }
    }

    fun onNewDirectMessage(listener: (JSONObject) -> Unit) {
        socket?.on("new_direct_message") { args ->
            (args.firstOrNull() as? JSONObject)?.let(listener)
        }
    }

    fun offAll() {
        socket?.off("new_message")
        socket?.off("status_changed")
        socket?.off("typing")
        socket?.off("stop_typing")
        socket?.off("new_direct_message")
    }
}
