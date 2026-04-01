package com.example.worldcashbox.ui.engineer

import android.animation.ObjectAnimator
import android.app.Dialog
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.bumptech.glide.Glide
import com.bumptech.glide.load.model.GlideUrl
import com.bumptech.glide.load.model.LazyHeaders
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.ApiConfig
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.*
import com.example.worldcashbox.databinding.ActivityEngineerTicketDetailBinding
import com.example.worldcashbox.data.api.SocketManager
import com.example.worldcashbox.ui.support.MessagesAdapter
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.text.SimpleDateFormat
import java.util.*

class EngineerTicketDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivityEngineerTicketDetailBinding
    private var ticketId: Int = 0
    private var ticket: Ticket? = null
    private val messages = mutableListOf<Message>()
    private val selectedFiles = mutableListOf<Uri>()
    private var isCardExpanded = false

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty()) {
            selectedFiles.addAll(uris)
            Toast.makeText(this, "Выбрано файлов: ${selectedFiles.size}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEngineerTicketDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Тикет"

        ticketId = intent.getIntExtra("ticketId", 0)
        if (ticketId == 0) {
            Toast.makeText(this, "Ошибка: не указан ID тикета", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        setupRecyclerView()
        setupListeners()
        loadTicketDetails()

        val isManager = TokenManager(this).getUserRole() == "manager"
        if (isManager) {
            binding.newMessageEditText.visibility = View.GONE
            binding.sendMessageButton.visibility = View.GONE
            binding.attachFileButton.visibility = View.GONE
            binding.statusButton.visibility = View.GONE
            supportActionBar?.title = "Тикет (просмотр)"
        }

        setupSocketListeners()

        // Fallback polling (longer interval since WebSocket handles real-time)
        lifecycleScope.launch {
            while (true) {
                kotlinx.coroutines.delay(30000)
                if (!isFinishing && !isDestroyed) {
                    loadTicketDetails(false)
                } else {
                    break
                }
            }
        }
    }

    private fun setupRecyclerView() {
        binding.messagesRecyclerView.layoutManager = LinearLayoutManager(this).apply {
            stackFromEnd = true
        }
        binding.messagesRecyclerView.adapter = MessagesAdapter(
            onReactionClick = { message -> showReactionPicker(message, null) },
            onFileClick = { file -> openFile(file) },
            onImageClick = { file -> showFullscreenImage(file) },
            onLongPress = { message, anchor -> showReactionPicker(message, anchor) }
        )
    }

    private fun showReactionPicker(message: Message, anchorView: View?) {
        val emojis = listOf("👍", "❤️", "😂", "😮", "😢", "🔥", "👎", "🎉")

        val popupView = LayoutInflater.from(this).inflate(R.layout.popup_reactions, null)
        val emojisRow = popupView.findViewById<LinearLayout>(R.id.emojisRow)

        val popupWindow = PopupWindow(
            popupView,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        )
        popupWindow.elevation = 16f
        popupWindow.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        popupWindow.isOutsideTouchable = true

        for (emoji in emojis) {
            val tv = TextView(this).apply {
                text = emoji
                textSize = 24f
                setPadding(dp(8), dp(6), dp(8), dp(6))
                setOnClickListener {
                    popupWindow.dismiss()
                    toggleReaction(message.id, emoji)
                }
            }
            emojisRow.addView(tv)
        }

        if (anchorView != null) {
            popupWindow.showAsDropDown(anchorView, 0, -anchorView.height - dp(60), Gravity.START)
        } else {
            popupWindow.showAtLocation(binding.root, Gravity.CENTER, 0, 0)
        }
    }

    private fun toggleReaction(messageId: Int, emoji: String) {
        lifecycleScope.launch {
            try {
                RetrofitClient.apiService.toggleEngineerReaction(
                    ticketId, messageId, mapOf("emoji" to emoji)
                )
                kotlinx.coroutines.delay(300)
                loadTicketDetails(false)
            } catch (e: Exception) {
                Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка реакции", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun openFile(file: MessageFile) {
        try {
            val fullUrl = getFullFileUrl(file.fileUrl)
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "Не удалось открыть файл", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showFullscreenImage(file: MessageFile) {
        val dialog = Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
        val imageView = ImageView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            scaleType = ImageView.ScaleType.FIT_CENTER
            setBackgroundColor(Color.BLACK)
            setOnClickListener { dialog.dismiss() }
        }
        dialog.setContentView(imageView)
        dialog.window?.setLayout(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT
        )

        val fullUrl = getFullFileUrl(file.fileUrl)
        val token = TokenManager(this).getToken() ?: ""
        val glideUrl = GlideUrl(
            fullUrl,
            LazyHeaders.Builder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        )
        Glide.with(this).load(glideUrl).into(imageView)
        dialog.show()
    }

    private fun getFullFileUrl(relativeUrl: String?): String {
        if (relativeUrl == null) return ""
        if (relativeUrl.startsWith("http")) return relativeUrl
        val base = ApiConfig.getBaseUrl(this).trimEnd('/').removeSuffix("/api")
        return "$base$relativeUrl"
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    private fun setupListeners() {
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.sendMessageButton.setOnClickListener { sendMessage() }
        binding.attachFileButton.setOnClickListener { filePickerLauncher.launch("*/*") }
        binding.statusButton.setOnClickListener { showStatusDialog() }
        binding.cardHeaderLayout.setOnClickListener { toggleCardExpand() }
        binding.chatWithClientButton.setOnClickListener { openOrCreateChatWithClient() }

        val isManager = TokenManager(this).getUserRole() == "manager"
        if (isManager) {
            binding.chatWithClientButton.visibility = View.GONE
        }
    }

    private fun openOrCreateChatWithClient() {
        val clientId = ticket?.clientId ?: run {
            Toast.makeText(this, "Нет данных о клиенте", Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            try {
                binding.chatWithClientButton.isEnabled = false
                val request = com.example.worldcashbox.data.model.CreateConversationRequest(clientId = clientId)
                val response = RetrofitClient.apiService.createConversation(request)
                if (response.isSuccessful && response.body() != null) {
                    val result = response.body()!!
                    val intent = Intent(this@EngineerTicketDetailActivity, com.example.worldcashbox.ui.chat.ChatDetailActivity::class.java)
                    intent.putExtra("conversationId", result.conversationId)
                    intent.putExtra("title", ticket?.clientName ?: "Чат")
                    startActivity(intent)
                } else {
                    val errorBody = response.errorBody()?.string() ?: "unknown"
                    android.util.Log.e("Chat", "Create chat error: ${response.code()} $errorBody")
                    Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка создания чата: ${response.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.chatWithClientButton.isEnabled = true
            }
        }
    }

    private fun toggleCardExpand() {
        isCardExpanded = !isCardExpanded
        if (isCardExpanded) {
            binding.cardBodyLayout.visibility = View.VISIBLE
            ObjectAnimator.ofFloat(binding.expandCollapseButton, "rotation", 0f, 180f)
                .setDuration(250)
                .start()
        } else {
            binding.cardBodyLayout.visibility = View.GONE
            ObjectAnimator.ofFloat(binding.expandCollapseButton, "rotation", 180f, 0f)
                .setDuration(250)
                .start()
        }
    }

    private fun loadTicketDetails(showLoading: Boolean = true) {
        lifecycleScope.launch {
            try {
                if (showLoading) binding.progressBar.visibility = View.VISIBLE
                
                val response = RetrofitClient.apiService.getEngineerTicketDetail(ticketId)
                if (response.isSuccessful && response.body() != null) {
                    val ticketDetail = response.body()!!
                    ticket = ticketDetail.ticket
                    messages.clear()
                    messages.addAll(ticketDetail.messages)
                    displayTicket()
                } else {
                    if (showLoading) {
                        Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка загрузки тикета", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                if (showLoading) {
                    Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
                }
            } finally {
                if (showLoading) binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun displayTicket() {
        val t = ticket ?: return
        
        supportActionBar?.title = "Тикет #${t.id}"
        binding.ticketSubjectTextView.text = t.subject
        binding.clientNameTextView.text = t.clientName ?: "Клиент"
        binding.clientEmailTextView.text = t.clientEmail ?: ""
        binding.statusButton.text = getStatusText(t.status)
        binding.priorityTextView.text = getPriorityText(t.priority)
        
        if (t.createdAt != null) {
            try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                val outputFormat = SimpleDateFormat("dd.MM.yyyy, HH:mm", Locale("ru", "RU"))
                val date = inputFormat.parse(t.createdAt)
                binding.ticketDateTextView.text = "Создан: ${if (date != null) outputFormat.format(date) else t.createdAt}"
            } catch (e: Exception) {
                binding.ticketDateTextView.text = "Создан: ${t.createdAt}"
            }
        }
        
        if (!t.sbisTaskId.isNullOrBlank()) {
            binding.sbisTaskIdTextView.visibility = View.VISIBLE
            binding.sbisTaskIdTextView.setOnClickListener {
                val url = "https://online.sbis.ru/opendoc.html?guid=${t.sbisTaskId}"
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (e: Exception) {
                    Toast.makeText(this, "Не удалось открыть браузер", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            binding.sbisTaskIdTextView.visibility = View.GONE
        }
        
        if (messages.isEmpty()) {
            binding.emptyMessagesTextView.visibility = View.VISIBLE
            binding.messagesRecyclerView.visibility = View.GONE
        } else {
            binding.emptyMessagesTextView.visibility = View.GONE
            binding.messagesRecyclerView.visibility = View.VISIBLE
            (binding.messagesRecyclerView.adapter as? MessagesAdapter)?.updateMessages(messages)
            binding.messagesRecyclerView.scrollToPosition(messages.size - 1)
        }
    }

    private fun sendMessage() {
        val messageText = binding.newMessageEditText.text?.toString()?.trim()
        if (messageText.isNullOrBlank() && selectedFiles.isEmpty()) {
            Toast.makeText(this, "Введите сообщение или прикрепите файл", Toast.LENGTH_SHORT).show()
            return
        }

        lifecycleScope.launch {
            try {
                binding.sendMessageButton.isEnabled = false
                
                val messageBody = (messageText ?: "").toRequestBody("text/plain".toMediaTypeOrNull())
                val fileParts = mutableListOf<MultipartBody.Part>()

                for (uri in selectedFiles) {
                    val inputStream = contentResolver.openInputStream(uri) ?: continue
                    val bytes = inputStream.readBytes()
                    inputStream.close()
                    val fileName = getFileName(uri)
                    val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                    val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
                    fileParts.add(MultipartBody.Part.createFormData("files", fileName, requestBody))
                }

                val response = RetrofitClient.apiService.addEngineerMessage(
                    ticketId,
                    messageBody,
                    if (fileParts.isEmpty()) null else fileParts
                )
                
                if (response.isSuccessful) {
                    binding.newMessageEditText.text?.clear()
                    selectedFiles.clear()
                    Toast.makeText(this@EngineerTicketDetailActivity, "Сообщение отправлено", Toast.LENGTH_SHORT).show()
                    kotlinx.coroutines.delay(500)
                    loadTicketDetails(false)
                } else {
                    Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка отправки", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.sendMessageButton.isEnabled = true
            }
        }
    }

    private fun getFileName(uri: Uri): String {
        var name = "file"
        val cursor = contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) name = it.getString(index)
            }
        }
        return name
    }

    private fun showStatusDialog() {
        val statuses = listOf(
            "to_do" to "К выполнению",
            "in_progress" to "В работе",
            "in_review" to "На проверке",
            "done" to "Выполнено",
            "closed" to "Закрыто"
        )
        
        val currentStatus = ticket?.status ?: "to_do"
        val statusNames = statuses.map { it.second }.toTypedArray()
        val currentIndex = statuses.indexOfFirst { it.first == currentStatus }.takeIf { it >= 0 } ?: 0
        
        AlertDialog.Builder(this)
            .setTitle("Изменить статус")
            .setSingleChoiceItems(statusNames, currentIndex) { dialog, which ->
                val newStatus = statuses[which].first
                updateStatus(newStatus)
                dialog.dismiss()
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun updateStatus(newStatus: String) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.updateTicketStatus(
                    ticketId, UpdateTicketStatusRequest(newStatus)
                )
                if (response.isSuccessful) {
                    Toast.makeText(this@EngineerTicketDetailActivity, "Статус обновлен", Toast.LENGTH_SHORT).show()
                    loadTicketDetails(false)
                } else {
                    Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка обновления статуса", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.engineer_ticket_detail_menu, menu)
        if (TokenManager(this).getUserRole() == "manager") {
            menu.findItem(R.id.menu_delete_ticket)?.isVisible = false
        }
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> { finish(); true }
            R.id.menu_delete_ticket -> { showDeleteDialog(); true }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun showDeleteDialog() {
        AlertDialog.Builder(this)
            .setTitle("Удалить тикет")
            .setMessage("Вы уверены, что хотите удалить этот тикет?")
            .setPositiveButton("Удалить") { _, _ -> deleteTicket() }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun deleteTicket() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.deleteEngineerTicket(ticketId)
                if (response.isSuccessful) {
                    Toast.makeText(this@EngineerTicketDetailActivity, "Тикет удален", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка удаления", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@EngineerTicketDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun setupSocketListeners() {
        SocketManager.connect(this)
        SocketManager.joinTicket(ticketId)

        SocketManager.onNewMessage { data ->
            val msgTicketId = data.optInt("ticketId", 0)
            if (msgTicketId == ticketId) {
                runOnUiThread { loadTicketDetails(false) }
            }
        }

        SocketManager.onStatusChanged { data ->
            val tId = data.optInt("ticketId", 0)
            if (tId == ticketId) {
                runOnUiThread { loadTicketDetails(false) }
            }
        }

        SocketManager.onTyping { data ->
            val tId = data.optInt("ticketId", 0)
            if (tId == ticketId) {
                runOnUiThread {
                    supportActionBar?.subtitle = "печатает..."
                }
            }
        }

        SocketManager.onStopTyping { data ->
            val tId = data.optInt("ticketId", 0)
            if (tId == ticketId) {
                runOnUiThread {
                    supportActionBar?.subtitle = null
                }
            }
        }
    }

    override fun onDestroy() {
        SocketManager.leaveTicket(ticketId)
        SocketManager.offAll()
        super.onDestroy()
    }

    private fun getStatusText(status: String): String = when (status) {
        "to_do" -> "К выполнению"
        "in_progress" -> "В работе"
        "in_review" -> "На проверке"
        "done" -> "Выполнено"
        "closed" -> "Закрыто"
        else -> status
    }

    private fun getPriorityText(priority: String): String = when (priority) {
        "low" -> "Низкий"
        "normal" -> "Обычный"
        "high" -> "Высокий"
        "urgent" -> "Срочный"
        else -> priority
    }
}
