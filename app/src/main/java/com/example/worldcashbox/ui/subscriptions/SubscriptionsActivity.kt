package com.example.worldcashbox.ui.subscriptions

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
import com.example.worldcashbox.data.model.SubscribeRequest
import com.example.worldcashbox.databinding.ActivitySubscriptionsBinding
import com.example.worldcashbox.ui.balance.BalanceActivity
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

class SubscriptionsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySubscriptionsBinding
    private var plans: List<com.example.worldcashbox.data.model.SubscriptionPlan> = emptyList()
    private var mySubscriptions: List<com.example.worldcashbox.data.model.Subscription> = emptyList()
    private var balance: Double = 0.0
    private lateinit var plansAdapter: com.example.worldcashbox.ui.subscriptions.SubscriptionsAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySubscriptionsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupRecyclerView()
        setupSwipeRefresh()
        loadData()
    }

    private fun setupRecyclerView() {
        binding.plansRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.mySubscriptionsRecyclerView.layoutManager = LinearLayoutManager(this)
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            loadData()
        }
    }

    private fun loadData() {
        lifecycleScope.launch {
            try {
                binding.swipeRefresh.isRefreshing = true

                // Загружаем тарифы
                val plansResponse = RetrofitClient.apiService.getSubscriptionPlans()
                if (plansResponse.isSuccessful && plansResponse.body() != null) {
                    val plansMap = plansResponse.body()!!
                    plans = plansMap["plans"] ?: emptyList()
                    updatePlansUI()
                }

                // Загружаем подписки
                val subscriptionsResponse = RetrofitClient.apiService.getMySubscriptions()
                if (subscriptionsResponse.isSuccessful && subscriptionsResponse.body() != null) {
                    val subscriptionsMap = subscriptionsResponse.body()!!
                    mySubscriptions = subscriptionsMap["subscriptions"] ?: emptyList()
                    updateSubscriptionsUI()
                }

                // Загружаем баланс
                val balanceResponse = RetrofitClient.apiService.getBalance()
                if (balanceResponse.isSuccessful && balanceResponse.body() != null) {
                    balance = balanceResponse.body()!!.balance
                }
            } catch (e: Exception) {
                android.util.Log.e("Subscriptions", "Error loading data", e)
                Toast.makeText(this@SubscriptionsActivity, "Ошибка загрузки: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun updatePlansUI() {
        if (plans.isEmpty()) {
            binding.emptyPlansTextView.visibility = View.VISIBLE
            binding.plansRecyclerView.visibility = View.GONE
        } else {
            binding.emptyPlansTextView.visibility = View.GONE
            binding.plansRecyclerView.visibility = View.VISIBLE
            if (!::plansAdapter.isInitialized) {
                plansAdapter = com.example.worldcashbox.ui.subscriptions.SubscriptionsAdapter(
                    onSubscribeClick = { plan -> handleSubscribe(plan) },
                    balance = balance
                )
                binding.plansRecyclerView.adapter = plansAdapter
            } else {
                plansAdapter.updateBalance(balance)
            }
            plansAdapter.submitList(plans)
        }
    }

    private fun updateSubscriptionsUI() {
        val activeSubscriptions = mySubscriptions.filter { it.status == "active" }
        if (activeSubscriptions.isEmpty()) {
            binding.emptySubscriptionsTextView.visibility = View.VISIBLE
            binding.mySubscriptionsRecyclerView.visibility = View.GONE
        } else {
            binding.emptySubscriptionsTextView.visibility = View.GONE
            binding.mySubscriptionsRecyclerView.visibility = View.VISIBLE
            binding.mySubscriptionsRecyclerView.adapter = MySubscriptionsAdapter(activeSubscriptions) { subscription ->
                showSubscriptionActions(subscription)
            }
        }
    }

    private fun showSubscriptionActions(subscription: com.example.worldcashbox.data.model.Subscription) {
        val options = arrayOf(
            if (subscription.autoRenewal) "Отключить автопродление" else "Включить автопродление",
            "Отменить подписку"
        )
        
        AlertDialog.Builder(this)
            .setTitle(subscription.planName)
            .setItems(options) { _, which ->
                when (which) {
                    0 -> toggleAutoRenewal(subscription)
                    1 -> cancelSubscription(subscription)
                }
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun toggleAutoRenewal(subscription: com.example.worldcashbox.data.model.Subscription) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.toggleAutoRenewal(
                    subscription.id,
                    mapOf("autoRenewal" to !subscription.autoRenewal)
                )
                if (response.isSuccessful) {
                    Toast.makeText(this@SubscriptionsActivity, 
                        if (subscription.autoRenewal) "Автопродление отключено" else "Автопродление включено",
                        Toast.LENGTH_SHORT).show()
                    loadData()
                } else {
                    Toast.makeText(this@SubscriptionsActivity, "Ошибка", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@SubscriptionsActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun cancelSubscription(subscription: com.example.worldcashbox.data.model.Subscription) {
        AlertDialog.Builder(this)
            .setTitle("Отмена подписки")
            .setMessage("Вы уверены, что хотите отменить подписку \"${subscription.planName}\"?")
            .setPositiveButton("Отменить") { _, _ ->
                lifecycleScope.launch {
                    try {
                        val response = RetrofitClient.apiService.cancelSubscription(subscription.id)
                        if (response.isSuccessful) {
                            Toast.makeText(this@SubscriptionsActivity, "Подписка отменена", Toast.LENGTH_SHORT).show()
                            loadData()
                        } else {
                            Toast.makeText(this@SubscriptionsActivity, "Ошибка", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(this@SubscriptionsActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton("Нет", null)
            .show()
    }

    private fun handleSubscribe(plan: com.example.worldcashbox.data.model.SubscriptionPlan) {
        if (balance < plan.price) {
            AlertDialog.Builder(this)
                .setTitle("Недостаточно средств")
                .setMessage("Для подписки на тариф \"${plan.name}\" необходимо ${formatCurrency(plan.price)}\n\nВаш баланс: ${formatCurrency(balance)}")
                .setPositiveButton("Пополнить") { _, _ ->
                    startActivity(Intent(this, BalanceActivity::class.java))
                }
                .setNegativeButton("Отмена", null)
                .show()
            return
        }

        AlertDialog.Builder(this)
            .setTitle("Подтверждение")
            .setMessage("Вы хотите подписаться на тариф \"${plan.name}\" за ${formatCurrency(plan.price)}?")
            .setPositiveButton("Подписаться") { _, _ ->
                subscribe(plan.id)
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun subscribe(planId: Int) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.subscribe(SubscribeRequest(planId))
                if (response.isSuccessful) {
                    Toast.makeText(this@SubscriptionsActivity, "Подписка оформлена!", Toast.LENGTH_SHORT).show()
                    loadData()
                } else {
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("Subscriptions", "Error response: $errorBody")
                    Toast.makeText(this@SubscriptionsActivity, "Ошибка: ${response.message()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("Subscriptions", "Error subscribing", e)
                Toast.makeText(this@SubscriptionsActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun formatCurrency(amount: Double): String {
        return NumberFormat.getCurrencyInstance(Locale("ru", "RU")).format(amount)
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}

// Адаптер для активных подписок
class MySubscriptionsAdapter(
    private val subscriptions: List<com.example.worldcashbox.data.model.Subscription>,
    private val onSubscriptionClick: (com.example.worldcashbox.data.model.Subscription) -> Unit
) : androidx.recyclerview.widget.RecyclerView.Adapter<MySubscriptionsAdapter.ViewHolder>() {

    class ViewHolder(val view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view)

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
        val view = android.view.LayoutInflater.from(parent.context)
            .inflate(R.layout.item_my_subscription, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val subscription = subscriptions[position]
        val nameText = holder.view.findViewById<android.widget.TextView>(R.id.subscriptionNameTextView)
        val statusText = holder.view.findViewById<android.widget.TextView>(R.id.subscriptionStatusTextView)
        val dateText = holder.view.findViewById<android.widget.TextView>(R.id.subscriptionDateTextView)
        val autoRenewalText = holder.view.findViewById<android.widget.TextView>(R.id.autoRenewalTextView)

        nameText.text = subscription.planName
        statusText.text = "Активна"
        statusText.setTextColor(holder.view.context.getColor(com.example.worldcashbox.R.color.success))

        val dateStr = subscription.endDate
        if (dateStr != null) {
            try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                val outputFormat = SimpleDateFormat("d MMMM yyyy", Locale("ru", "RU"))
                val date = inputFormat.parse(dateStr)
                dateText.text = "До: ${if (date != null) outputFormat.format(date) else dateStr}"
            } catch (e: Exception) {
                dateText.text = "До: $dateStr"
            }
        } else {
            dateText.text = ""
        }

        autoRenewalText.text = if (subscription.autoRenewal) "Автопродление: включено" else "Автопродление: выключено"
        autoRenewalText.setTextColor(holder.view.context.getColor(
            if (subscription.autoRenewal) com.example.worldcashbox.R.color.success else com.example.worldcashbox.R.color.text_muted
        ))

        holder.view.setOnClickListener {
            onSubscriptionClick(subscription)
        }
    }

    override fun getItemCount() = subscriptions.size
}
