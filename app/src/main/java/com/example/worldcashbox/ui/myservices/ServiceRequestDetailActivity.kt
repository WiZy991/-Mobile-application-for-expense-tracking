package com.example.worldcashbox.ui.myservices

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.data.api.ApiConfig
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.ServiceRequest
import com.example.worldcashbox.databinding.ActivityServiceRequestDetailBinding
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

class ServiceRequestDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivityServiceRequestDetailBinding
    private var requestId: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityServiceRequestDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        requestId = intent.getIntExtra("requestId", 0)
        if (requestId == 0) {
            Toast.makeText(this, "Ошибка: не указан ID заявки", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        loadRequestDetails()
        
        binding.downloadInvoiceButton.setOnClickListener {
            downloadInvoice()
        }
    }

    private fun loadRequestDetails() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getServiceRequest(requestId)
                if (response.isSuccessful && response.body() != null) {
                    val request = response.body()!!
                    displayRequestDetails(request)
                } else {
                    Toast.makeText(this@ServiceRequestDetailActivity, "Ошибка загрузки заявки", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("ServiceRequestDetail", "Error loading request", e)
                Toast.makeText(this@ServiceRequestDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun displayRequestDetails(request: ServiceRequest) {
        binding.serviceNameTextView.text = request.service_name
        binding.servicePriceTextView.text = "${NumberFormat.getNumberInstance(Locale("ru", "RU")).format(request.price)} ₽"
        binding.serviceQuantityTextView.text = request.quantity.toString()
        binding.serviceTotalTextView.text = "${NumberFormat.getNumberInstance(Locale("ru", "RU")).format(request.total_amount)} ₽"
        
        // Статус не отображаем, так как работа ведется в СБИС и статус не отслеживается автоматически

        if (request.notes != null && request.notes.isNotEmpty()) {
            binding.serviceNotesTextView.text = request.notes
            binding.notesCard.visibility = android.view.View.VISIBLE
        } else {
            binding.notesCard.visibility = android.view.View.GONE
        }

        try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            val outputFormat = SimpleDateFormat("d MMM yyyy, HH:mm", Locale("ru", "RU"))
            val date = inputFormat.parse(request.created_at)
            binding.serviceDateTextView.text = if (date != null) outputFormat.format(date) else request.created_at
        } catch (e: Exception) {
            binding.serviceDateTextView.text = request.created_at
        }

        // Показываем информацию о счете, если он есть
        if (request.invoice_url != null && request.invoice_url.isNotEmpty()) {
            binding.invoiceContainer.visibility = android.view.View.VISIBLE
            binding.invoiceNumberTextView.text = request.invoice_number ?: "Не указан"
            binding.downloadInvoiceButton.visibility = android.view.View.VISIBLE
        } else {
            binding.invoiceContainer.visibility = android.view.View.GONE
            binding.downloadInvoiceButton.visibility = android.view.View.GONE
        }
    }

    private fun downloadInvoice() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getServiceRequest(requestId)
                if (response.isSuccessful && response.body() != null) {
                    val request = response.body()!!
                    val invoiceUrl = request.invoice_url ?: return@launch
                    
                    val fullUrl = if (invoiceUrl.startsWith("http")) {
                        invoiceUrl
                    } else {
                        val baseUrl = ApiConfig.getBaseUrl(this@ServiceRequestDetailActivity)
                        val apiBaseUrl = baseUrl.removeSuffix("/api/")
                        "$apiBaseUrl$invoiceUrl"
                    }
                    
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    
                    try {
                        startActivity(intent)
                        Toast.makeText(this@ServiceRequestDetailActivity, "Счет открыт", Toast.LENGTH_SHORT).show()
                    } catch (e: Exception) {
                        Toast.makeText(this@ServiceRequestDetailActivity, "Не удалось открыть счет. Установите приложение для просмотра PDF", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("ServiceRequestDetail", "Error downloading invoice", e)
                Toast.makeText(this@ServiceRequestDetailActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}
