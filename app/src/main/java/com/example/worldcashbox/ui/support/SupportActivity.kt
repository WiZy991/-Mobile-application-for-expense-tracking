package com.example.worldcashbox.ui.support

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Ticket
import com.example.worldcashbox.databinding.ActivitySupportBinding
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class SupportActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySupportBinding
    private var selectedPriority = "normal"
    private val selectedFiles = mutableListOf<Uri>()
    private var showTicketsList = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySupportBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupPriorityChips()
        setupListeners()
        setupTicketsRecyclerView()
        // Не загружаем тикеты при создании, только при открытии экрана "Мои запросы"
    }
    
    override fun onResume() {
        super.onResume()
        // Обновляем список тикетов при возврате на экран, если экран "Мои запросы" открыт
        if (showTicketsList) {
            loadTickets()
        }
    }

    private lateinit var ticketsAdapter: com.example.worldcashbox.ui.support.TicketsAdapter
    
    private fun setupTicketsRecyclerView() {
        binding.ticketsRecyclerView.layoutManager = LinearLayoutManager(this)
        ticketsAdapter = com.example.worldcashbox.ui.support.TicketsAdapter { ticket ->
            val intent = Intent(this, com.example.worldcashbox.ui.support.ClientTicketDetailActivity::class.java)
            intent.putExtra("ticketId", ticket.id)
            startActivity(intent)
        }
        binding.ticketsRecyclerView.adapter = ticketsAdapter
    }

    private fun setupPriorityChips() {
        // по умолчанию - обычный
        binding.priorityNormalChip.isChecked = true
        selectedPriority = "normal"

        binding.priorityChipGroup.setOnCheckedStateChangeListener { _, checkedIds ->
            val id = checkedIds.firstOrNull()
            selectedPriority = when (id) {
                binding.priorityLowChip.id -> "low"
                binding.priorityNormalChip.id -> "normal"
                binding.priorityHighChip.id -> "high"
                binding.priorityUrgentChip.id -> "urgent"
                else -> "normal"
            }
        }
    }

    private fun setupListeners() {
        binding.sendButton.setOnClickListener {
            sendTicket()
        }

        binding.viewTicketsButton.setOnClickListener {
            toggleTicketsList()
        }

        binding.attachImageButton.setOnClickListener {
            pickImage()
        }

        binding.attachDocumentButton.setOnClickListener {
            pickDocument()
        }

        binding.backFromTicketsButton.setOnClickListener {
            toggleTicketsList()
        }
    }

    private fun toggleTicketsList() {
        showTicketsList = !showTicketsList
        if (showTicketsList) {
            binding.formCard.visibility = View.GONE
            binding.ticketsCard.visibility = View.VISIBLE
            loadTickets()
        } else {
            binding.formCard.visibility = View.VISIBLE
            binding.ticketsCard.visibility = View.GONE
        }
    }

    private fun loadTickets() {
        lifecycleScope.launch {
            try {
                android.util.Log.d("Support", "Загрузка списка тикетов...")
                val response = RetrofitClient.apiService.getTickets()
                android.util.Log.d("Support", "Ответ API: код ${response.code()}")
                
                if (response.isSuccessful && response.body() != null) {
                    val ticketsList = response.body()!!.tickets
                    android.util.Log.d("Support", "Получено тикетов: ${ticketsList.size}")
                    
                    ticketsAdapter.submitList(ticketsList)
                    
                    if (ticketsList.isEmpty()) {
                        binding.emptyTicketsTextView.visibility = View.VISIBLE
                        binding.ticketsRecyclerView.visibility = View.GONE
                        android.util.Log.d("Support", "Список тикетов пуст")
                    } else {
                        binding.emptyTicketsTextView.visibility = View.GONE
                        binding.ticketsRecyclerView.visibility = View.VISIBLE
                        android.util.Log.d("Support", "Отображено ${ticketsList.size} тикетов")
                    }
                } else {
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("Support", "Ошибка загрузки тикетов: код ${response.code()}, тело: $errorBody")
                    Toast.makeText(this@SupportActivity, "Ошибка загрузки запросов", Toast.LENGTH_SHORT).show()
                    
                    // Показываем пустое состояние при ошибке
                    binding.emptyTicketsTextView.visibility = View.VISIBLE
                    binding.ticketsRecyclerView.visibility = View.GONE
                }
            } catch (e: Exception) {
                android.util.Log.e("Support", "Исключение при загрузке тикетов", e)
                Toast.makeText(this@SupportActivity, "Ошибка загрузки: ${e.message}", Toast.LENGTH_SHORT).show()
                
                // Показываем пустое состояние при ошибке
                binding.emptyTicketsTextView.visibility = View.VISIBLE
                binding.ticketsRecyclerView.visibility = View.GONE
            }
        }
    }

    private fun pickImage() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        startActivityForResult(Intent.createChooser(intent, "Выберите изображения"), REQUEST_CODE_PICK_IMAGE)
    }

    private fun pickDocument() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        startActivityForResult(Intent.createChooser(intent, "Выберите документы"), REQUEST_CODE_PICK_DOCUMENT)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (resultCode == Activity.RESULT_OK) {
            when (requestCode) {
                REQUEST_CODE_PICK_IMAGE, REQUEST_CODE_PICK_DOCUMENT -> {
                    data?.clipData?.let { clipData ->
                        for (i in 0 until clipData.itemCount) {
                            selectedFiles.add(clipData.getItemAt(i).uri)
                        }
                    } ?: data?.data?.let {
                        selectedFiles.add(it)
                    }
                    updateFilesList()
                }
            }
        }
    }

    private fun updateFilesList() {
        if (selectedFiles.isNotEmpty()) {
            binding.filesRecyclerView.visibility = View.VISIBLE
            // TODO: Обновить RecyclerView с файлами
        } else {
            binding.filesRecyclerView.visibility = View.GONE
        }
    }

    private fun sendTicket() {
        val subject = binding.subjectEditText.text?.toString()?.trim()
        val message = binding.messageEditText.text?.toString()?.trim()

        if (subject.isNullOrBlank()) {
            Toast.makeText(this, "Заполните заголовок", Toast.LENGTH_SHORT).show()
            return
        }

        if (message.isNullOrBlank()) {
            Toast.makeText(this, "Заполните описание", Toast.LENGTH_SHORT).show()
            return
        }

        lifecycleScope.launch {
            try {
                binding.sendButton.isEnabled = false
                binding.sendButton.text = "Отправка..."

                if (selectedFiles.isEmpty()) {
                    val response = RetrofitClient.apiService.createTicket(
                        com.example.worldcashbox.data.model.CreateTicketRequest(
                            subject = subject,
                            message = message,
                            priority = selectedPriority
                        )
                    )

                    if (response.isSuccessful) {
                        Toast.makeText(this@SupportActivity, "Запрос отправлен!", Toast.LENGTH_SHORT).show()
                        binding.subjectEditText.text?.clear()
                        binding.messageEditText.text?.clear()
                        selectedFiles.clear()
                        updateFilesList()
                        selectedPriority = "normal"
                        binding.priorityChipGroup.check(binding.priorityNormalChip.id)
                        loadTickets()
                    } else {
                        Toast.makeText(this@SupportActivity, "Ошибка отправки", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    val subjectBody = subject.toRequestBody("text/plain".toMediaTypeOrNull())
                    val messageBody = message.toRequestBody("text/plain".toMediaTypeOrNull())
                    val priorityBody = selectedPriority.toRequestBody("text/plain".toMediaTypeOrNull())

                    val fileParts = selectedFiles.mapNotNull { uri ->
                        try {
                            val inputStream = contentResolver.openInputStream(uri) ?: return@mapNotNull null
                            val fileName = getFileName(uri) ?: "file_${System.currentTimeMillis()}"
                            val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                            
                            val tempFile = File(cacheDir, fileName)
                            tempFile.outputStream().use { output ->
                                inputStream.copyTo(output)
                            }
                            
                            val requestFile = tempFile.asRequestBody(mimeType.toMediaTypeOrNull())
                            MultipartBody.Part.createFormData("files", fileName, requestFile)
                        } catch (e: Exception) {
                            e.printStackTrace()
                            null
                        }
                    }

                    val response = RetrofitClient.apiService.createTicketWithFiles(
                        subjectBody,
                        messageBody,
                        priorityBody,
                        fileParts
                    )

                    if (response.isSuccessful) {
                        Toast.makeText(this@SupportActivity, "Запрос отправлен! Файлов: ${selectedFiles.size}", Toast.LENGTH_SHORT).show()
                        binding.subjectEditText.text?.clear()
                        binding.messageEditText.text?.clear()
                        selectedFiles.clear()
                        updateFilesList()
                        selectedPriority = "normal"
                        binding.priorityChipGroup.check(binding.priorityNormalChip.id)
                        loadTickets()
                    } else {
                        Toast.makeText(this@SupportActivity, "Ошибка отправки", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(this@SupportActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.sendButton.isEnabled = true
                binding.sendButton.text = "Отправить запрос"
            }
        }
    }

    private fun getFileName(uri: Uri): String? {
        var result: String? = null
        if (uri.scheme == "content") {
            val cursor = contentResolver.query(uri, null, null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (nameIndex >= 0) {
                        result = it.getString(nameIndex)
                    }
                }
            }
        }
        if (result == null) {
            result = uri.path
            val cut = result?.lastIndexOf('/')
            if (cut != -1) {
                result = result?.substring(cut!! + 1)
            }
        }
        return result
    }

    override fun onSupportNavigateUp(): Boolean {
        if (showTicketsList) {
            toggleTicketsList()
            return true
        }
        onBackPressed()
        return true
    }

    companion object {
        private const val REQUEST_CODE_PICK_IMAGE = 1001
        private const val REQUEST_CODE_PICK_DOCUMENT = 1002
    }
}
