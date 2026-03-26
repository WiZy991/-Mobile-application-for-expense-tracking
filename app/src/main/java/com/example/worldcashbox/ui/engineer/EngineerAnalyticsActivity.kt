package com.example.worldcashbox.ui.engineer

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.databinding.ActivityEngineerAnalyticsBinding
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.*

class EngineerAnalyticsActivity : AppCompatActivity() {
    private lateinit var binding: ActivityEngineerAnalyticsBinding
    private var currentPeriod = "month"
    private var assignedTo = "me"
    private val periods = listOf("week", "month", "quarter", "year")
    private val periodLabels = mapOf(
        "week" to "Неделя",
        "month" to "Месяц",
        "quarter" to "Квартал",
        "year" to "Год"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEngineerAnalyticsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Аналитика тикетов"

        setupPeriodButtons()
        setupAssignedButtons()
        setupListeners()
        loadAnalytics()
    }

    private fun setupPeriodButtons() {
        val buttons = listOf(
            binding.periodWeekButton,
            binding.periodMonthButton,
            binding.periodQuarterButton,
            binding.periodYearButton
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

    private fun setupAssignedButtons() {
        binding.assignedMeButton.setOnClickListener {
            assignedTo = "me"
            updateAssignedButtons()
            loadAnalytics()
        }
        
        binding.assignedAllButton.setOnClickListener {
            assignedTo = "all"
            updateAssignedButtons()
            loadAnalytics()
        }
        
        updateAssignedButtons()
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

    private fun updateAssignedButtons() {
        if (assignedTo == "me") {
            binding.assignedMeButton.strokeWidth = 4
            binding.assignedMeButton.setTextColor(getColor(R.color.primary))
            binding.assignedAllButton.strokeWidth = 2
            binding.assignedAllButton.setTextColor(getColor(R.color.text_muted))
        } else {
            binding.assignedAllButton.strokeWidth = 4
            binding.assignedAllButton.setTextColor(getColor(R.color.primary))
            binding.assignedMeButton.strokeWidth = 2
            binding.assignedMeButton.setTextColor(getColor(R.color.text_muted))
        }
    }

    private fun setupListeners() {
        binding.toolbar.setNavigationOnClickListener {
            finish()
        }
    }

    private fun loadAnalytics() {
        binding.progressBar.visibility = View.VISIBLE
        binding.contentScrollView.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getEngineerAnalytics(
                    period = currentPeriod,
                    assignedTo = assignedTo
                )

                if (response.isSuccessful && response.body() != null) {
                    val analytics = response.body()!!
                    android.util.Log.d("EngineerAnalytics", "Analytics received: $analytics")
                    displayAnalytics(analytics)
                } else {
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("EngineerAnalytics", "Error response: code=${response.code()}, body=$errorBody")
                    Toast.makeText(
                        this@EngineerAnalyticsActivity,
                        "Ошибка загрузки аналитики: ${response.code()}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("EngineerAnalytics", "Error loading analytics", e)
                Toast.makeText(
                    this@EngineerAnalyticsActivity,
                    "Ошибка загрузки аналитики: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                // Просто показываем контент с нулевыми значениями
            } finally {
                binding.progressBar.visibility = View.GONE
                binding.contentScrollView.visibility = View.VISIBLE
            }
        }
    }

    private fun displayAnalytics(analytics: Map<String, Any>) {
        val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))

        android.util.Log.d("EngineerAnalytics", "Displaying analytics: total_tickets=${analytics["total_tickets"]}, in_progress=${analytics["in_progress_tickets"]}")

        // Общая статистика
        val totalTickets = (analytics["total_tickets"] as? Number)?.toInt() ?: 0
        val toDoTickets = (analytics["to_do_tickets"] as? Number)?.toInt() ?: 0
        val inProgressTickets = (analytics["in_progress_tickets"] as? Number)?.toInt() ?: 0
        val inReviewTickets = (analytics["in_review_tickets"] as? Number)?.toInt() ?: 0
        val doneTickets = (analytics["done_tickets"] as? Number)?.toInt() ?: 0
        val closedTickets = (analytics["closed_tickets"] as? Number)?.toInt() ?: 0
        val completedTickets = (analytics["completed_tickets"] as? Number)?.toInt() ?: 0
        
        android.util.Log.d("EngineerAnalytics", "Parsed values: total=$totalTickets, toDo=$toDoTickets, inProgress=$inProgressTickets")

        binding.totalTicketsValueTextView.text = totalTickets.toString()
        binding.toDoTicketsValueTextView.text = toDoTickets.toString()
        binding.inProgressTicketsValueTextView.text = inProgressTickets.toString()
        binding.inReviewTicketsValueTextView.text = inReviewTickets.toString()
        binding.doneTicketsValueTextView.text = doneTickets.toString()
        binding.closedTicketsValueTextView.text = closedTickets.toString()
        binding.completedTicketsValueTextView.text = completedTickets.toString()

        // Время
        val totalTimeMinutes = (analytics["total_time_minutes"] as? Number)?.toDouble() ?: 0.0
        val avgTimeMinutes = (analytics["avg_time_minutes"] as? Number)?.toDouble() ?: 0.0
        val minTimeMinutes = (analytics["min_time_minutes"] as? Number)?.toDouble() ?: 0.0
        val maxTimeMinutes = (analytics["max_time_minutes"] as? Number)?.toDouble() ?: 0.0

        binding.totalTimeValueTextView.text = formatTime(totalTimeMinutes)
        binding.avgTimeValueTextView.text = formatTime(avgTimeMinutes)
        binding.minTimeValueTextView.text = formatTime(minTimeMinutes)
        binding.maxTimeValueTextView.text = formatTime(maxTimeMinutes)

        // Приоритеты
        val urgentCount = (analytics["urgent_count"] as? Number)?.toInt() ?: 0
        val highCount = (analytics["high_count"] as? Number)?.toInt() ?: 0
        val normalCount = (analytics["normal_count"] as? Number)?.toInt() ?: 0
        val lowCount = (analytics["low_count"] as? Number)?.toInt() ?: 0

        binding.urgentCountTextView.text = urgentCount.toString()
        binding.highCountTextView.text = highCount.toString()
        binding.normalCountTextView.text = normalCount.toString()
        binding.lowCountTextView.text = lowCount.toString()

        // График по статусам
        displayStatusChart(mapOf(
            "К выполнению" to toDoTickets,
            "В работе" to inProgressTickets,
            "На проверке" to inReviewTickets,
            "Выполнено" to doneTickets,
            "Закрыто" to closedTickets
        ))

        // График по приоритетам
        displayPriorityChart(mapOf(
            "Срочный" to urgentCount,
            "Высокий" to highCount,
            "Обычный" to normalCount,
            "Низкий" to lowCount
        ))

        // График по дням
        val dailyStats = analytics["daily_stats"] as? List<Map<String, Any>>
        if (dailyStats != null && dailyStats.isNotEmpty()) {
            displayDailyChart(dailyStats)
        } else {
            binding.dailyChartCard.visibility = View.GONE
        }
    }

    private fun formatTime(minutes: Double): String {
        val hours = (minutes / 60).toInt()
        val mins = (minutes % 60).toInt()
        return if (hours > 0) {
            "${hours}ч ${mins}м"
        } else {
            "${mins}м"
        }
    }

    private fun displayStatusChart(data: Map<String, Int>) {
        binding.statusChartContainer.removeAllViews()
        
        val maxValue = data.values.maxOrNull() ?: 1
        
        data.forEach { (label, value) ->
            val itemView = layoutInflater.inflate(R.layout.item_chart_bar, binding.statusChartContainer, false)
            
            val labelTextView = itemView.findViewById<android.widget.TextView>(R.id.labelTextView)
            val valueTextView = itemView.findViewById<android.widget.TextView>(R.id.valueTextView)
            val barView = itemView.findViewById<View>(R.id.barView)
            val barFillView = itemView.findViewById<View>(R.id.barFillView)
            
            labelTextView.text = label
            valueTextView.text = value.toString()
            
            val percent = if (maxValue > 0) (value.toFloat() / maxValue * 100).toInt() else 0
            barFillView.setBackgroundColor(getColor(R.color.primary))
            
            binding.statusChartContainer.addView(itemView)
            
            barView.post {
                val layoutParams = barFillView.layoutParams
                layoutParams.width = (barView.width * percent / 100).toInt()
                barFillView.layoutParams = layoutParams
            }
        }
    }

    private fun displayPriorityChart(data: Map<String, Int>) {
        binding.priorityChartContainer.removeAllViews()
        
        val maxValue = data.values.maxOrNull() ?: 1
        val colors = mapOf(
            "Срочный" to R.color.error,
            "Высокий" to R.color.warning,
            "Обычный" to R.color.primary,
            "Низкий" to R.color.text_muted
        )
        
        data.forEach { (label, value) ->
            val itemView = layoutInflater.inflate(R.layout.item_chart_bar, binding.priorityChartContainer, false)
            
            val labelTextView = itemView.findViewById<android.widget.TextView>(R.id.labelTextView)
            val valueTextView = itemView.findViewById<android.widget.TextView>(R.id.valueTextView)
            val barView = itemView.findViewById<View>(R.id.barView)
            val barFillView = itemView.findViewById<View>(R.id.barFillView)
            
            labelTextView.text = label
            valueTextView.text = value.toString()
            
            val percent = if (maxValue > 0) (value.toFloat() / maxValue * 100).toInt() else 0
            val color = colors[label] ?: R.color.primary
            barFillView.setBackgroundColor(getColor(color))
            
            binding.priorityChartContainer.addView(itemView)
            
            barView.post {
                val layoutParams = barFillView.layoutParams
                layoutParams.width = (barView.width * percent / 100).toInt()
                barFillView.layoutParams = layoutParams
            }
        }
    }

    private fun displayDailyChart(dailyStats: List<Map<String, Any>>) {
        binding.dailyChartCard.visibility = View.VISIBLE
        binding.dailyChartContainer.removeAllViews()
        
        val maxValue = dailyStats.maxOfOrNull { 
            ((it["tickets_count"] as? Number)?.toInt() ?: 0).toFloat()
        } ?: 1f
        
        dailyStats.forEach { data ->
            val itemView = layoutInflater.inflate(R.layout.item_chart_bar, binding.dailyChartContainer, false)
            
            val labelTextView = itemView.findViewById<android.widget.TextView>(R.id.labelTextView)
            val valueTextView = itemView.findViewById<android.widget.TextView>(R.id.valueTextView)
            val barView = itemView.findViewById<View>(R.id.barView)
            val barFillView = itemView.findViewById<View>(R.id.barFillView)
            
            val date = data["date"] as? String ?: ""
            val count = (data["tickets_count"] as? Number)?.toInt() ?: 0
            
            labelTextView.text = formatDate(date)
            valueTextView.text = count.toString()
            
            val percent = if (maxValue > 0) (count.toFloat() / maxValue * 100).toInt() else 0
            barFillView.setBackgroundColor(getColor(R.color.info))
            
            binding.dailyChartContainer.addView(itemView)
            
            barView.post {
                val layoutParams = barFillView.layoutParams
                layoutParams.width = (barView.width * percent / 100).toInt()
                barFillView.layoutParams = layoutParams
            }
        }
    }

    private fun formatDate(dateString: String): String {
        return try {
            val inputFormat = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val outputFormat = java.text.SimpleDateFormat("dd.MM", Locale.getDefault())
            val date = inputFormat.parse(dateString)
            outputFormat.format(date ?: return dateString)
        } catch (e: Exception) {
            dateString
        }
    }
    
    override fun onResume() {
        super.onResume()
        // Обновляем аналитику при возврате на экран
        loadAnalytics()
    }

}
