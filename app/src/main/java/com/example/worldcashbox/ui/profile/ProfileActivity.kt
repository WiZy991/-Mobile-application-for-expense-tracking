package com.example.worldcashbox.ui.profile

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.local.ClientStorage
import com.example.worldcashbox.databinding.ActivityProfileBinding
import com.example.worldcashbox.ui.balance.BalanceActivity
import com.example.worldcashbox.ui.changepassword.ChangePasswordActivity
import com.example.worldcashbox.utils.TokenManager
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
        .replace(Regex("ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ", RegexOption.IGNORE_CASE), "ООО")
        .replace(Regex("АКЦИОНЕРНОЕ ОБЩЕСТВО", RegexOption.IGNORE_CASE), "АО")
        .replace(Regex("ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", RegexOption.IGNORE_CASE), "ПАО")
        .replace(Regex("НЕПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", RegexOption.IGNORE_CASE), "НАО")
        .trim()
}

class ProfileActivity : AppCompatActivity() {
    private lateinit var binding: ActivityProfileBinding
    private lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupListeners()
        loadProfile()
    }

    // Убрано автоматическое обновление при возврате на экран
    // Данные обновляются только при первом открытии или через pull-to-refresh
    // override fun onResume() {
    //     super.onResume()
    //     loadProfile()
    // }

    private fun setupListeners() {
        // Кнопка смены пароля
        try {
            val changePasswordButton = binding.root.findViewById<android.view.View>(R.id.changePasswordButton)
            changePasswordButton?.setOnClickListener {
                startActivity(Intent(this, ChangePasswordActivity::class.java))
            }
        } catch (e: Exception) {
            // Кнопка может отсутствовать в layout
        }

        // Меню действий
        binding.balanceMenuItem.setOnClickListener {
            startActivity(Intent(this, BalanceActivity::class.java))
        }

        binding.servicesMenuItem.setOnClickListener {
            // TODO: Navigate to services
            Toast.makeText(this, "Мои услуги", Toast.LENGTH_SHORT).show()
        }

        binding.historyMenuItem.setOnClickListener {
            // TODO: Navigate to history
            Toast.makeText(this, "История операций", Toast.LENGTH_SHORT).show()
        }

        // Кнопка синхронизации
        binding.syncButton.setOnClickListener {
            syncData()
        }

        // Кнопка выхода
        binding.logoutButton.setOnClickListener {
            showLogoutDialog()
        }
    }

    private fun loadProfile() {
        // 1. Сначала пробуем показать данные из локального кэша (мгновенно, без сети)
        val cachedClient = ClientStorage.getClient(this)
        val cachedStats = ClientStorage.getStats(this)
        if (cachedClient != null) {
            val safeStats = cachedStats ?: mapOf(
                "totalSpent" to 0.0,
                "activeInvoices" to 0,
                "paidInvoices" to 0
            )
            displayProfile(cachedClient, safeStats)
        }

        // 2. Параллельно в фоне обновляем данные из API и, если они изменились, обновляем кэш и UI
        lifecycleScope.launch {
            try {
                android.util.Log.d("Profile", "Загрузка профиля из API...")
                val clientResponse = RetrofitClient.apiService.getClientInfo()
                android.util.Log.d("Profile", "Ответ API: код ${clientResponse.code()}")
                if (clientResponse.isSuccessful && clientResponse.body() != null) {
                    val client = clientResponse.body()!!

                    // Загружаем статистику
                    var stats = mapOf<String, Any>(
                        "totalSpent" to 0.0,
                        "activeInvoices" to 0,
                        "paidInvoices" to 0
                    )
                    try {
                        val statsResponse = RetrofitClient.apiService.getClientStats()
                        if (statsResponse.isSuccessful && statsResponse.body() != null) {
                            val statsBody = statsResponse.body()!!
                            stats = mapOf<String, Any>(
                                "totalSpent" to ((statsBody["totalSpent"] as? Number)?.toDouble() ?: 0.0),
                                "activeInvoices" to ((statsBody["activeInvoices"] as? Number)?.toInt() ?: 0),
                                "paidInvoices" to ((statsBody["paidInvoices"] as? Number)?.toInt() ?: 0)
                            )
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("Profile", "Error loading stats", e)
                    }

                    // Сохраняем в кэш и обновляем экран (если он ещё открыт)
                    ClientStorage.saveClient(this@ProfileActivity, client)
                    ClientStorage.saveStats(this@ProfileActivity, stats)
                    displayProfile(client, stats)
                } else {
                    val errorBody = clientResponse.errorBody()?.string()
                    android.util.Log.e("Profile", "Error response: $errorBody")
                    Toast.makeText(this@ProfileActivity, "Ошибка загрузки профиля", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                // Не показываем ошибку, если задача была отменена (например, при закрытии экрана)
                if (e is kotlinx.coroutines.CancellationException) {
                    android.util.Log.d("Profile", "Загрузка профиля отменена")
                    return@launch
                }
                android.util.Log.e("Profile", "Error loading profile", e)
                // Показываем ошибку только если это не отмена задачи и Activity еще активна
                if (!isFinishing) {
                    Toast.makeText(this@ProfileActivity, "Ошибка загрузки профиля: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun displayProfile(client: com.example.worldcashbox.data.model.Client, stats: Map<String, Any>) {
        val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))

        // Определяем тип клиента по ИНН (10 - ООО, 12 - ИП)
        val innDigits = client.inn?.filter { it.isDigit() }
        val isIP = innDigits?.length == 12
        val isOOO = innDigits?.length == 10

        // Заголовок (аватар убран)
        binding.headerNameTextView.text = normalizeCompanyName(client.name)
        binding.headerCompanyTextView.text = when {
            isIP -> "Индивидуальный предприниматель"
            isOOO -> "Организация"
            else -> "Клиент"
        }
        if (!client.inn.isNullOrEmpty()) {
            binding.innBadgeTextView.text = "ИНН: ${client.inn}"
            binding.innBadgeTextView.visibility = android.view.View.VISIBLE
        } else {
            binding.innBadgeTextView.visibility = android.view.View.GONE
        }

        // Статистика
        val totalSpent = (stats["totalSpent"] as? Number)?.toDouble() ?: 0.0
        val activeInvoices = (stats["activeInvoices"] as? Number)?.toInt() ?: 0
        val paidInvoices = (stats["paidInvoices"] as? Number)?.toInt() ?: 0
        
        binding.statTotalSpentTextView.text = "${formatter.format(totalSpent)} ₽"
        binding.statInvoicesCountTextView.text = (activeInvoices + paidInvoices).toString()
        binding.statServicesCountTextView.text = activeInvoices.toString()

        // Личные данные
        binding.nameTextView.text = client.name
        binding.emailTextView.text = client.email
        binding.phoneTextView.text = client.phone ?: "Не указан"
        
        val balance = client.balance
        binding.balanceTextView.text = "${formatter.format(balance)} ₽"
        if (balance < 0) {
            binding.balanceTextView.setTextColor(getColor(R.color.error))
        } else {
            binding.balanceTextView.setTextColor(getColor(R.color.success))
        }

        // Дата создания
        if (client.createdAt != null) {
            try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                val outputFormat = SimpleDateFormat("d MMMM yyyy", Locale("ru", "RU"))
                val date = inputFormat.parse(client.createdAt)
                binding.createdAtTextView.text = if (date != null) outputFormat.format(date) else client.createdAt
            } catch (e: Exception) {
                binding.createdAtTextView.text = client.createdAt
            }
        } else {
            binding.createdAtTextView.text = "Не указано"
        }

        // Данные организации / ИП
        binding.companyNameTextView.text = normalizeCompanyName(client.name)
        binding.innTextView.text = client.inn ?: "Не указан"

        // Для ИП КПП не бывает, поэтому показываем, что не применяется
        binding.kppTextView.text = when {
            isOOO && !client.kpp.isNullOrEmpty() -> client.kpp
            isOOO -> "Не указан"
            else -> "Не применяется"
        }

        // ОГРН / ОГРНИП (пока поле одно, просто корректно подпишем значения)
        binding.ogrnTextView.text = when {
            !client.ogrn.isNullOrEmpty() && isIP -> client.ogrn // трактуем как ОГРНИП
            !client.ogrn.isNullOrEmpty() -> client.ogrn
            isIP -> "ОГРНИП не указан"
            isOOO -> "ОГРН не указан"
            else -> "Не указан"
        }

        // Получаем директора из данных клиента (если есть в БД)
        binding.directorTextView.text = client.director ?: "Не указан"
        
        // Логируем адрес для отладки
        val addressToDisplay = client.companyAddress ?: "Не указан"
        android.util.Log.d("Profile", "Адрес из API: $addressToDisplay")
        android.util.Log.d("Profile", "Длина адреса: ${addressToDisplay.length}")
        android.util.Log.d("Profile", "Адрес содержит 'д. 35': ${addressToDisplay.contains("д. 35")}")
        android.util.Log.d("Profile", "Адрес содержит 'д. 3': ${addressToDisplay.contains("д. 3")}")
        
        // Устанавливаем адрес в TextView
        binding.addressTextView.text = addressToDisplay
        android.util.Log.d("Profile", "Адрес установлен в TextView: ${binding.addressTextView.text}")
    }

    private fun syncData() {
        binding.syncButton.isEnabled = false
        binding.syncButton.text = "Обновление..."
        
        lifecycleScope.launch {
            try {
                // Вызываем синхронизацию клиента
                val syncResponse = RetrofitClient.apiService.syncClientData()
                if (syncResponse.isSuccessful) {
                    Toast.makeText(this@ProfileActivity, "Данные успешно обновлены", Toast.LENGTH_SHORT).show()
                    // Увеличиваем задержку перед обновлением данных, чтобы дать серверу время обновить БД
                    kotlinx.coroutines.delay(1000)
                    // Принудительно обновляем профиль
                    loadProfile()
                } else {
                    Toast.makeText(this@ProfileActivity, "Ошибка обновления данных", Toast.LENGTH_SHORT).show()
                    // Обновляем данные даже при ошибке, чтобы показать текущее состояние
                    loadProfile()
                }
            } catch (e: Exception) {
                android.util.Log.e("Profile", "Ошибка синхронизации", e)
                Toast.makeText(this@ProfileActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
                loadProfile()
            } finally {
                binding.syncButton.isEnabled = true
                binding.syncButton.text = "🔄 Обновить"
            }
        }
    }

    private fun showLogoutDialog() {
        AlertDialog.Builder(this)
            .setTitle("Выход из аккаунта")
            .setMessage("Вы уверены, что хотите выйти из аккаунта?")
            .setPositiveButton("Выйти") { _, _ ->
                logout()
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun logout() {
        tokenManager.clearToken()
        // Перезапускаем приложение на экран логина
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        intent?.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        finish()
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}
