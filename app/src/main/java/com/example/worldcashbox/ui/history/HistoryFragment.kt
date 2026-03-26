package com.example.worldcashbox.ui.history

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.databinding.FragmentHistoryBinding
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.ui.dashboard.TransactionsAdapter
import com.google.android.material.chip.Chip
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

class HistoryFragment : Fragment() {
    private var _binding: FragmentHistoryBinding? = null
    private val binding get() = _binding!!
    private lateinit var transactionsAdapter: TransactionsAdapter
    private var currentFilter = "all"
    private var allTransactions = listOf<com.example.worldcashbox.data.model.Transaction>()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHistoryBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        setupRecyclerView()
        setupListeners()
        
        // Загружаем данные только при первом создании view, не при каждом переключении вкладок
        if (savedInstanceState == null) {
            // При первой загрузке синхронизируем заявки из CRM
            syncAndLoadTransactions()
        }
    }

    private fun setupListeners() {
        binding.syncButton.setOnClickListener {
            syncData()
        }

        // Настройка фильтров
        binding.filterAll.setOnClickListener { setFilter("all", binding.filterAll) }
        binding.filterPayment.setOnClickListener { setFilter("payment", binding.filterPayment) }
        binding.filterCharge.setOnClickListener { setFilter("charge", binding.filterCharge) }
        binding.filterPending.setOnClickListener { setFilter("pending", binding.filterPending) }

        // Устанавливаем "Все" как выбранный по умолчанию
        setFilter("all", binding.filterAll)
    }

    private fun setFilter(filter: String, selectedChip: Chip) {
        currentFilter = filter

        // Сбрасываем все чипы
        val chips = listOf(binding.filterAll, binding.filterPayment, binding.filterCharge, binding.filterPending)
        chips.forEach { chip ->
            chip.isChecked = chip == selectedChip
            if (chip == selectedChip) {
                chip.setChipBackgroundColorResource(R.color.primary)
                chip.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_light))
            } else {
                chip.setChipBackgroundColorResource(android.R.color.transparent)
                chip.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_dark))
            }
        }

        // Фильтруем транзакции
        filterTransactions()
    }

    private fun filterTransactions() {
        val filtered = when (currentFilter) {
            "all" -> allTransactions
            "payment" -> allTransactions.filter { it.type == "payment" }
            "charge" -> allTransactions.filter { 
                it.type == "charge" || it.item_type == "service_request"
            }
            "pending" -> allTransactions.filter { 
                it.status?.contains("pending", ignoreCase = true) == true || 
                it.description.contains("pending", ignoreCase = true)
            }
            else -> allTransactions
        }
        transactionsAdapter.submitList(filtered)
    }

    private fun syncData() {
        syncRequestsAndLoadTransactions(showToast = true)
    }
    
    private fun syncRequestsAndLoadTransactions(showToast: Boolean = false) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                if (showToast) {
                    binding.syncButton.isEnabled = false
                }
                // Синхронизируем заявки из CRM
                try {
                    val syncResponse = RetrofitClient.apiService.syncServiceRequests()
                    if (syncResponse.isSuccessful && syncResponse.body() != null) {
                        val result = syncResponse.body()!!
                        if (result["success"] == true) {
                            val synced = result["synced"] as? Number ?: 0
                            if (synced.toInt() > 0 && showToast) {
                                Toast.makeText(requireContext(), "Синхронизировано ${synced.toInt()} заявок", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                } catch (syncError: Exception) {
                    android.util.Log.e("HistoryFragment", "Error syncing requests", syncError)
                    // Продолжаем загрузку даже если синхронизация не удалась
                }
                // Загружаем историю после синхронизации
                loadTransactions()
                if (showToast) {
                    Toast.makeText(requireContext(), "Данные синхронизированы", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                if (showToast) {
                    Toast.makeText(requireContext(), "Ошибка синхронизации", Toast.LENGTH_SHORT).show()
                }
            } finally {
                if (showToast) {
                    binding.syncButton.isEnabled = true
                }
            }
        }
    }

    private fun setupRecyclerView() {
        transactionsAdapter = TransactionsAdapter { transaction ->
            // Если это заявка, открываем детали заявки
            if (transaction.item_type == "service_request" || transaction.type == "service_request") {
                val requestId = transaction.request_id ?: transaction.id
                val intent = android.content.Intent(requireContext(), com.example.worldcashbox.ui.myservices.ServiceRequestDetailActivity::class.java)
                intent.putExtra("requestId", requestId)
                startActivity(intent)
            }
            // Для транзакций можно добавить открытие деталей транзакции, если нужно
        }
        binding.transactionsRecyclerView.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = transactionsAdapter
        }
    }

    private fun syncAndLoadTransactions() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                // Синхронизируем заявки из CRM
                try {
                    val syncResponse = RetrofitClient.apiService.syncServiceRequests()
                    if (syncResponse.isSuccessful && syncResponse.body() != null) {
                        val result = syncResponse.body()!!
                        if (result["success"] == true) {
                            val synced = result["synced"] as? Number ?: 0
                            if (synced.toInt() > 0) {
                                android.util.Log.d("HistoryFragment", "Синхронизировано ${synced.toInt()} заявок")
                            }
                        }
                    }
                } catch (syncError: Exception) {
                    android.util.Log.e("HistoryFragment", "Error syncing requests", syncError)
                    // Продолжаем загрузку даже если синхронизация не удалась
                }
                // Загружаем историю после синхронизации
                loadTransactions()
            } catch (e: Exception) {
                android.util.Log.e("HistoryFragment", "Error in syncAndLoadTransactions", e)
            }
        }
    }
    
    private fun loadTransactions() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                android.util.Log.d("HistoryFragment", "Загрузка истории транзакций...")
                val response = RetrofitClient.apiService.getTransactionHistory()
                android.util.Log.d("HistoryFragment", "Ответ получен: код ${response.code()}, успешно: ${response.isSuccessful}")
                
                if (response.isSuccessful && response.body() != null) {
                    allTransactions = response.body()!!.transactions
                    android.util.Log.d("HistoryFragment", "Получено транзакций: ${allTransactions.size}")
                    
                    // Логируем типы элементов
                    val transactionsCount = allTransactions.count { it.item_type == "transaction" || it.item_type == null }
                    val requestsCount = allTransactions.count { it.item_type == "service_request" }
                    android.util.Log.d("HistoryFragment", "Транзакций: $transactionsCount, Заявок: $requestsCount")
                    
                    // Применяем текущий фильтр
                    filterTransactions()
                    
                    // Обновляем статистику (включая заявки в расходах)
                    val payments = allTransactions.filter { it.type == "payment" }.sumOf { it.amount }
                    val charges = allTransactions.filter { 
                        it.type == "charge" || it.item_type == "service_request"
                    }.sumOf { it.amount }
                    
                    android.util.Log.d("HistoryFragment", "Пополнения: $payments, Списания: $charges")
                    
                    val formatter = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
                    binding.paymentsTextView.text = "+${formatter.format(payments)}"
                    binding.chargesTextView.text = "-${formatter.format(charges)}"
                } else {
                    android.util.Log.e("HistoryFragment", "Ошибка ответа: код ${response.code()}, сообщение: ${response.message()}")
                }
            } catch (e: Exception) {
                android.util.Log.e("HistoryFragment", "Ошибка загрузки транзакций", e)
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
