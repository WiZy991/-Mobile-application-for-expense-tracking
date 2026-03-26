package com.example.worldcashbox.ui.myservices

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.databinding.ActivityMyServicesBinding
import com.example.worldcashbox.ui.services.ServicesFragment
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

class MyServicesActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMyServicesBinding
    private lateinit var tokenManager: TokenManager
    private val services = mutableListOf<com.example.worldcashbox.data.model.Service>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMyServicesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Инициализируем RetrofitClient и TokenManager
        RetrofitClient.initialize(this)
        tokenManager = TokenManager(this)

        // Проверяем авторизацию
        if (!tokenManager.isLoggedIn()) {
            android.util.Log.w("MyServices", "Пользователь не авторизован, токен: ${tokenManager.getToken()}")
            Toast.makeText(this, "Требуется авторизация", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        
        android.util.Log.d("MyServices", "Activity создана, токен присутствует")

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupRecyclerView()
        setupSwipeRefresh()
        // При первой загрузке синхронизируем заявки из CRM
        syncRequestsAndLoadServices()
    }

    private fun setupRecyclerView() {
        binding.servicesRecyclerView.layoutManager = LinearLayoutManager(this)
        val adapter = MyServicesAdapter(services) { service ->
            if (service.type == "request") {
                // Открываем детали заявки
                openServiceRequestDetails(service.id)
            } else {
                // Показываем диалог отмены для услуги
                showCancelDialog(service)
            }
        }
        binding.servicesRecyclerView.adapter = adapter
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            // При обновлении сначала синхронизируем заявки из CRM
            syncRequestsAndLoadServices()
        }
    }
    
    private fun syncRequestsAndLoadServices() {
        lifecycleScope.launch {
            try {
                // Синхронизируем заявки из CRM
                val syncResponse = RetrofitClient.apiService.syncServiceRequests()
                if (syncResponse.isSuccessful && syncResponse.body() != null) {
                    val result = syncResponse.body()!!
                    if (result["success"] == true) {
                        val synced = result["synced"] as? Number ?: 0
                        if (synced.toInt() > 0) {
                            Toast.makeText(this@MyServicesActivity, "Синхронизировано ${synced.toInt()} заявок", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("MyServices", "Error syncing requests", e)
                // Не показываем ошибку, просто продолжаем загрузку
            } finally {
                // Загружаем услуги после синхронизации
                loadMyServices()
            }
        }
    }

    private fun loadMyServices() {
        lifecycleScope.launch {
            try {
                android.util.Log.d("MyServices", "Начало загрузки услуг...")
                binding.swipeRefresh.isRefreshing = true
                
                // Проверяем токен перед запросом
                val token = tokenManager.getToken()
                if (token == null) {
                    android.util.Log.w("MyServices", "Токен отсутствует при загрузке услуг")
                    Toast.makeText(this@MyServicesActivity, "Требуется авторизация", Toast.LENGTH_SHORT).show()
                    binding.swipeRefresh.isRefreshing = false
                    return@launch
                }
                
                android.util.Log.d("MyServices", "Отправка запроса getMyServices...")
                val response = RetrofitClient.apiService.getMyServices()
                android.util.Log.d("MyServices", "Получен ответ: код ${response.code()}, успешно: ${response.isSuccessful}")
                
                if (response.isSuccessful) {
                    try {
                        val body = response.body()
                        android.util.Log.d("MyServices", "Получено услуг: ${body?.size ?: 0}")
                        
                        if (body != null && body.isNotEmpty()) {
                            services.clear()
                            services.addAll(body)
                            android.util.Log.d("MyServices", "Добавлено в список: ${services.size} услуг")
                            
                            // Логируем типы услуг
                            val servicesCount = services.count { it.type == "service" }
                            val requestsCount = services.count { it.type == "request" }
                            android.util.Log.d("MyServices", "Услуг: $servicesCount, Заявок: $requestsCount")
                            
                            // Обновляем адаптер безопасно
                            val adapter = binding.servicesRecyclerView.adapter
                            if (adapter != null) {
                                adapter.notifyDataSetChanged()
                                android.util.Log.d("MyServices", "Адаптер обновлен")
                            } else {
                                android.util.Log.w("MyServices", "Adapter is null, recreating")
                                setupRecyclerView()
                            }
                            
                            binding.emptyContainer.visibility = View.GONE
                            binding.servicesRecyclerView.visibility = View.VISIBLE
                        } else {
                            android.util.Log.w("MyServices", "Список услуг пуст или null")
                            services.clear()
                            val adapter = binding.servicesRecyclerView.adapter
                            adapter?.notifyDataSetChanged()
                            binding.emptyContainer.visibility = View.VISIBLE
                            binding.servicesRecyclerView.visibility = View.GONE
                        }
                    } catch (parseException: Exception) {
                        android.util.Log.e("MyServices", "Error parsing services", parseException)
                        Toast.makeText(
                            this@MyServicesActivity,
                            "Ошибка обработки данных: ${parseException.message}",
                            Toast.LENGTH_LONG
                        ).show()
                        // Показываем пустой список вместо краша
                        services.clear()
                        val adapter = binding.servicesRecyclerView.adapter
                        adapter?.notifyDataSetChanged()
                        binding.emptyContainer.visibility = View.VISIBLE
                        binding.servicesRecyclerView.visibility = View.GONE
                    }
                } else {
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("MyServices", "API error: ${response.code()}, $errorBody")
                    
                    // Проверяем код ошибки
                    when (response.code()) {
                        401 -> {
                            // Неавторизован - показываем ошибку, но не закрываем Activity
                            android.util.Log.w("MyServices", "Ошибка 401: Требуется авторизация. Токен: ${tokenManager.getToken()?.take(20)}...")
                            Toast.makeText(
                                this@MyServicesActivity,
                                "Ошибка авторизации. Проверьте вход в систему.",
                                Toast.LENGTH_LONG
                            ).show()
                            // НЕ закрываем Activity, показываем пустой список
                        }
                        403 -> {
                            Toast.makeText(
                                this@MyServicesActivity,
                                "Нет доступа к услугам",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                        else -> {
                            android.util.Log.e("MyServices", "Ошибка загрузки: код ${response.code()}, тело: $errorBody")
                            Toast.makeText(
                                this@MyServicesActivity,
                                "Ошибка загрузки услуг: ${response.code()}",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                    
                    // Показываем пустой список при ошибке (НЕ закрываем Activity)
                    services.clear()
                    val adapter = binding.servicesRecyclerView.adapter
                    adapter?.notifyDataSetChanged()
                    binding.emptyContainer.visibility = View.VISIBLE
                    binding.servicesRecyclerView.visibility = View.GONE
                }
            } catch (e: Exception) {
                // Не показываем ошибку, если задача была отменена
                if (e is kotlinx.coroutines.CancellationException) {
                    android.util.Log.d("MyServices", "Загрузка услуг отменена")
                    return@launch
                }
                
                android.util.Log.e("MyServices", "Error loading services", e)
                
                // Проверяем, не связана ли ошибка с авторизацией
                val errorMessage = e.message ?: "Неизвестная ошибка"
                android.util.Log.e("MyServices", "Ошибка загрузки услуг: $errorMessage", e)
                
                if (errorMessage.contains("401") || errorMessage.contains("Unauthorized")) {
                    android.util.Log.w("MyServices", "Ошибка авторизации в catch блоке. Токен: ${tokenManager.getToken()?.take(20)}...")
                    Toast.makeText(
                        this@MyServicesActivity,
                        "Ошибка авторизации. Проверьте вход в систему.",
                        Toast.LENGTH_LONG
                    ).show()
                    // НЕ закрываем Activity, показываем пустой список
                } else {
                    Toast.makeText(
                        this@MyServicesActivity,
                        "Ошибка загрузки: $errorMessage",
                        Toast.LENGTH_LONG
                    ).show()
                }
                
                // Показываем пустой список вместо краша (НЕ закрываем Activity)
                services.clear()
                val adapter = binding.servicesRecyclerView.adapter
                adapter?.notifyDataSetChanged()
                binding.emptyContainer.visibility = View.VISIBLE
                binding.servicesRecyclerView.visibility = View.GONE
            } finally {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun showCancelDialog(service: com.example.worldcashbox.data.model.Service) {
        AlertDialog.Builder(this)
            .setTitle("Отключить услугу")
            .setMessage("Вы уверены, что хотите отключить услугу \"${service.name}\"?")
            .setPositiveButton("Отключить") { _, _ ->
                val serviceId = service.serviceId ?: service.id
                cancelService(serviceId, service.name)
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun cancelService(serviceId: Int, serviceName: String) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.cancelService(serviceId)
                if (response.isSuccessful) {
                    Toast.makeText(this@MyServicesActivity, "Услуга \"$serviceName\" отключена", Toast.LENGTH_SHORT).show()
                    loadMyServices()
                } else {
                    Toast.makeText(this@MyServicesActivity, "Ошибка отключения услуги", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("MyServices", "Error canceling service", e)
                Toast.makeText(this@MyServicesActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    fun goToCatalog(view: View) {
        // Переход к Services через MainActivity
        val intent = Intent(this, com.example.worldcashbox.ui.main.MainActivity::class.java)
        intent.putExtra("navigateTo", "services")
        startActivity(intent)
        finish()
    }

    private fun openServiceRequestDetails(requestId: Int) {
        val intent = Intent(this, ServiceRequestDetailActivity::class.java)
        intent.putExtra("requestId", requestId)
        startActivity(intent)
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}

// Адаптер для списка услуг
class MyServicesAdapter(
    private val services: List<com.example.worldcashbox.data.model.Service>,
    private val onCancelClick: (com.example.worldcashbox.data.model.Service) -> Unit
) : androidx.recyclerview.widget.RecyclerView.Adapter<MyServicesAdapter.ViewHolder>() {

    class ViewHolder(val view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view)

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
        val view = android.view.LayoutInflater.from(parent.context)
            .inflate(R.layout.item_my_service, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        try {
            // Проверяем границы массива
            if (position < 0 || position >= services.size) {
                android.util.Log.e("MyServicesAdapter", "Invalid position: $position, size: ${services.size}")
                return
            }
            
            val service = services[position]
            
            // Безопасно получаем все View элементы
            val nameText = holder.view.findViewById<android.widget.TextView>(R.id.serviceNameTextView)
            val descriptionText = holder.view.findViewById<android.widget.TextView>(R.id.serviceDescriptionTextView)
            val priceText = holder.view.findViewById<android.widget.TextView>(R.id.servicePriceTextView)
            val statusText = holder.view.findViewById<android.widget.TextView>(R.id.serviceStatusTextView)
            val startDateText = holder.view.findViewById<android.widget.TextView>(R.id.serviceStartDateTextView)
            val endDateText = holder.view.findViewById<android.widget.TextView>(R.id.serviceEndDateTextView)
            val cancelButton = holder.view.findViewById<com.google.android.material.button.MaterialButton>(R.id.cancelServiceButton)
            
            // Проверяем, что все необходимые View элементы найдены
            if (nameText == null || priceText == null || statusText == null || cancelButton == null) {
                android.util.Log.e("MyServicesAdapter", "Some views are null in layout")
                return
            }

            nameText.text = service.name ?: "Без названия"
            
            if (descriptionText != null) {
                descriptionText.text = service.description ?: ""
                descriptionText.visibility = if (service.description.isNullOrBlank()) View.GONE else View.VISIBLE
            }

            val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
            if (service.type == "request") {
                // Для заявок показываем общую сумму
                val totalAmount = service.totalAmount ?: (service.price ?: 0.0) * (service.quantity ?: 1)
                priceText.text = "${formatter.format(totalAmount)} ₽"
            } else {
                // Для услуг показываем цену с периодом
                val price = service.price ?: 0.0
                val periodText = when (service.billingPeriod) {
                    "monthly" -> "/мес"
                    "yearly" -> "/год"
                    "one_time" -> "разово"
                    else -> ""
                }
                priceText.text = "${formatter.format(price)} ₽ $periodText"
            }

            // Для заявок статус не показываем (работа ведется в СБИС, статус не отслеживается)
            // Для услуг показываем статус услуги
            if (service.type == "request") {
                // Скрываем статус для заявок
                statusText.visibility = View.GONE
            } else {
                val isActive = service.isActive ?: true
                statusText.visibility = View.VISIBLE
                statusText.text = if (isActive) "✓ Активно" else "× Отключено"
                try {
                    statusText.setTextColor(holder.view.context.getColor(
                        if (isActive) com.example.worldcashbox.R.color.success else com.example.worldcashbox.R.color.error
                    ))
                } catch (e: Exception) {
                    android.util.Log.e("MyServicesAdapter", "Error setting status color", e)
                }
            }

            if (startDateText != null) {
                if (service.startDate != null) {
                    try {
                        // Пробуем разные форматы даты
                        val dateFormats = listOf(
                            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()),
                            SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()),
                            SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                        )
                        val outputFormat = SimpleDateFormat("d MMM yyyy", Locale("ru", "RU"))
                        var date: Date? = null
                        for (format in dateFormats) {
                            try {
                                date = format.parse(service.startDate)
                                break
                            } catch (e: Exception) {
                                // Пробуем следующий формат
                            }
                        }
                        val label = if (service.type == "request") "Создано: " else "Подключено: "
                        startDateText.text = "${label}${if (date != null) outputFormat.format(date) else service.startDate}"
                        startDateText.visibility = View.VISIBLE
                    } catch (e: Exception) {
                        val label = if (service.type == "request") "Создано: " else "Подключено: "
                        startDateText.text = "${label}${service.startDate}"
                        startDateText.visibility = View.VISIBLE
                    }
                } else {
                    startDateText.visibility = View.GONE
                }
            }

            if (endDateText != null) {
                if (service.endDate != null) {
                    try {
                        val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                        val outputFormat = SimpleDateFormat("d MMM yyyy", Locale("ru", "RU"))
                        val date = inputFormat.parse(service.endDate)
                        endDateText.text = "Действует до: ${if (date != null) outputFormat.format(date) else service.endDate}"
                        endDateText.visibility = View.VISIBLE
                    } catch (e: Exception) {
                        endDateText.text = "Действует до: ${service.endDate}"
                        endDateText.visibility = View.VISIBLE
                    }
                } else {
                    endDateText.visibility = View.GONE
                }
            }

            // Для заявок не показываем кнопку отмены, для услуг - только если активно
            if (service.type == "request") {
                cancelButton.visibility = View.GONE
            } else {
                val isActive = service.isActive ?: true
                cancelButton.visibility = if (isActive) View.VISIBLE else View.GONE
                cancelButton.setOnClickListener {
                    onCancelClick(service)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("MyServicesAdapter", "Error binding view holder at position $position", e)
            e.printStackTrace()
        }
    }

    override fun getItemCount() = services.size
}
