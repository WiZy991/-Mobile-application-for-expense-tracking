package com.example.worldcashbox.ui.settings

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.local.ClientStorage
import com.example.worldcashbox.databinding.FragmentSettingsBinding
import com.example.worldcashbox.ui.analytics.AnalyticsActivity
import com.example.worldcashbox.ui.balance.BalanceActivity
import com.example.worldcashbox.ui.changepassword.ChangePasswordActivity
import com.example.worldcashbox.ui.history.HistoryFragment
import com.example.worldcashbox.ui.login.LoginActivity
import com.example.worldcashbox.ui.profile.ProfileActivity
import com.example.worldcashbox.ui.resources.ResourcesActivity
import com.example.worldcashbox.ui.services.ServicesFragment
import com.example.worldcashbox.ui.support.SupportActivity
import com.example.worldcashbox.ui.engineer.EngineerTicketsActivity
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

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

class SettingsFragment : Fragment() {
    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private lateinit var tokenManager: TokenManager
    private lateinit var prefs: SharedPreferences
    private var lastSync: Date? = null
    
    // Вспомогательная функция для безопасного получения context
    private fun getSafeContext(): android.content.Context? {
        return context ?: activity
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        try {
            val context = view.context ?: return
            
            // Инициализируем RetrofitClient, если еще не инициализирован
            RetrofitClient.initialize(context)
            
            tokenManager = TokenManager(context)
            prefs = context.getSharedPreferences("settings", android.content.Context.MODE_PRIVATE)
            
            setupListeners()
            setupEngineerMenu()
            
            // Загружаем данные только при первом создании view, не при каждом переключении вкладок
            if (savedInstanceState == null) {
                loadProfile()
                loadSettings()
            }
        } catch (e: Exception) {
            android.util.Log.e("Settings", "Ошибка инициализации SettingsFragment", e)
            e.printStackTrace()
            // Показываем сообщение об ошибке пользователю
            try {
                val context = view?.context
                if (context != null) {
                    Toast.makeText(context, "Ошибка загрузки настроек", Toast.LENGTH_SHORT).show()
                }
            } catch (toastError: Exception) {
                android.util.Log.e("Settings", "Ошибка показа Toast", toastError)
            }
        }
    }

