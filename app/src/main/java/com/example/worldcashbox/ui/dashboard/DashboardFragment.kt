package com.example.worldcashbox.ui.dashboard

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.local.ClientStorage
import com.example.worldcashbox.databinding.FragmentDashboardBinding
import com.example.worldcashbox.ui.analytics.AnalyticsActivity
import com.example.worldcashbox.ui.balance.BalanceActivity
import com.example.worldcashbox.ui.history.HistoryFragment
import com.example.worldcashbox.ui.profile.ProfileActivity
import com.example.worldcashbox.ui.services.ServicesFragment
import com.example.worldcashbox.ui.support.ClientTicketDetailActivity
import com.example.worldcashbox.data.model.Notification
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

/**
 * Нормализация названия компании - замена полных форм на сокращения
 */
private fun normalizeCompanyName(name: String?): String {
    if (name.isNullOrBlank()) return name ?: ""
    
    return name
        .replace(Regex("ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ", RegexOption.IGNORE_CASE), "ООО")
        .replace(Regex("АКЦИОНЕРНОЕ ОБЩЕСТВО", RegexOption.IGNORE_CASE), "АО")
        .replace(Regex("ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", RegexOption.IGNORE_CASE), "ПАО")
        .replace(Regex("НЕПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", RegexOption.IGNORE_CASE), "НАО")
        .trim()
}

class DashboardFragment : Fragment() {
    private var _binding: FragmentDashboardBinding? = null
    private val binding get() = _binding!!
    private lateinit var transactionsAdapter: TransactionsAdapter
    private var unreadNotifications: List<Notification> = emptyList()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        setupRecyclerView()
        setupListeners()
        setupSwipeRefresh()
        
