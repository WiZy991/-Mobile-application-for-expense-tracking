package com.example.worldcashbox.ui.chat

import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Conversation
import com.example.worldcashbox.data.model.CreateConversationRequest
import com.example.worldcashbox.databinding.ActivityChatListBinding
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class ChatListActivity : AppCompatActivity() {
    private lateinit var binding: ActivityChatListBinding
    private val conversations = mutableListOf<Conversation>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChatListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        RetrofitClient.initialize(this)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val tokenManager = TokenManager(this)
        val isManager = tokenManager.getUserRole() == "manager"
        supportActionBar?.title = if (isManager) "Чаты (наблюдатель)" else "Чаты"

        if (isManager) {
            binding.fabNewChat.visibility = View.GONE
        } else {
            binding.fabNewChat.setOnClickListener { createNewChat() }
        }

        binding.chatsRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.chatsRecyclerView.adapter = ChatAdapter()

        loadConversations()
    }

    override fun onResume() {
        super.onResume()
        loadConversations()
    }

    private fun createNewChat() {
        binding.fabNewChat.isEnabled = false
        lifecycleScope.launch {
            try {
                val request = CreateConversationRequest()
                val response = RetrofitClient.apiService.createConversation(request)
                if (response.isSuccessful && response.body() != null) {
                    val result = response.body()!!
                    val intent = Intent(this@ChatListActivity, ChatDetailActivity::class.java)
                    intent.putExtra("conversationId", result.conversationId)
                    intent.putExtra("title", "Новый чат")
                    startActivity(intent)
                } else {
                    val errorBody = response.errorBody()?.string() ?: ""
                    Toast.makeText(this@ChatListActivity, "Ошибка: $errorBody", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ChatListActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.fabNewChat.isEnabled = true
            }
        }
    }

    private fun loadConversations() {
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getConversations()
                if (response.isSuccessful && response.body() != null) {
                    conversations.clear()
                    conversations.addAll(response.body()!!.conversations)
                    binding.chatsRecyclerView.adapter?.notifyDataSetChanged()

                    binding.emptyStateText.visibility = if (conversations.isEmpty()) View.VISIBLE else View.GONE
                    binding.chatsRecyclerView.visibility = if (conversations.isEmpty()) View.GONE else View.VISIBLE
                }
            } catch (e: Exception) {
                Toast.makeText(this@ChatListActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) { finish(); return true }
        return super.onOptionsItemSelected(item)
    }

    inner class ChatAdapter : RecyclerView.Adapter<ChatAdapter.VH>() {
        inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
            val avatar: TextView = itemView.findViewById(R.id.avatarTextView)
            val title: TextView = itemView.findViewById(R.id.titleTextView)
            val lastMessage: TextView = itemView.findViewById(R.id.lastMessageTextView)
            val time: TextView = itemView.findViewById(R.id.timeTextView)
            val unreadBadge: TextView = itemView.findViewById(R.id.unreadBadge)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val view = layoutInflater.inflate(R.layout.item_chat, parent, false)
            return VH(view)
        }

        override fun getItemCount() = conversations.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val conv = conversations[position]
            val displayTitle = conv.title ?: "Чат #${conv.id}"
            holder.title.text = displayTitle
            holder.avatar.text = displayTitle.firstOrNull()?.uppercase() ?: "?"
            holder.lastMessage.text = conv.lastMessage ?: "Нет сообщений"

            if (conv.lastMessageAt != null) {
                try {
                    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                    val date = fmt.parse(conv.lastMessageAt.take(19))
                    val outFmt = SimpleDateFormat("dd.MM HH:mm", Locale("ru"))
                    holder.time.text = if (date != null) outFmt.format(date) else ""
                } catch (_: Exception) {
                    holder.time.text = ""
                }
            } else {
                holder.time.text = ""
            }

            if (conv.unreadCount > 0) {
                holder.unreadBadge.visibility = View.VISIBLE
                holder.unreadBadge.text = conv.unreadCount.toString()
            } else {
                holder.unreadBadge.visibility = View.GONE
            }

            holder.itemView.setOnClickListener {
                val intent = Intent(this@ChatListActivity, ChatDetailActivity::class.java)
                intent.putExtra("conversationId", conv.id)
                intent.putExtra("title", displayTitle)
                startActivity(intent)
            }
        }
    }
}