    private fun loadProfile() {
        if (!::tokenManager.isInitialized) {
            android.util.Log.w("Settings", "TokenManager не инициализирован, пропускаем загрузку профиля")
            return
        }
        
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val ctx = getSafeContext() ?: return@launch

                // 1. Сначала показываем данные из кэша, если есть
                ClientStorage.getClient(ctx)?.let { client ->
                    val innDigits = client.inn?.filter { it.isDigit() }
                    val isIP = innDigits?.length == 12
                    val isOOO = innDigits?.length == 10

                    try {
                        binding.profileName?.text = normalizeCompanyName(client.name) ?: "Клиент"
                        binding.profileCompany?.text = when {
                            isIP -> "Индивидуальный предприниматель"
                            isOOO -> "Организация"
                            else -> ""
                        }
                        
                        if (!client.inn.isNullOrBlank()) {
                            binding.profileInn?.text = "✓ ИНН: ${client.inn}"
                            binding.profileInn?.visibility = View.VISIBLE
                        } else {
                            binding.profileInn?.visibility = View.GONE
                        }
                        
                        val firstLetter = client.name?.getOrNull(0)?.uppercaseChar() ?: 'П'
                        binding.profileAvatarText?.text = firstLetter.toString()

                        val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
                        binding.balanceText?.text = "${formatter.format(client.balance)} ₽"
                    } catch (viewError: Exception) {
                        android.util.Log.e("Settings", "Ошибка обновления views профиля из кэша", viewError)
                    }
                }

                // 2. Параллельно обновляем профиль и баланс из API
                val clientDeferred = async { RetrofitClient.apiService.getClientInfo() }
                val balanceDeferred = async { RetrofitClient.apiService.getBalance() }

                val response = clientDeferred.await()
                if (response.isSuccessful && response.body() != null) {
                    val client = response.body()!!
                    ClientStorage.saveClient(ctx, client)

                    val innDigits = client.inn?.filter { it.isDigit() }
                    val isIP = innDigits?.length == 12
                    val isOOO = innDigits?.length == 10

                    try {
                        binding.profileName?.text = normalizeCompanyName(client.name) ?: "Клиент"
                        binding.profileCompany?.text = when {
                            isIP -> "Индивидуальный предприниматель"
                            isOOO -> "Организация"
                            else -> ""
                        }
                        
                        if (!client.inn.isNullOrBlank()) {
                            binding.profileInn?.text = "✓ ИНН: ${client.inn}"
                            binding.profileInn?.visibility = View.VISIBLE
                        } else {
                            binding.profileInn?.visibility = View.GONE
                        }
                        
                        val firstLetter = client.name?.getOrNull(0)?.uppercaseChar() ?: 'П'
                        binding.profileAvatarText?.text = firstLetter.toString()
                    } catch (viewError: Exception) {
                        android.util.Log.e("Settings", "Ошибка обновления views профиля", viewError)
                    }
                } else {
                    android.util.Log.w("Settings", "Не удалось загрузить профиль: код ${response.code()}")
                }

                // Баланс
                try {
                    val balanceResponse = balanceDeferred.await()
                    if (balanceResponse.isSuccessful && balanceResponse.body() != null) {
                        val balance = balanceResponse.body()!!.balance
                        val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
                        binding.balanceText?.text = "${formatter.format(balance)} ₽"
                    }
                } catch (e: Exception) {
                    android.util.Log.e("Settings", "Ошибка загрузки баланса", e)
                }
            } catch (e: Exception) {
                // Не показываем ошибку, если задача была отменена (например, при закрытии фрагмента)
                if (e is kotlinx.coroutines.CancellationException) {
                    android.util.Log.d("Settings", "Загрузка профиля отменена")
                    return@launch
                }
                android.util.Log.e("Settings", "Ошибка загрузки профиля", e)
                e.printStackTrace()
                // Не показываем Toast для отмененных задач, чтобы не пугать пользователя
            }
        }
    }

    private fun loadSettings() {
        try {
            if (!::prefs.isInitialized) {
                android.util.Log.w("Settings", "SharedPreferences не инициализирован, пропускаем загрузку настроек")
                return
            }
            
            val pushEnabled = prefs.getBoolean("pushNotificationsEnabled", true)
            val emailEnabled = prefs.getBoolean("emailNotificationsEnabled", true)
            
            try {
                binding.pushNotificationsSwitch?.isChecked = pushEnabled
                binding.emailNotificationsSwitch?.isChecked = emailEnabled
            } catch (viewError: Exception) {
                android.util.Log.e("Settings", "Ошибка обновления switches", viewError)
            }
        
            // Загружаем время последней синхронизации
            val lastSyncTime = prefs.getLong("lastSyncTime", 0)
            if (lastSyncTime > 0) {
                lastSync = Date(lastSyncTime)
                updateLastSyncText()
            }
        } catch (e: Exception) {
            android.util.Log.e("Settings", "Ошибка загрузки настроек", e)
            e.printStackTrace()
        }
    }

    private fun updateLastSyncText() {
        try {
            val text = if (lastSync != null) {
                formatSyncTime(lastSync!!)
            } else {
                "Никогда"
            }
            binding.lastSyncText?.text = "Последняя: $text"
        } catch (e: Exception) {
            android.util.Log.e("Settings", "Ошибка обновления текста синхронизации", e)
        }
    }

    private fun formatSyncTime(date: Date): String {
        val now = Date()
        val diff = (now.time - date.time) / 1000 / 60 // минуты
        
        return when {
            diff < 1 -> "Только что"
            diff < 60 -> "${diff.toInt()} мин назад"
            else -> SimpleDateFormat("HH:mm", Locale("ru")).format(date)
        }
    }

    private fun setupListeners() {
        try {
            // Profile Card
            binding.profileCard?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, ProfileActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия профиля", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия профиля", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // Sync Button
        binding.syncButton?.setOnClickListener {
            syncData()
        }

        // Основные
        binding.profileMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, ProfileActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия профиля", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия профиля", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.balanceMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, BalanceActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия баланса", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия баланса", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.myServicesMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, com.example.worldcashbox.ui.myservices.MyServicesActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия услуг", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия услуг", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.historyMenuItem?.setOnClickListener {
            try {
                (activity as? com.example.worldcashbox.ui.main.MainActivity)?.let { mainActivity ->
                    mainActivity.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNavigation)
                        ?.selectedItemId = R.id.nav_history
                }
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия истории", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия истории", Toast.LENGTH_SHORT).show()
                }
            }
        }

        try {
            binding.employeesMenuItem?.setOnClickListener {
                try {
                    val ctx = getSafeContext() ?: return@setOnClickListener
                    val intent = Intent(ctx, com.example.worldcashbox.ui.employees.EmployeesActivity::class.java)
                    startActivity(intent)
                } catch (e: Exception) {
                    android.util.Log.e("Settings", "Ошибка открытия сотрудников", e)
                    e.printStackTrace()
                    getSafeContext()?.let { ctx ->
                        Toast.makeText(ctx, "Ошибка открытия сотрудников: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("Settings", "Ошибка настройки employeesMenuItem", e)
            e.printStackTrace()
        }

        // Уведомления
        binding.pushNotificationsSwitch?.setOnCheckedChangeListener { _, isChecked ->
            try {
                if (::prefs.isInitialized) {
                    prefs.edit().putBoolean("pushNotificationsEnabled", isChecked).apply()
                    getSafeContext()?.let { ctx ->
                        Toast.makeText(ctx, 
                            if (isChecked) "Push-уведомления включены" else "Push-уведомления отключены", 
                            Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка сохранения настроек push-уведомлений", e)
            }
        }

        binding.emailNotificationsSwitch?.setOnCheckedChangeListener { _, isChecked ->
            try {
                if (::prefs.isInitialized) {
                    prefs.edit().putBoolean("emailNotificationsEnabled", isChecked).apply()
                }
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка сохранения настроек email-уведомлений", e)
            }
        }

        // Безопасность
        binding.changePasswordMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, ChangePasswordActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия смены пароля", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия смены пароля", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // Информация
        binding.supportMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, SupportActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия поддержки", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия поддержки", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.termsMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, com.example.worldcashbox.ui.terms.TermsActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия соглашения", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия соглашения", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.privacyMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                startActivity(Intent(ctx, com.example.worldcashbox.ui.privacy.PrivacyPolicyActivity::class.java))
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия политики", e)
                getSafeContext()?.let { ctx ->
                    Toast.makeText(ctx, "Ошибка открытия политики", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.aboutMenuItem?.setOnClickListener {
            try {
                val ctx = getSafeContext() ?: return@setOnClickListener
                AlertDialog.Builder(ctx)
                    .setTitle("WorldCashBox")
                    .setMessage("Версия 1.0.0\n© 2025 WorldCashBox")
                    .setPositiveButton("OK", null)
                    .show()
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка открытия информации", e)
            }
        }
        } catch (e: Exception) {
            android.util.Log.e("Settings", "Ошибка в setupListeners", e)
            e.printStackTrace()
        }
    }

    private fun setupEngineerMenu() {
        try {
            val userRole = tokenManager.getUserRole()
            val userType = tokenManager.getUserType()
            
            // Показываем инженерный кабинет ТОЛЬКО для инженеров и support
            // Клиенты (userType == "client" или null) НЕ должны видеть эту кнопку
            val isEngineer = (userType == "staff" && (userRole == "engineer" || userRole == "support"))
            
            binding.engineerTicketsMenuItem?.visibility = if (isEngineer) View.VISIBLE else View.GONE
            binding.engineerTicketsDivider?.visibility = if (isEngineer) View.VISIBLE else View.GONE
            
            binding.engineerTicketsMenuItem?.setOnClickListener {
                try {
                    val ctx = getSafeContext() ?: return@setOnClickListener
                    startActivity(Intent(ctx, EngineerTicketsActivity::class.java))
                } catch (e: Exception) {
                    android.util.Log.e("Settings", "Ошибка открытия инженерного кабинета", e)
                    getSafeContext()?.let { ctx ->
                        Toast.makeText(ctx, "Ошибка открытия инженерного кабинета", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("Settings", "Ошибка настройки инженерного меню", e)
        }
    }

    private fun syncData() {
        if (!::tokenManager.isInitialized) {
            android.util.Log.w("Settings", "TokenManager не инициализирован, пропускаем синхронизацию")
            Toast.makeText(context, "Ошибка: не инициализирован", Toast.LENGTH_SHORT).show()
            return
        }
        
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                binding.syncButton?.isEnabled = false
                binding.syncButton?.text = "Синхронизация..."
                
                // Синхронизируем данные из SBIS
                val syncResponse = RetrofitClient.apiService.syncClientData()
                val ctx = getSafeContext()
                if (syncResponse.isSuccessful && syncResponse.body() != null) {
                    val syncResult = syncResponse.body()!!
                    if (syncResult["success"] == true) {
                        ctx?.let { Toast.makeText(it, "Данные синхронизированы из SBIS", Toast.LENGTH_SHORT).show() }
                    } else {
                        ctx?.let { Toast.makeText(it, "Синхронизация завершена", Toast.LENGTH_SHORT).show() }
                    }
                } else {
                    ctx?.let { Toast.makeText(it, "Ошибка синхронизации", Toast.LENGTH_SHORT).show() }
                }
                
                // Небольшая задержка перед обновлением данных, чтобы дать серверу время обновить БД
                kotlinx.coroutines.delay(500)
                
                // Обновляем профиль после синхронизации
                loadProfile()
                
                // Сохраняем время синхронизации
                try {
                    lastSync = Date()
                    if (::prefs.isInitialized) {
                        prefs.edit().putLong("lastSyncTime", lastSync!!.time).apply()
                        updateLastSyncText()
                    }
                } catch (prefsError: Exception) {
                    android.util.Log.e("Settings", "Ошибка сохранения времени синхронизации", prefsError)
                }
            } catch (e: Exception) {
                android.util.Log.e("Settings", "Ошибка синхронизации", e)
                e.printStackTrace()
                try {
                    getSafeContext()?.let { ctx ->
                        Toast.makeText(ctx, "Ошибка синхронизации: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                } catch (toastError: Exception) {
                    android.util.Log.e("Settings", "Ошибка показа Toast", toastError)
                }
            } finally {
                try {
                    binding.syncButton?.isEnabled = true
                    binding.syncButton?.text = "Синхронизировать"
                } catch (viewError: Exception) {
                    android.util.Log.e("Settings", "Ошибка обновления кнопки синхронизации", viewError)
                }
            }
        }
    }


    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
