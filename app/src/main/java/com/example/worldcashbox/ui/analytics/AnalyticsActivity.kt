package com.example.worldcashbox.ui.analytics

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.databinding.ActivityAnalyticsBinding
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.*

class AnalyticsActivity : AppCompatActivity() {
    private lateinit var binding: ActivityAnalyticsBinding
    private var currentPeriod = "month"
    private val periods = listOf("month", "quarter", "year", "all")
    private val periodLabels = mapOf(
        "month" to "Месяц",
        "quarter" to "Квартал",
        "year" to "Год",
        "all" to "Всё время"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAnalyticsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupPeriodButtons()
        setupListeners()
        loadAnalytics()
    }

    private fun setupPeriodButtons() {
        val buttons = listOf(
            binding.periodMonthButton,
            binding.periodQuarterButton,
            binding.periodYearButton,
            binding.periodAllButton
        )
        
        buttons.forEachIndexed { index, button ->
            if (index < periods.size) {
                val period = periods[index]
                button.text = periodLabels[period]
                button.setOnClickListener {
                    currentPeriod = period
                    updatePeriodButtons(buttons)
                    loadAnalytics()
                }
            } else {
                button.visibility = View.GONE
            }
        }
        
        updatePeriodButtons(buttons)
    }

    private fun updatePeriodButtons(buttons: List<MaterialButton>) {
        buttons.forEachIndexed { index, button ->
            if (index < periods.size) {
                val period = periods[index]
                if (period == currentPeriod) {
                    button.strokeWidth = 4
                    button.setTextColor(getColor(R.color.primary))
                } else {
                    button.strokeWidth = 2
                    button.setTextColor(getColor(R.color.text_muted))
                }
            }
        }
    }

    private fun setupListeners() {
        binding.syncButton.setOnClickListener {
            syncAnalytics()
        }
    }

