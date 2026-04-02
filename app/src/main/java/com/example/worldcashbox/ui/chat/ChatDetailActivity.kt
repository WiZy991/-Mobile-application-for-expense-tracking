package com.example.worldcashbox.ui.chat

import android.os.Bundle
import android.view.Gravity
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.api.SocketManager
import com.example.worldcashbox.data.model.DirectMessage
import com.example.worldcashbox.data.model.SendDirectMessageRequest
import com.example.worldcashbox.databinding.ActivityChatDetailBinding
import com.example.worldcashbox.utils.TokenManager
import com.google.android.material.card.MaterialCardView
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class ChatDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivityChatDetailBinding
    private var conversationId: Int = 0
    private val messages = mutableListOf<DirectMessage>()
    private lateinit var tokenManager: TokenManager
    private var currentUserId: Int = 0
    private var currentUserType: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChatDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        RetrofitClient.initialize(this)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        conversationId = intent.getIntExtra("conversationId", 0)
        supportActionBar?.title = intent.getStringExtra("title") ?: "Чат"

        if (conversationId == 0) {
            Toast.makeText(this, "Ошибка: чат не найден", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val userType = tokenManager.getUserType()
        currentUserType = if (userType == "staff") "staff" else "client"

        binding.messagesRecyclerView.layoutManager = LinearLayoutManager(this).apply {
            stackFromEnd = true
        }
        binding.messagesRecyclerView.adapter = DirectMessagesAdapter()

        binding.sendButton.setOnClickListener { sendMessage() }

        loadMessages()
        loadParticipants()
        setupSocket()
    }

    private fun setupSocket() {
        SocketManager.connect(this)
        SocketManager.joinConversation(conversationId)
        SocketManager.onNewDirectMessage { data ->
            val cId = data.optInt("conversationId", 0)
            if (cId == conversationId) {
                runOnUiThread { loadMessages() }
            }
        }
    }

    private fun loadParticipants() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getConversations()
                if (response.isSuccessful && response.body() != null) {
                    val conv = response.body()!!.conversations.find { it.id == conversationId }
                    if (conv != null) {
                        val otherType = if (currentUserType == "staff") "client" else "staff"
                        val otherMembers = conv.participants
                            .filter { it.userType == otherType && it.role == "member" }
                            .mapNotNull { it.name }

                        if (currentUserType == "client") {
                            supportActionBar?.title = "Чат с поддержкой"
                        } else if (otherMembers.isNotEmpty()) {
                            supportActionBar?.title = otherMembers.first().take(30)
                        }

                        if (otherMembers.isNotEmpty()) {
                            supportActionBar?.subtitle = otherMembers.joinToString(", ") { it.take(25) }
                        }
                    }
                }
            } catch (_: Exception) { }
        }
    }

    private fun loadMessages() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getConversationMessages(conversationId)
                if (response.isSuccessful && response.body() != null) {
                    messages.clear()
                    messages.addAll(response.body()!!.messages)
                    binding.messagesRecyclerView.adapter?.notifyDataSetChanged()

                    if (messages.isEmpty()) {
                        binding.emptyMessagesText.visibility = View.VISIBLE
                        binding.messagesRecyclerView.visibility = View.GONE
                    } else {
                        binding.emptyMessagesText.visibility = View.GONE
                        binding.messagesRecyclerView.visibility = View.VISIBLE
                        binding.messagesRecyclerView.scrollToPosition(messages.size - 1)
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(this@ChatDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun sendMessage() {
        val text = binding.messageEditText.text?.toString()?.trim()
        if (text.isNullOrBlank()) return

        binding.sendButton.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.sendConversationMessage(
                    conversationId, SendDirectMessageRequest(text)
                )
                if (response.isSuccessful) {
                    binding.messageEditText.text?.clear()
                    loadMessages()
                } else {
                    Toast.makeText(this@ChatDetailActivity, "Ошибка отправки", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ChatDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.sendButton.isEnabled = true
            }
        }
    }

    override fun onDestroy() {
        SocketManager.leaveConversation(conversationId)
        SocketManager.offAll()
        super.onDestroy()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) { finish(); return true }
        return super.onOptionsItemSelected(item)
    }

    inner class DirectMessagesAdapter : RecyclerView.Adapter<DirectMessagesAdapter.VH>() {
        inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
            val card: MaterialCardView = itemView.findViewById(R.id.messageCard)
            val senderName: TextView = itemView.findViewById(R.id.senderNameTextView)
            val messageText: TextView = itemView.findViewById(R.id.messageTextView)
            val time: TextView = itemView.findViewById(R.id.timeTextView)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val view = layoutInflater.inflate(R.layout.item_direct_message, parent, false)
            return VH(view)
        }

        override fun getItemCount() = messages.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val msg = messages[position]
            holder.messageText.text = msg.message

            val isFromMe = msg.senderType == currentUserType
            val lp = holder.card.layoutParams as LinearLayout.LayoutParams

            if (isFromMe) {
                lp.gravity = Gravity.END
                lp.marginStart = dpToPx(60)
                lp.marginEnd = dpToPx(4)
                holder.card.setCardBackgroundColor(getColor(R.color.primary_light))
                holder.senderName.visibility = View.GONE
            } else {
                lp.gravity = Gravity.START
                lp.marginStart = dpToPx(4)
                lp.marginEnd = dpToPx(60)
                holder.card.setCardBackgroundColor(getColor(R.color.background_light))
                holder.senderName.visibility = View.VISIBLE
                holder.senderName.text = msg.senderName ?: "Собеседник"
            }
            holder.card.layoutParams = lp

            if (msg.createdAt != null) {
                try {
                    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                    val date = fmt.parse(msg.createdAt.take(19))
                    val outFmt = SimpleDateFormat("HH:mm", Locale.getDefault())
                    holder.time.text = if (date != null) outFmt.format(date) else ""
                } catch (_: Exception) {
                    holder.time.text = ""
                }
            }
        }

        private fun dpToPx(dp: Int): Int {
            return (dp * resources.displayMetrics.density).toInt()
        }
    }
}
