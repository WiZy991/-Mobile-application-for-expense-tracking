package com.example.worldcashbox.ui.engineer

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Ticket
import com.example.worldcashbox.databinding.ActivityEngineerTicketsBinding
import com.example.worldcashbox.utils.TokenManager
import com.example.worldcashbox.ui.login.LoginActivity
import kotlinx.coroutines.launch

class EngineerTicketsActivity : AppCompatActivity() {
    private lateinit var binding: ActivityEngineerTicketsBinding
    private lateinit var ticketsAdapter: EngineerTicketsAdapter
    private lateinit var tokenManager: TokenManager
    private var currentFilter: String? = null // "to_do", "in_progress", "in_review", "done", "closed"
    private var assignedFilter: String = "all" // "all", "me", "unassigned"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEngineerTicketsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        
        // Инициализируем RetrofitClient
        RetrofitClient.initialize(this)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Тикеты поддержки"

        setupRecyclerView()
        setupFilterChips()
        loadTickets()
    }

    private fun setupRecyclerView() {
        binding.ticketsRecyclerView.layoutManager = LinearLayoutManager(this)
        ticketsAdapter = EngineerTicketsAdapter { ticket ->
            val intent = Intent(this, EngineerTicketDetailActivity::class.java)
            intent.putExtra("ticketId", ticket.id)
            startActivity(intent)
        }
        binding.ticketsRecyclerView.adapter = ticketsAdapter
    }

    private fun setupFilterChips() {
        // Статусы
        binding.statusChipGroup.setOnCheckedStateChangeListener { _, checkedIds ->
            val id = checkedIds.firstOrNull()
            currentFilter = when (id) {
                binding.statusAllChip.id -> null
                binding.statusToDoChip.id -> "to_do"
                binding.statusInProgressChip.id -> "in_progress"
                binding.statusInReviewChip.id -> "in_review"
                binding.statusDoneChip.id -> "done"
                binding.statusClosedChip.id -> "closed"
                else -> null
            }
            loadTickets()
        }

        // Назначение
        binding.assignedChipGroup.setOnCheckedStateChangeListener { _, checkedIds ->
            val id = checkedIds.firstOrNull()
            assignedFilter = when (id) {
                binding.assignedAllChip.id -> "all"
                binding.assignedMeChip.id -> "me"
                binding.assignedUnassignedChip.id -> "unassigned"
                else -> "all"
            }
            loadTickets()
        }
    }

    private fun loadTickets() {
        binding.progressBar.visibility = android.view.View.VISIBLE
        binding.ticketsRecyclerView.visibility = android.view.View.GONE

        lifecycleScope.launch {
            try {
                val assignedToParam = if (assignedFilter == "all") null else assignedFilter
                val response = RetrofitClient.apiService.getEngineerTickets(
                    status = currentFilter,
                    assignedTo = assignedToParam
                )

                if (response.isSuccessful && response.body() != null) {
                    val tickets = response.body()!!.tickets
                    ticketsAdapter.updateTickets(tickets)
                    binding.ticketsRecyclerView.visibility = android.view.View.VISIBLE
                    
                    if (tickets.isEmpty()) {
                        binding.emptyStateText.visibility = android.view.View.VISIBLE
                        binding.emptyStateText.text = "Нет тикетов"
                    } else {
                        binding.emptyStateText.visibility = android.view.View.GONE
                    }
                } else {
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("EngineerTickets", "Ошибка загрузки тикетов: ${response.code()} - $errorBody")
                    Toast.makeText(
                        this@EngineerTicketsActivity,
                        "Ошибка загрузки тикетов: ${response.code()}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("EngineerTickets", "Исключение при загрузке тикетов", e)
                val errorMessage = when {
                    e.message?.contains("Unable to resolve host") == true -> 
                        "Не удалось подключиться к серверу"
                    e.message?.contains("401") == true || e.message?.contains("403") == true -> 
                        "Ошибка авторизации. Выйдите и войдите снова"
                    else -> "Ошибка: ${e.message ?: "Неизвестная ошибка"}"
                }
                Toast.makeText(
                    this@EngineerTicketsActivity,
                    errorMessage,
                    Toast.LENGTH_LONG
                ).show()
            } finally {
                binding.progressBar.visibility = android.view.View.GONE
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.engineer_tickets_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                finish()
                true
            }
            R.id.menu_refresh -> {
                loadTickets()
                true
            }
            R.id.menu_analytics -> {
                val intent = Intent(this, EngineerAnalyticsActivity::class.java)
                startActivity(intent)
                true
            }
            R.id.menu_logout -> {
                showLogoutDialog()
                true
            }
            else -> super.onOptionsItemSelected(item)
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
        tokenManager.clearUserType()
        tokenManager.clearUserRole()
        
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    override fun onResume() {
        super.onResume()
        loadTickets()
    }
}