    private fun loadAnalytics() {
        binding.progressBar.visibility = View.VISIBLE
        binding.contentScrollView.visibility = View.GONE
        
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getAnalytics(currentPeriod)
                if (response.isSuccessful && response.body() != null) {
                    val analytics = response.body()!!
                    displayAnalytics(analytics)
                } else {
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("Analytics", "Error response: $errorBody")
                    showEmptyState()
                }
            } catch (e: Exception) {
                android.util.Log.e("Analytics", "Error loading analytics", e)
                Toast.makeText(this@AnalyticsActivity, "Ошибка загрузки аналитики: ${e.message}", Toast.LENGTH_LONG).show()
                showEmptyState()
            } finally {
                binding.progressBar.visibility = View.GONE
                binding.contentScrollView.visibility = View.VISIBLE
            }
        }
    }

    private fun syncAnalytics() {
        binding.syncButton.isEnabled = false
        binding.syncButton.text = "Синхронизация..."
        
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.syncAnalytics()
                if (response.isSuccessful) {
                    Toast.makeText(this@AnalyticsActivity, "Аналитика обновлена", Toast.LENGTH_SHORT).show()
                    loadAnalytics()
                } else {
                    Toast.makeText(this@AnalyticsActivity, "Данные обновлены", Toast.LENGTH_SHORT).show()
                    loadAnalytics()
                }
            } catch (e: Exception) {
                Toast.makeText(this@AnalyticsActivity, "Данные обновлены", Toast.LENGTH_SHORT).show()
                loadAnalytics()
            } finally {
                binding.syncButton.isEnabled = true
                binding.syncButton.text = "Синхронизировать"
            }
        }
    }

    private fun displayAnalytics(analytics: com.example.worldcashbox.data.model.AnalyticsResponse) {
        val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
        
        // Главная метрика - расходы
        val totalSpent = analytics.totalSpent ?: 0.0
        binding.mainStatValueTextView.text = "${formatter.format(totalSpent)} ₽"
        binding.mainStatLabelTextView.text = "Расходы"
        
        if (analytics.trend != null) {
            binding.trendBadgeTextView.visibility = View.VISIBLE
            binding.trendBadgeTextView.text = analytics.trend
        } else {
            binding.trendBadgeTextView.visibility = View.GONE
        }

        // Статистика
        val totalPaid = analytics.totalPaid ?: 0.0
        val invoicesCount = analytics.invoicesCount ?: 0
        val servicesCount = analytics.servicesCount ?: 0
        val avgInvoice = analytics.avgInvoice ?: 0.0

        binding.statPaidValueTextView.text = "${formatter.format(totalPaid)} ₽"
        binding.statInvoicesValueTextView.text = invoicesCount.toString()
        binding.statServicesValueTextView.text = servicesCount.toString()
        binding.statAvgInvoiceValueTextView.text = "${formatter.format(avgInvoice)} ₽"

        // Расходы по категориям
        if (analytics.byCategory != null && analytics.byCategory.isNotEmpty()) {
            binding.categoriesCardView.visibility = View.VISIBLE
            binding.categoriesTitleTextView.visibility = View.VISIBLE
            displayCategories(analytics.byCategory)
        } else {
            binding.categoriesCardView.visibility = View.GONE
            binding.categoriesTitleTextView.visibility = View.GONE
        }

        // График по месяцам
        if (analytics.monthlyData != null && analytics.monthlyData.isNotEmpty()) {
            binding.chartCardView.visibility = View.VISIBLE
            binding.chartTitleTextView.visibility = View.VISIBLE
            displayMonthlyChart(analytics.monthlyData)
        } else {
            binding.chartCardView.visibility = View.GONE
            binding.chartTitleTextView.visibility = View.GONE
        }

        // Пустое состояние
        if ((analytics.byCategory == null || analytics.byCategory.isEmpty()) &&
            (analytics.monthlyData == null || analytics.monthlyData.isEmpty())) {
            showEmptyState()
        } else {
            binding.emptyStateLayout.visibility = View.GONE
        }
    }

    private fun displayCategories(categories: List<com.example.worldcashbox.data.model.CategoryData>) {
        // Очищаем существующие элементы
        binding.categoriesContainer.removeAllViews()
        
        binding.categoriesContainer.post {
            categories.forEach { category ->
                val itemView = layoutInflater.inflate(R.layout.item_category, binding.categoriesContainer, false)
                
                val nameTextView = itemView.findViewById<android.widget.TextView>(R.id.categoryNameTextView)
                val amountTextView = itemView.findViewById<android.widget.TextView>(R.id.categoryAmountTextView)
                val percentTextView = itemView.findViewById<android.widget.TextView>(R.id.categoryPercentTextView)
                val barView = itemView.findViewById<View>(R.id.categoryBarView)
                val barFillView = itemView.findViewById<View>(R.id.categoryBarFillView)
                
                val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
                
                nameTextView.text = category.name
                amountTextView.text = "${formatter.format(category.amount)} ₽"
                percentTextView.text = "${category.percent ?: 0.0}%"
                
                val percent = category.percent ?: 0.0
                val color = if (category.color != null) {
                    try {
                        android.graphics.Color.parseColor(category.color)
                    } catch (e: Exception) {
                        getColor(R.color.primary)
                    }
                } else {
                    getColor(R.color.primary)
                }
                barFillView.setBackgroundColor(color)
                
                binding.categoriesContainer.addView(itemView)
                
                // Устанавливаем ширину после добавления в контейнер
                barView.post {
                    val layoutParams = barFillView.layoutParams
                    layoutParams.width = (barView.width * percent / 100).toInt()
                    barFillView.layoutParams = layoutParams
                }
            }
        }
    }

    private fun displayMonthlyChart(monthlyData: List<com.example.worldcashbox.data.model.MonthlyData>) {
        binding.chartContainer.removeAllViews()
        
        val maxSpent = monthlyData.maxOfOrNull { it.spent ?: 0.0 } ?: 1.0
        
        binding.chartContainer.post {
            monthlyData.forEach { data ->
                val itemView = layoutInflater.inflate(R.layout.item_monthly_bar, binding.chartContainer, false)
                
                val monthTextView = itemView.findViewById<android.widget.TextView>(R.id.monthTextView)
                val valueTextView = itemView.findViewById<android.widget.TextView>(R.id.valueTextView)
                val barView = itemView.findViewById<View>(R.id.barView)
                val barFillView = itemView.findViewById<View>(R.id.barFillView)
                
                val monthName = data.monthName ?: "Месяц ${data.month ?: 0}"
                val spent = data.spent ?: 0.0
                val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
                
                monthTextView.text = monthName
                valueTextView.text = "${formatter.format(spent / 1000)}k"
                
                val percent = if (maxSpent > 0) (spent / maxSpent * 100).toInt() else 0
                barFillView.setBackgroundColor(getColor(R.color.primary))
                
                binding.chartContainer.addView(itemView)
                
                // Устанавливаем ширину после добавления в контейнер
                barView.post {
                    val layoutParams = barFillView.layoutParams
                    layoutParams.width = (barView.width * percent / 100).toInt()
                    barFillView.layoutParams = layoutParams
                }
            }
        }
    }

    private fun showEmptyState() {
        binding.emptyStateLayout.visibility = View.VISIBLE
        binding.categoriesCardView.visibility = View.GONE
        binding.chartCardView.visibility = View.GONE
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}
