package com.example.worldcashbox.ui.balance

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Transaction
import com.example.worldcashbox.databinding.ActivityBalanceBinding
import com.example.worldcashbox.databinding.DialogTopUpBinding
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

class BalanceActivity : AppCompatActivity() {
    private lateinit var binding: ActivityBalanceBinding
    private val presetAmounts = listOf(1000, 3000, 5000, 10000, 25000, 50000)
    private var selectedAmount: Int? = null
    private var transactions = mutableListOf<Transaction>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBalanceBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupRecyclerView()
        setupListeners()
        loadBalance()
        loadTransactions()
    }

    private fun setupRecyclerView() {
        binding.transactionsRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.transactionsRecyclerView.adapter = BalanceTransactionsAdapter(transactions)
    }

    private fun setupListeners() {
        binding.topUpButton.setOnClickListener {
            showTopUpDialog()
        }
    }

    private fun loadBalance() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getBalance()
                if (response.isSuccessful && response.body() != null) {
                    val balance = response.body()!!.balance
                    val formatter = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
                    binding.balanceTextView.text = formatter.format(balance)
                }
            } catch (e: Exception) {
                Toast.makeText(this@BalanceActivity, "Ошибка загрузки баланса", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun loadTransactions() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getTransactionHistory(20)
                if (response.isSuccessful && response.body() != null) {
                    transactions.clear()
                    transactions.addAll(response.body()!!.transactions)
                    binding.transactionsRecyclerView.adapter?.notifyDataSetChanged()
                    
                    if (transactions.isEmpty()) {
                        binding.emptyTransactionsTextView.visibility = View.VISIBLE
                        binding.transactionsRecyclerView.visibility = View.GONE
                    } else {
                        binding.emptyTransactionsTextView.visibility = View.GONE
                        binding.transactionsRecyclerView.visibility = View.VISIBLE
                    }
                }
            } catch (e: Exception) {
                // Игнорируем ошибки загрузки транзакций
            }
        }
    }

    private fun showTopUpDialog() {
        val dialogBinding = DialogTopUpBinding.inflate(LayoutInflater.from(this))
        val dialog = AlertDialog.Builder(this)
            .setView(dialogBinding.root)
            .create()

        // Настройка предустановленных сумм
        val presetButtons = listOf(
            dialogBinding.preset1Button,
            dialogBinding.preset2Button,
            dialogBinding.preset3Button,
            dialogBinding.preset4Button,
            dialogBinding.preset5Button,
            dialogBinding.preset6Button
        )

        presetButtons.forEachIndexed { index, button ->
            if (index < presetAmounts.size) {
                val amount = presetAmounts[index]
                button.text = "${amount.toLocaleString()} ₽"
                button.visibility = View.VISIBLE
                button.setOnClickListener {
                    selectedAmount = amount
                    dialogBinding.customAmountEditText.setText(amount.toString())
                    // Выделяем выбранную кнопку
                    presetButtons.forEach { it.strokeWidth = 2 }
                    button.strokeWidth = 4
                }
            } else {
                button.visibility = View.GONE
            }
        }

        // Настройка ввода своей суммы
        dialogBinding.customAmountEditText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val amount = s?.toString()?.toIntOrNull()
                selectedAmount = amount
                // Сбрасываем выделение предустановленных кнопок
                presetButtons.forEach { it.strokeWidth = 2 }
                
                if (amount != null && amount > 0) {
                    dialogBinding.invoiceInfoTextView.text = 
                        "Будет сформирован счет на сумму ${amount.toLocaleString()} ₽"
                    dialogBinding.confirmButton.isEnabled = true
                    dialogBinding.confirmButton.text = "Пополнить на ${amount.toLocaleString()} ₽"
                } else {
                    dialogBinding.invoiceInfoTextView.text = ""
                    dialogBinding.confirmButton.isEnabled = false
                    dialogBinding.confirmButton.text = "Пополнить баланс"
                }
            }
        })

        // Кнопка подтверждения
        dialogBinding.confirmButton.setOnClickListener {
            val amount = selectedAmount
            if (amount != null && amount >= 100 && amount <= 1000000) {
                performTopUp(amount, dialog)
            } else {
                Toast.makeText(this, 
                    if (amount == null || amount < 100) "Минимальная сумма пополнения - 100 ₽"
                    else "Максимальная сумма пополнения - 1 000 000 ₽",
                    Toast.LENGTH_SHORT).show()
            }
        }

        dialogBinding.closeButton.setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }

    private fun performTopUp(amount: Int, dialog: AlertDialog) {
        lifecycleScope.launch {
            try {
                // Получаем данные клиента для создания счета
                var clientData: com.example.worldcashbox.data.model.Client? = null
                try {
                    val clientResponse = RetrofitClient.apiService.getClientInfo()
                    if (clientResponse.isSuccessful && clientResponse.body() != null) {
                        clientData = clientResponse.body()!!
                    }
                } catch (e: Exception) {
                    // Игнорируем ошибки получения данных клиента
                }

                // Пробуем создать счет SBIS
                var invoiceNumber = "WCB-${System.currentTimeMillis()}"
                if (clientData?.inn != null) {
                    try {
                        val invoiceRequest = mapOf(
                            "buyerINN" to clientData.inn,
                            "buyerName" to (clientData.name),
                            "buyerKPP" to (clientData.kpp ?: ""),
                            "sellerINN" to "YOUR_COMPANY_INN", // Замените на ваш ИНН
                            "amount" to amount
                        )
                        val invoiceResponse = RetrofitClient.apiService.createTopUpInvoice(invoiceRequest)
                        if (invoiceResponse.isSuccessful && invoiceResponse.body() != null) {
                            val invoiceData = invoiceResponse.body()!!
                            if (invoiceData["success"] == true) {
                                val data = invoiceData["data"] as? Map<*, *>
                                invoiceNumber = (data?.get("number") as? String) ?: invoiceNumber
                            }
                        }
                    } catch (e: Exception) {
                        // Игнорируем ошибки создания счета (демо-режим)
                    }
                }

                // Отправляем запрос на пополнение баланса
                val response = RetrofitClient.apiService.topUpBalance(
                    com.example.worldcashbox.data.model.TopUpRequest(amount)
                )
                
                if (response.isSuccessful && response.body() != null) {
                    val result = response.body()!!
                    if (result.success) {
                        val formatter = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
                        binding.balanceTextView.text = formatter.format(result.balance)
                        Toast.makeText(this@BalanceActivity, 
                            "Баланс пополнен на ${amount.toLocaleString()} ₽. Счет: $invoiceNumber", 
                            Toast.LENGTH_LONG).show()
                        dialog.dismiss()
                        loadBalance()
                        loadTransactions()
                    } else {
                        Toast.makeText(this@BalanceActivity, 
                            result.message ?: "Ошибка пополнения", 
                            Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(this@BalanceActivity, "Ошибка пополнения баланса", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@BalanceActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun Int.toLocaleString(): String {
        return NumberFormat.getNumberInstance(Locale("ru", "RU")).format(this)
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}

// Адаптер для списка транзакций
class BalanceTransactionsAdapter(private val transactions: List<Transaction>) :
    androidx.recyclerview.widget.RecyclerView.Adapter<BalanceTransactionsAdapter.ViewHolder>() {

    class ViewHolder(val view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view)

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_transaction, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val transaction = transactions[position]
        val amountText = holder.view.findViewById<android.widget.TextView>(R.id.amountTextView)
        val descriptionText = holder.view.findViewById<android.widget.TextView>(R.id.descriptionTextView)
        val dateText = holder.view.findViewById<android.widget.TextView>(R.id.dateTextView)
        val iconView = holder.view.findViewById<android.widget.TextView>(R.id.iconTextView)

        val isPositive = transaction.type == "payment" || transaction.amount > 0
        val sign = if (isPositive) "+" else "-"
        val amount = Math.abs(transaction.amount)
        
        amountText.text = "$sign${amount.toLocaleString()} ₽"
        amountText.setTextColor(holder.view.context.getColor(
            if (isPositive) R.color.success else R.color.error
        ))
        
        descriptionText.text = transaction.description ?: transaction.serviceName ?: "Операция"
        
        val dateStr = transaction.created_at ?: transaction.date
        if (dateStr != null) {
            try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                val outputFormat = SimpleDateFormat("d MMMM, HH:mm", Locale("ru", "RU"))
                val date = inputFormat.parse(dateStr)
                dateText.text = if (date != null) outputFormat.format(date) else dateStr
            } catch (e: Exception) {
                dateText.text = dateStr
            }
        } else {
            dateText.text = ""
        }
        
        iconView.text = if (isPositive) "↑" else "↓"
    }

    override fun getItemCount() = transactions.size

    private fun Double.toLocaleString(): String {
        return NumberFormat.getNumberInstance(Locale("ru", "RU")).format(this)
    }
}
