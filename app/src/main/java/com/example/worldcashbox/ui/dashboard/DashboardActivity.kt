package com.example.worldcashbox.ui.dashboard

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.databinding.ActivityDashboardBinding
import com.example.worldcashbox.ui.login.LoginActivity
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

class DashboardActivity : AppCompatActivity() {
    private lateinit var binding: ActivityDashboardBinding
    private lateinit var tokenManager: TokenManager
    private lateinit var transactionsAdapter: TransactionsAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        com.example.worldcashbox.data.api.RetrofitClient.initialize(this)

        if (!tokenManager.isLoggedIn()) {
            navigateToLogin()
            return
        }

        setSupportActionBar(binding.toolbar)
        setupRecyclerView()
        setupListeners()
        loadData()
    }

    private fun setupRecyclerView() {
        transactionsAdapter = TransactionsAdapter()
        binding.transactionsRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@DashboardActivity)
            adapter = transactionsAdapter
        }
    }

    private fun setupListeners() {
        binding.servicesCard.setOnClickListener {
            Toast.makeText(this, "Услуги", Toast.LENGTH_SHORT).show()
        }

        binding.historyCard.setOnClickListener {
            Toast.makeText(this, "История", Toast.LENGTH_SHORT).show()
        }

        binding.analyticsCard.setOnClickListener {
            Toast.makeText(this, "Аналитика", Toast.LENGTH_SHORT).show()
        }

        binding.notificationsCard.setOnClickListener {
            Toast.makeText(this, "Уведомления", Toast.LENGTH_SHORT).show()
        }

        binding.fab.setOnClickListener {
            Toast.makeText(this, "Пополнить баланс", Toast.LENGTH_SHORT).show()
        }
    }

    private fun loadData() {
        lifecycleScope.launch {
            try {
                // Загружаем баланс
                val balanceResponse = RetrofitClient.apiService.getBalance()
                if (balanceResponse.isSuccessful && balanceResponse.body() != null) {
                    val balance = balanceResponse.body()!!.balance
                    val formatter = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
                    binding.balanceTextView.text = formatter.format(balance)
                }

                // Загружаем транзакции
                val transactionsResponse = RetrofitClient.apiService.getTransactionHistory()
                if (transactionsResponse.isSuccessful && transactionsResponse.body() != null) {
                    val transactions = transactionsResponse.body()!!.transactions
                    transactionsAdapter.submitList(transactions.take(3)) // Показываем только последние 3
                }
            } catch (e: Exception) {
                Toast.makeText(this@DashboardActivity, "Ошибка загрузки данных: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.dashboard_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.menu_logout -> {
                logout()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun logout() {
        tokenManager.clear()
        navigateToLogin()
    }

    private fun navigateToLogin() {
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