        // Загружаем данные только при первом создании view, не при каждом переключении вкладок
        if (savedInstanceState == null) {
            loadData()
        }
    }

    private fun setupRecyclerView() {
        transactionsAdapter = TransactionsAdapter()
        binding.transactionsRecyclerView.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = transactionsAdapter
        }
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            loadData()
        }
    }

    private fun setupListeners() {
        binding.profileButton.setOnClickListener {
            startActivity(Intent(requireContext(), ProfileActivity::class.java))
        }

        binding.balanceCard.setOnClickListener {
            startActivity(Intent(requireContext(), BalanceActivity::class.java))
        }

        binding.topUpButton.setOnClickListener {
            startActivity(Intent(requireContext(), BalanceActivity::class.java))
        }

        binding.syncButton.setOnClickListener {
            syncData()
        }

        binding.notificationBanner.setOnClickListener {
            // Если есть непрочитанное уведомление, связанное с тикетом — переходим к тикету
            val latestUnread = unreadNotifications.firstOrNull()
            if (latestUnread != null && latestUnread.relatedType == "ticket" && latestUnread.relatedId != null) {
                val intent = Intent(requireContext(), ClientTicketDetailActivity::class.java)
                intent.putExtra("ticketId", latestUnread.relatedId)
                startActivity(intent)
            } else if (unreadNotifications.size == 1 && latestUnread != null) {
                // Единственное уведомление без связи — открываем вкладку уведомлений
                (activity as? com.example.worldcashbox.ui.main.MainActivity)?.let { mainActivity ->
                    mainActivity.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNavigation)
                        ?.selectedItemId = R.id.nav_notifications
                }
            } else {
                // Несколько уведомлений — открываем вкладку уведомлений
                (activity as? com.example.worldcashbox.ui.main.MainActivity)?.let { mainActivity ->
                    mainActivity.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNavigation)
                        ?.selectedItemId = R.id.nav_notifications
                }
            }
        }

        binding.servicesCard.setOnClickListener {
            (activity as? com.example.worldcashbox.ui.main.MainActivity)?.let { mainActivity ->
                mainActivity.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNavigation)
                    ?.selectedItemId = R.id.nav_services
            }
        }

        binding.historyCard.setOnClickListener {
            (activity as? com.example.worldcashbox.ui.main.MainActivity)?.let { mainActivity ->
                mainActivity.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNavigation)
                    ?.selectedItemId = R.id.nav_history
            }
        }

        binding.analyticsCard.setOnClickListener {
            startActivity(Intent(requireContext(), AnalyticsActivity::class.java))
        }

        binding.balanceActionCard.setOnClickListener {
            startActivity(Intent(requireContext(), BalanceActivity::class.java))
        }

        binding.seeAllTextView.setOnClickListener {
            (activity as? com.example.worldcashbox.ui.main.MainActivity)?.let { mainActivity ->
                mainActivity.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNavigation)
                    ?.selectedItemId = R.id.nav_history
            }
        }

        binding.helpButton.setOnClickListener {
            startActivity(Intent(requireContext(), com.example.worldcashbox.ui.support.SupportActivity::class.java))
        }

        // Добавляем навигацию для Resources и Subscriptions
        binding.resourcesCard?.setOnClickListener {
            startActivity(Intent(requireContext(), com.example.worldcashbox.ui.resources.ResourcesActivity::class.java))
        }

    }

    private fun syncData() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                binding.syncButton.isEnabled = false
                binding.syncButton.text = "Синхронизация..."
                
                // Синхронизируем данные из SBIS
                val syncResponse = RetrofitClient.apiService.syncClientData()
                if (syncResponse.isSuccessful && syncResponse.body() != null) {
                    val syncResult = syncResponse.body()!!
                    if (syncResult["success"] == true) {
                        Toast.makeText(requireContext(), "Данные синхронизированы из SBIS", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(requireContext(), "Синхронизация завершена", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(requireContext(), "Ошибка синхронизации", Toast.LENGTH_SHORT).show()
                }
                
                // Небольшая задержка перед обновлением данных, чтобы дать серверу время обновить БД
                kotlinx.coroutines.delay(500)
                
                // Обновляем все данные после синхронизации
                loadData()
            } catch (e: Exception) {
                android.util.Log.e("Dashboard", "Ошибка синхронизации", e)
                Toast.makeText(requireContext(), "Ошибка синхронизации: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.syncButton.isEnabled = true
                binding.syncButton.text = "Синхронизировать"
            }
        }
    }

    private fun loadData() {
        if (!::transactionsAdapter.isInitialized) {
            setupRecyclerView()
        }
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                // 1. Сначала показываем данные из локального кэша (если есть)
                val ctx = requireContext()
                ClientStorage.getClient(ctx)?.let { client ->
                    val innDigits = client.inn?.filter { it.isDigit() }
                    val isIP = innDigits?.length == 12
                    val isOOO = innDigits?.length == 10

                    binding.userNameTextView.text = "${normalizeCompanyName(client.name)}!"
                    binding.companyNameTextView.text = when {
                        isIP -> "Индивидуальный предприниматель"
                        isOOO -> "Организация"
                        else -> ""
                    }

                    val formatterBalance = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
                    binding.balanceTextView.text = formatterBalance.format(client.balance)
                }
                ClientStorage.getStats(ctx)?.let { stats ->
                    val totalSpent = (stats["totalSpent"] as? Number)?.toDouble() ?: 0.0
                    val activeInvoices = (stats["activeInvoices"] as? Number)?.toInt() ?: 0
                    val paidInvoices = (stats["paidInvoices"] as? Number)?.toInt() ?: 0
                    val pendingAmount = (stats["pendingAmount"] as? Number)?.toDouble() ?: 0.0

                    val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
                    binding.totalSpentTextView.text = "${formatter.format(totalSpent)} ₽"
                    binding.activeInvoicesTextView.text = activeInvoices.toString()
                    binding.paidInvoicesTextView.text = paidInvoices.toString()
                    binding.pendingAmountTextView.text = "${formatter.format(pendingAmount)} ₽"
                }

                // 2. Параллельно обновляем данные из API
                val clientDeferred = async { RetrofitClient.apiService.getClientInfo() }
                val balanceDeferred = async { RetrofitClient.apiService.getBalance() }
                val txDeferred = async { RetrofitClient.apiService.getTransactionHistory() }
                val notificationsDeferred = async { RetrofitClient.apiService.getNotifications() }
                val statsDeferred = async { RetrofitClient.apiService.getClientStats() }

                // Клиент
                val clientResponse = clientDeferred.await()
                if (clientResponse.isSuccessful && clientResponse.body() != null) {
                    val client = clientResponse.body()!!
                    ClientStorage.saveClient(ctx, client)

                    val innDigits = client.inn?.filter { it.isDigit() }
                    val isIP = innDigits?.length == 12
                    val isOOO = innDigits?.length == 10

                    binding.userNameTextView.text = "${normalizeCompanyName(client.name)}!"
                    binding.companyNameTextView.text = when {
                        isIP -> "Индивидуальный предприниматель"
                        isOOO -> "Организация"
                        else -> ""
                    }
                }

                // Баланс
                val balanceResponse = balanceDeferred.await()
                if (balanceResponse.isSuccessful && balanceResponse.body() != null) {
                    val balance = balanceResponse.body()!!.balance
                    val formatter = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
                    binding.balanceTextView.text = formatter.format(balance)
                }

                // Транзакции
                val transactionsResponse = txDeferred.await()
                if (transactionsResponse.isSuccessful && transactionsResponse.body() != null) {
                    val transactions = transactionsResponse.body()!!.transactions
                    if (transactions.isEmpty()) {
                        binding.emptyTransactionsTextView.visibility = View.VISIBLE
                        binding.transactionsRecyclerView.visibility = View.GONE
                        binding.seeAllTextView.visibility = View.GONE
                    } else {
                        binding.emptyTransactionsTextView.visibility = View.GONE
                        binding.transactionsRecyclerView.visibility = View.VISIBLE
                        transactionsAdapter.submitList(transactions.take(3))
                        binding.seeAllTextView.visibility = if (transactions.size > 3) View.VISIBLE else View.GONE
                    }
                }

                // Уведомления
                val notificationsResponse = notificationsDeferred.await()
                if (notificationsResponse.isSuccessful && notificationsResponse.body() != null) {
                    val allNotifications = notificationsResponse.body()!!
                    unreadNotifications = allNotifications.filter { !it.isRead }
                    val unreadCount = unreadNotifications.size
                    if (unreadCount > 0) {
                        binding.notificationBanner.visibility = View.VISIBLE
                        // Формируем текст в зависимости от типа уведомления
                        val latest = unreadNotifications.first()
                        if (unreadCount == 1 && latest.relatedType == "ticket") {
                            binding.notificationBannerText.text = latest.title
                        } else {
                            binding.notificationBannerText.text = "У вас $unreadCount непрочитанных уведомлений"
                        }
                    } else {
                        binding.notificationBanner.visibility = View.GONE
                    }
                }

                // Статистика
                try {
                    val statsResponse = statsDeferred.await()
                    if (statsResponse.isSuccessful && statsResponse.body() != null) {
                        val stats = statsResponse.body()!!
                        ClientStorage.saveStats(ctx, stats as Map<String, Any>)

                        val totalSpent = (stats["totalSpent"] as? Number)?.toDouble() ?: 0.0
                        val activeInvoices = (stats["activeInvoices"] as? Number)?.toInt() ?: 0
                        val paidInvoices = (stats["paidInvoices"] as? Number)?.toInt() ?: 0
                        val pendingAmount = (stats["pendingAmount"] as? Number)?.toDouble() ?: 0.0
                        
                        val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
                        binding.totalSpentTextView.text = "${formatter.format(totalSpent)} ₽"
                        binding.activeInvoicesTextView.text = activeInvoices.toString()
                        binding.paidInvoicesTextView.text = paidInvoices.toString()
                        binding.pendingAmountTextView.text = "${formatter.format(pendingAmount)} ₽"
                    }
                } catch (e: Exception) {
                    // Игнорируем ошибки статистики, оставляем последние данные
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Ошибка загрузки данных: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
