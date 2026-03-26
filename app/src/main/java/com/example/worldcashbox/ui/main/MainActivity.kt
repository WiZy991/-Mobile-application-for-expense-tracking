package com.example.worldcashbox.ui.main

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.local.ClientStorage
import com.example.worldcashbox.ui.dashboard.DashboardFragment
import com.example.worldcashbox.ui.history.HistoryFragment
import com.example.worldcashbox.ui.notifications.NotificationsFragment
import com.example.worldcashbox.ui.services.ServicesFragment
import com.example.worldcashbox.ui.settings.SettingsFragment
import com.example.worldcashbox.utils.TokenManager
import com.google.android.material.bottomnavigation.BottomNavigationView

class MainActivity : AppCompatActivity() {
    private lateinit var tokenManager: TokenManager
    private lateinit var bottomNavigation: BottomNavigationView
    
    // Храним ссылки на фрагменты, чтобы не пересоздавать их при переключении вкладок
    private var dashboardFragment: DashboardFragment? = null
    private var servicesFragment: ServicesFragment? = null
    private var historyFragment: HistoryFragment? = null
    private var notificationsFragment: NotificationsFragment? = null
    private var settingsFragment: SettingsFragment? = null
    private var currentFragment: Fragment? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tokenManager = TokenManager(this)
        RetrofitClient.initialize(this)

        if (!tokenManager.isLoggedIn()) {
            navigateToLogin()
            return
        }

        // Если это инженер или support, перенаправляем в инженерный кабинет
        try {
            val userType = tokenManager.getUserType()
            val userRole = tokenManager.getUserRole()
            if (userType == "staff" && (userRole == "engineer" || userRole == "support")) {
                val intent = Intent(this, com.example.worldcashbox.ui.engineer.EngineerTicketsActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
                return
            }
        } catch (e: Exception) {
            // Если ошибка при перенаправлении инженера, продолжаем как обычный клиент
            android.util.Log.e("MainActivity", "Ошибка перенаправления инженера", e)
        }

        setupBottomNavigation()
        
        // Показываем Dashboard по умолчанию
        if (savedInstanceState == null) {
            dashboardFragment = DashboardFragment()
            supportFragmentManager.beginTransaction()
                .add(R.id.fragmentContainer, dashboardFragment!!, "dashboard")
                .commit()
            currentFragment = dashboardFragment

            // На самом первом запуске сразу подтягиваем свежие данные и кладём их в кэш
            prefetchClientData()
        } else {
            // Восстанавливаем ссылки на фрагменты после поворота экрана
            dashboardFragment = supportFragmentManager.findFragmentByTag("dashboard") as? DashboardFragment
            servicesFragment = supportFragmentManager.findFragmentByTag("services") as? ServicesFragment
            historyFragment = supportFragmentManager.findFragmentByTag("history") as? HistoryFragment
            notificationsFragment = supportFragmentManager.findFragmentByTag("notifications") as? NotificationsFragment
            settingsFragment = supportFragmentManager.findFragmentByTag("settings") as? SettingsFragment
            
            // Восстанавливаем текущий фрагмент и скрываем остальные
            val fragments = listOf(dashboardFragment, servicesFragment, historyFragment, notificationsFragment, settingsFragment)
            val visibleFragment = fragments.firstOrNull { it != null && it.isVisible }
            currentFragment = visibleFragment ?: dashboardFragment
            
            // Убеждаемся, что все фрагменты правильно скрыты/показаны
            val transaction = supportFragmentManager.beginTransaction()
            fragments.forEach { fragment ->
                fragment?.let {
                    if (it.isAdded) {
                        if (it == currentFragment) {
                            transaction.show(it)
                        } else {
                            transaction.hide(it)
                        }
                    }
                }
            }
            transaction.commit()
        }
    }

