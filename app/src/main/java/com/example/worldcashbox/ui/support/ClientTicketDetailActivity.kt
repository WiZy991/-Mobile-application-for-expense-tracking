package com.example.worldcashbox.ui.support

import android.app.Activity
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
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.bumptech.glide.Glide
import com.bumptech.glide.load.model.GlideUrl
import com.bumptech.glide.load.model.LazyHeaders
import com.bumptech.glide.load.resource.bitmap.CenterCrop
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.ApiConfig
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Message
import com.example.worldcashbox.data.model.MessageFile
import com.example.worldcashbox.data.model.MessageReaction
import com.example.worldcashbox.databinding.ActivityClientTicketDetailBinding
import com.example.worldcashbox.data.api.SocketManager
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.text.SimpleDateFormat
import java.util.*

class ClientTicketDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivityClientTicketDetailBinding
    private var ticketId: Int = 0
    private var ticket: com.example.worldcashbox.data.model.Ticket? = null
    private val messages = mutableListOf<Message>()
    private val selectedFiles = mutableListOf<Uri>()

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty()) {
            selectedFiles.addAll(uris)
            updateAttachmentsPreview()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityClientTicketDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)

        ticketId = intent.getIntExtra("ticketId", 0)
        if (ticketId == 0) {
            Toast.makeText(this, "Ошибка: не указан ID тикета", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        setupRecyclerView()
        setupListeners()
        loadTicketDetails()
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
                runOnUiThread { supportActionBar?.subtitle = "печатает..." }
            }
        }

        SocketManager.onStopTyping { data ->
            val tId = data.optInt("ticketId", 0)
            if (tId == ticketId) {
                runOnUiThread { supportActionBar?.subtitle = null }
            }
        }
    }

    override fun onDestroy() {
        SocketManager.leaveTicket(ticketId)
        SocketManager.offAll()
        super.onDestroy()
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

    private fun setupListeners() {
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.sendMessageButton.setOnClickListener { sendMessage() }
        binding.attachFileButton.setOnClickListener { filePickerLauncher.launch("*/*") }
    }

    private fun updateAttachmentsPreview() {
        if (selectedFiles.isEmpty()) {
            binding.attachmentsPreviewRecyclerView.visibility = View.GONE
            return
        }
        binding.attachmentsPreviewRecyclerView.visibility = View.VISIBLE
        binding.attachmentsPreviewRecyclerView.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.attachmentsPreviewRecyclerView.adapter = AttachmentPreviewAdapter(
            selectedFiles, this
        ) { position ->
            selectedFiles.removeAt(position)
            updateAttachmentsPreview()
        }
    }

    private fun loadTicketDetails(showLoading: Boolean = true) {
        lifecycleScope.launch {
            try {
                if (showLoading) binding.progressBar.visibility = View.VISIBLE

                val response = RetrofitClient.apiService.getTicketDetail(ticketId)
                if (response.isSuccessful && response.body() != null) {
                    val ticketDetail = response.body()!!
                    ticket = ticketDetail.ticket
                    messages.clear()
                    messages.addAll(ticketDetail.messages)
                    displayTicket()
                } else {
                    if (showLoading) {
                        Toast.makeText(this@ClientTicketDetailActivity, "Ошибка загрузки тикета", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                if (showLoading) {
                    Toast.makeText(this@ClientTicketDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
                }
            } finally {
                if (showLoading) binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun displayTicket() {
        val t = ticket ?: return

        binding.ticketSubjectTextView.text = t.subject
        supportActionBar?.title = "Тикет #${t.id}"

        binding.statusBadgeTextView.text = getStatusText(t.status)
        binding.statusBadgeTextView.setTextColor(getColor(getStatusColor(t.status)))
        binding.statusBadgeTextView.setBackgroundResource(R.drawable.bg_status_badge)

        binding.priorityBadgeTextView.text = getPriorityText(t.priority)
        binding.priorityBadgeTextView.setTextColor(getColor(getPriorityColor(t.priority)))
        binding.priorityBadgeTextView.setBackgroundResource(R.drawable.bg_status_badge)

        if (t.createdAt != null) {
            try {
                val dateFormats = listOf(
                    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()),
                    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()),
                    SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
                )
                val outputFormat = SimpleDateFormat("dd.MM.yyyy, HH:mm", Locale("ru", "RU"))
                var date: Date? = null
                for (format in dateFormats) {
                    try { date = format.parse(t.createdAt); break } catch (_: Exception) { }
                }
                binding.ticketDateTextView.text = "Создан: ${if (date != null) outputFormat.format(date) else t.createdAt}"
            } catch (e: Exception) {
                binding.ticketDateTextView.text = "Создан: ${t.createdAt}"
            }
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
        val hasFiles = selectedFiles.isNotEmpty()

        if (messageText.isNullOrBlank() && !hasFiles) {
            Toast.makeText(this, "Введите сообщение или прикрепите файл", Toast.LENGTH_SHORT).show()
            return
        }

        lifecycleScope.launch {
            try {
                binding.sendMessageButton.isEnabled = false

                if (hasFiles) {
                    val msgBody = (messageText ?: "").toRequestBody("text/plain".toMediaTypeOrNull())
                    val parts = mutableListOf<MultipartBody.Part>()

                    for (uri in selectedFiles) {
                        val inputStream = contentResolver.openInputStream(uri) ?: continue
                        val bytes = inputStream.readBytes()
                        inputStream.close()
                        val fileName = getFileName(uri)
                        val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                        val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
                        parts.add(MultipartBody.Part.createFormData("files", fileName, requestBody))
                    }

                    val response = RetrofitClient.apiService.addMessageWithFiles(ticketId, msgBody, parts)
                    if (response.isSuccessful) {
                        binding.newMessageEditText.text?.clear()
                        selectedFiles.clear()
                        updateAttachmentsPreview()
                        kotlinx.coroutines.delay(500)
                        loadTicketDetails(false)
                    } else {
                        Toast.makeText(this@ClientTicketDetailActivity, "Ошибка отправки", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    val response = RetrofitClient.apiService.addMessage(
                        ticketId,
                        com.example.worldcashbox.data.model.AddMessageRequest(messageText!!)
                    )
                    if (response.isSuccessful) {
                        binding.newMessageEditText.text?.clear()
                        kotlinx.coroutines.delay(500)
                        loadTicketDetails(false)
                    } else {
                        Toast.makeText(this@ClientTicketDetailActivity, "Ошибка отправки", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(this@ClientTicketDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
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
                RetrofitClient.apiService.toggleReaction(
                    ticketId, messageId, mapOf("emoji" to emoji)
                )
                kotlinx.coroutines.delay(300)
                loadTicketDetails(false)
            } catch (e: Exception) {
                Toast.makeText(this@ClientTicketDetailActivity, "Ошибка реакции", Toast.LENGTH_SHORT).show()
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
        val glideUrl = buildGlideUrl(fullUrl)
        Glide.with(this).load(glideUrl).into(imageView)

        dialog.show()
    }

    fun getFullFileUrl(relativeUrl: String?): String {
        if (relativeUrl == null) return ""
        if (relativeUrl.startsWith("http")) return relativeUrl
        val base = ApiConfig.getBaseUrl(this).trimEnd('/').removeSuffix("/api")
        return "$base$relativeUrl"
    }

    fun buildGlideUrl(url: String): GlideUrl {
        val token = TokenManager(this).getToken() ?: ""
        return GlideUrl(
            url,
            LazyHeaders.Builder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        )
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    private fun getStatusText(status: String): String = when (status) {
        "to_do" -> "К выполнению"
        "in_progress" -> "В работе"
        "in_review" -> "На проверке"
        "done" -> "Выполнено"
        "closed" -> "Закрыто"
        "open" -> "Открыт"
        "resolved" -> "Решен"
        else -> status
    }

    private fun getStatusColor(status: String): Int = when (status) {
        "to_do" -> R.color.warning
        "in_progress" -> R.color.primary
        "in_review" -> R.color.info
        "done" -> R.color.success
        "closed" -> R.color.text_muted
        "open" -> R.color.warning
        "resolved" -> R.color.success
        else -> R.color.text_muted
    }

    private fun getPriorityText(priority: String): String = when (priority) {
        "urgent" -> "Срочно"
        "high" -> "Высокий"
        "normal" -> "Обычный"
        "low" -> "Низкий"
        else -> priority
    }

    private fun getPriorityColor(priority: String): Int = when (priority) {
        "urgent" -> R.color.error
        "high" -> R.color.warning
        "normal" -> R.color.primary
        "low" -> R.color.text_muted
        else -> R.color.text_muted
    }
}

// Адаптер превью вложений
class AttachmentPreviewAdapter(
    private val files: List<Uri>,
    private val activity: Activity,
    private val onRemove: (Int) -> Unit
) : androidx.recyclerview.widget.RecyclerView.Adapter<AttachmentPreviewAdapter.ViewHolder>() {

    class ViewHolder(val view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val layout = LinearLayout(parent.context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(8, 8, 8, 8)
            layoutParams = ViewGroup.LayoutParams(120, ViewGroup.LayoutParams.WRAP_CONTENT)
        }

        val imageView = ImageView(parent.context).apply {
            layoutParams = LinearLayout.LayoutParams(100, 100)
            scaleType = ImageView.ScaleType.CENTER_CROP
            tag = "preview_image"
        }
        layout.addView(imageView)

        val nameView = TextView(parent.context).apply {
            textSize = 10f
            maxLines = 1
            tag = "file_name"
            gravity = Gravity.CENTER
        }
        layout.addView(nameView)

        val removeBtn = TextView(parent.context).apply {
            text = "✕"
            textSize = 16f
            setTextColor(0xFFFF0000.toInt())
            gravity = Gravity.CENTER
            tag = "remove_btn"
        }
        layout.addView(removeBtn)

        return ViewHolder(layout)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val uri = files[position]
        val layout = holder.view as LinearLayout
        val imageView = layout.findViewWithTag<ImageView>("preview_image")
        val nameView = layout.findViewWithTag<TextView>("file_name")
        val removeBtn = layout.findViewWithTag<TextView>("remove_btn")

        val mimeType = activity.contentResolver.getType(uri) ?: ""
        if (mimeType.startsWith("image/")) {
            Glide.with(activity).load(uri).centerCrop().into(imageView)
        } else {
            imageView.setImageResource(R.drawable.ic_attach_file)
        }

        var fileName = "Файл"
        val cursor = activity.contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val idx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) fileName = it.getString(idx)
            }
        }
        nameView.text = fileName

        removeBtn.setOnClickListener { onRemove(holder.adapterPosition) }
    }

    override fun getItemCount() = files.size
}

// Адаптер для сообщений — используется и клиентом, и инженером
class MessagesAdapter(
    private val onReactionClick: (Message) -> Unit,
    private val onFileClick: (MessageFile) -> Unit,
    private val onImageClick: ((MessageFile) -> Unit)? = null,
    private val onLongPress: ((Message, View) -> Unit)? = null
) : androidx.recyclerview.widget.RecyclerView.Adapter<MessagesAdapter.ViewHolder>() {

    private val items = mutableListOf<Message>()

    class ViewHolder(val view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view)

    fun updateMessages(newMessages: List<Message>) {
        items.clear()
        items.addAll(newMessages)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_message, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val message = items[position]
        val context = holder.view.context
        val density = context.resources.displayMetrics.density
        fun dp(v: Int): Int = (v * density).toInt()

        val messageText = holder.view.findViewById<TextView>(R.id.messageTextView)
        val userNameText = holder.view.findViewById<TextView>(R.id.userNameTextView)
        val dateText = holder.view.findViewById<TextView>(R.id.messageDateTextView)
        val messageCard = holder.view.findViewById<com.google.android.material.card.MaterialCardView>(R.id.messageCard)
        val inlineImageView = holder.view.findViewById<ImageView>(R.id.inlineImageView)
        val fileCard = holder.view.findViewById<LinearLayout>(R.id.fileCard)
        val fileNameTextView = holder.view.findViewById<TextView>(R.id.fileNameTextView)
        val fileSizeTextView = holder.view.findViewById<TextView>(R.id.fileSizeTextView)
        val fileIconView = holder.view.findViewById<ImageView>(R.id.fileIconView)
        val reactionsContainer = holder.view.findViewById<LinearLayout>(R.id.reactionsContainer)

        // Текст сообщения
        val msgText = message.message
        if (msgText.isNullOrBlank()) {
            messageText.visibility = View.GONE
        } else {
            messageText.visibility = View.VISIBLE
            messageText.text = msgText
        }

        // Имя отправителя
        val isFromClient = message.userType == "client"
        if (isFromClient) {
            userNameText.visibility = View.GONE
        } else {
            userNameText.visibility = View.VISIBLE
            userNameText.text = message.userName ?: "Поддержка"
        }

        // Время
        dateText.text = formatTime(message.createdAt)

        // Расположение бабла: клиент — справа (END), поддержка — слева (START)
        val lp = messageCard.layoutParams as ConstraintLayout.LayoutParams
        if (isFromClient) {
            // Убираем start-привязку, ставим end-привязку → бабл прижат вправо
            lp.startToStart = ConstraintLayout.LayoutParams.UNSET
            lp.endToEnd = ConstraintLayout.LayoutParams.PARENT_ID
            lp.marginStart = dp(60)
            lp.marginEnd = dp(4)
            messageCard.setCardBackgroundColor(context.getColor(R.color.primary_light))
        } else {
            // Убираем end-привязку, ставим start-привязку → бабл прижат влево
            lp.startToStart = ConstraintLayout.LayoutParams.PARENT_ID
            lp.endToEnd = ConstraintLayout.LayoutParams.UNSET
            lp.marginStart = dp(4)
            lp.marginEnd = dp(60)
            messageCard.setCardBackgroundColor(context.getColor(R.color.background_light))
        }
        messageCard.layoutParams = lp

        // Файлы — берём первый файл (основной) 
        val files = message.files
        val firstImage = files?.firstOrNull { isImageFile(it) }
        val firstDoc = files?.firstOrNull { !isImageFile(it) }

        // Инлайн-изображение
        if (firstImage != null) {
            inlineImageView.visibility = View.VISIBLE
            val fullUrl = getFullFileUrl(context, firstImage.fileUrl)
            val glideUrl = buildGlideUrl(context, fullUrl)
            Glide.with(context)
                .load(glideUrl)
                .transform(CenterCrop(), RoundedCorners(dp(12)))
                .placeholder(R.drawable.bg_file_card)
                .into(inlineImageView)

            inlineImageView.setOnClickListener {
                onImageClick?.invoke(firstImage) ?: onFileClick(firstImage)
            }
        } else {
            inlineImageView.visibility = View.GONE
        }

        // Файл-документ
        if (firstDoc != null) {
            fileCard.visibility = View.VISIBLE
            fileNameTextView.text = firstDoc.fileName
            fileSizeTextView.text = formatFileSize(firstDoc.fileSize)
            fileCard.setOnClickListener { onFileClick(firstDoc) }
        } else {
            fileCard.visibility = View.GONE
        }

        // Остальные файлы (если > 1) — пока не показываем, можно расширить

        // Реакции
        reactionsContainer.removeAllViews()
        val reactions = message.reactions
        if (!reactions.isNullOrEmpty()) {
            reactionsContainer.visibility = View.VISIBLE
            val grouped = reactions.groupBy { it.emoji }
            for ((emoji, reactionList) in grouped) {
                val chip = TextView(context).apply {
                    text = "$emoji ${reactionList.size}"
                    textSize = 13f
                    setPadding(dp(8), dp(4), dp(8), dp(4))
                    setBackgroundResource(R.drawable.bg_reaction)
                    this.layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginEnd = dp(4) }
                    setOnClickListener { onReactionClick(message) }
                }
                reactionsContainer.addView(chip)
            }
        } else {
            reactionsContainer.visibility = View.GONE
        }

        // Long press для реакций (Telegram-style)
        messageCard.setOnLongClickListener {
            if (onLongPress != null) {
                onLongPress.invoke(message, messageCard)
            } else {
                onReactionClick(message)
            }
            true
        }
    }

    private fun isImageFile(file: MessageFile): Boolean {
        return file.mimeType?.startsWith("image/") == true ||
                file.fileType?.lowercase() in listOf("image", "jpg", "jpeg", "png", "gif", "webp")
    }

    private fun getFullFileUrl(context: android.content.Context, relativeUrl: String?): String {
        if (relativeUrl == null) return ""
        if (relativeUrl.startsWith("http")) return relativeUrl
        val base = ApiConfig.getBaseUrl(context).trimEnd('/').removeSuffix("/api")
        return "$base$relativeUrl"
    }

    private fun buildGlideUrl(context: android.content.Context, url: String): GlideUrl {
        val token = TokenManager(context).getToken() ?: ""
        return GlideUrl(
            url,
            LazyHeaders.Builder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        )
    }

    private fun formatTime(createdAt: String?): String {
        if (createdAt == null) return ""
        val formats = listOf(
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd HH:mm:ss"
        )
        for (fmt in formats) {
            try {
                val date = SimpleDateFormat(fmt, Locale.getDefault()).parse(createdAt) ?: continue
                return SimpleDateFormat("HH:mm", Locale("ru", "RU")).format(date)
            } catch (_: Exception) { }
        }
        return ""
    }

    private fun formatFileSize(size: Int?): String {
        if (size == null || size == 0) return ""
        return when {
            size < 1024 -> "$size B"
            size < 1024 * 1024 -> "${size / 1024} KB"
            else -> String.format("%.1f MB", size / (1024.0 * 1024.0))
        }
    }

    override fun getItemCount() = items.size
}