    private fun setupBottomNavigation() {
        bottomNavigation = findViewById(R.id.bottomNavigation)
        
        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_dashboard -> {
                    showFragment("dashboard") { 
                        if (dashboardFragment == null) {
                            dashboardFragment = DashboardFragment()
                        }
                        dashboardFragment!!
                    }
                    true
                }
                R.id.nav_services -> {
                    showFragment("services") { 
                        if (servicesFragment == null) {
                            servicesFragment = ServicesFragment()
                        }
                        servicesFragment!!
                    }
                    true
                }
                R.id.nav_history -> {
                    showFragment("history") { 
                        if (historyFragment == null) {
                            historyFragment = HistoryFragment()
                        }
                        historyFragment!!
                    }
                    true
                }
                R.id.nav_notifications -> {
                    showFragment("notifications") { 
                        if (notificationsFragment == null) {
                            notificationsFragment = NotificationsFragment()
                        }
                        notificationsFragment!!
                    }
                    true
                }
                R.id.nav_settings -> {
                    showFragment("settings") { 
                        if (settingsFragment == null) {
                            settingsFragment = SettingsFragment()
                        }
                        settingsFragment!!
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun showFragment(tag: String, fragmentFactory: () -> Fragment) {
        val transaction = supportFragmentManager.beginTransaction()
        
        // Сначала пытаемся найти существующий фрагмент по тегу
        val existingFragment = supportFragmentManager.findFragmentByTag(tag)
        
        if (existingFragment != null && existingFragment.isAdded) {
            // Фрагмент уже существует и добавлен - просто показываем его
            currentFragment?.let {
                if (it != existingFragment && it.isAdded) {
                    transaction.hide(it)
                }
            }
            transaction.show(existingFragment)
            currentFragment = existingFragment
            
            // Обновляем ссылку на фрагмент в соответствующей переменной
            when (tag) {
                "dashboard" -> dashboardFragment = existingFragment as? DashboardFragment
                "services" -> servicesFragment = existingFragment as? ServicesFragment
                "history" -> historyFragment = existingFragment as? HistoryFragment
                "notifications" -> notificationsFragment = existingFragment as? NotificationsFragment
                "settings" -> settingsFragment = existingFragment as? SettingsFragment
            }
        } else {
            // Фрагмент не существует или не добавлен - создаем и добавляем
            val fragment = fragmentFactory()
            
            // Скрываем текущий фрагмент
            currentFragment?.let {
                if (it.isAdded) {
                    transaction.hide(it)
                }
            }
            
            // Добавляем новый фрагмент
            transaction.add(R.id.fragmentContainer, fragment, tag)
            currentFragment = fragment
        }
        
        transaction.commit()
    }

    /**
     * Фоновая подгрузка данных клиента при старте приложения.
     * Результаты кладём в ClientStorage, чтобы экраны могли мгновенно
     * показывать данные без ожидания сети.
     */
    private fun prefetchClientData() {
        lifecycleScope.launch {
            try {
                val clientDeferred = async { RetrofitClient.apiService.getClientInfo() }
                val statsDeferred = async { RetrofitClient.apiService.getClientStats() }

                val clientResponse = clientDeferred.await()
                if (clientResponse.isSuccessful && clientResponse.body() != null) {
                    val client = clientResponse.body()!!
                    ClientStorage.saveClient(this@MainActivity, client)
                }

                try {
                    val statsResponse = statsDeferred.await()
                    if (statsResponse.isSuccessful && statsResponse.body() != null) {
                        val statsBody = statsResponse.body()!!
                        val stats = mapOf<String, Any>(
                            "totalSpent" to ((statsBody["totalSpent"] as? Number)?.toDouble() ?: 0.0),
                            "activeInvoices" to ((statsBody["activeInvoices"] as? Number)?.toInt() ?: 0),
                            "paidInvoices" to ((statsBody["paidInvoices"] as? Number)?.toInt() ?: 0)
                        )
                        ClientStorage.saveStats(this@MainActivity, stats)
                    }
                } catch (_: Exception) {
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun navigateToLogin() {
        val intent = Intent(this, com.example.worldcashbox.ui.login.LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
