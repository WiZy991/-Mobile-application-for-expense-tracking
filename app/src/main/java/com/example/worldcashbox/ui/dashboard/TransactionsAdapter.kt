package com.example.worldcashbox.ui.dashboard

import android.content.Intent
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.data.model.Transaction
import com.example.worldcashbox.databinding.ItemTransactionBinding
import com.example.worldcashbox.ui.myservices.ServiceRequestDetailActivity
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale

class TransactionsAdapter(
    private val onItemClick: ((Transaction) -> Unit)? = null
) : ListAdapter<Transaction, TransactionsAdapter.TransactionViewHolder>(
    TransactionDiffCallback()
) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TransactionViewHolder {
        val binding = ItemTransactionBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return TransactionViewHolder(binding)
    }

    override fun onBindViewHolder(holder: TransactionViewHolder, position: Int) {
        val item = getItem(position)
        holder.bind(item)
        
        // Обработка клика
        holder.itemView.setOnClickListener {
            if (item.item_type == "service_request" && item.request_id != null) {
                // Открываем детали заявки
                val intent = Intent(holder.itemView.context, ServiceRequestDetailActivity::class.java)
                intent.putExtra("requestId", item.request_id)
                holder.itemView.context.startActivity(intent)
            } else {
                // Для транзакций вызываем callback, если он есть
                onItemClick?.invoke(item)
            }
        }
    }

    class TransactionViewHolder(
        private val binding: ItemTransactionBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(transaction: Transaction) {
            val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
            
            // Для заявок показываем специальную информацию
            if (transaction.item_type == "service_request") {
                binding.descriptionTextView.text = transaction.description ?: transaction.serviceName ?: "Заявка на услугу"
                
                // Дата
                val dateStr = transaction.created_at ?: transaction.date
                if (dateStr != null) {
                    binding.dateTextView.text = formatDate(dateStr)
                } else {
                    binding.dateTextView.text = ""
                }
                
                // Сумма (для заявок всегда отрицательная, так как это расход)
                val amount = Math.abs(transaction.amount)
                binding.amountTextView.text = "-${formatter.format(amount)} ₽"
                binding.amountTextView.setTextColor(
                    binding.root.context.getColor(com.example.worldcashbox.R.color.error)
                )
                
                // Иконка для заявки
                binding.iconTextView.text = "📋"
            } else {
                // Обычная транзакция
                binding.descriptionTextView.text = transaction.description ?: transaction.serviceName ?: "Операция"
                
                // Дата
                val dateStr = transaction.created_at ?: transaction.date
                if (dateStr != null) {
                    binding.dateTextView.text = formatDate(dateStr)
                } else {
                    binding.dateTextView.text = ""
                }

                // Сумма
                val isPositive = transaction.type == "payment" || transaction.amount > 0
                val sign = if (isPositive) "+" else "-"
                val amount = Math.abs(transaction.amount)
                binding.amountTextView.text = "$sign${formatter.format(amount)} ₽"
                binding.amountTextView.setTextColor(
                    if (isPositive) {
                        binding.root.context.getColor(com.example.worldcashbox.R.color.success)
                    } else {
                        binding.root.context.getColor(com.example.worldcashbox.R.color.error)
                    }
                )

                // Иконка
                binding.iconTextView.text = if (isPositive) "↑" else "↓"
            }
        }

        private fun formatDate(dateString: String): String {
            return try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                val outputFormat = SimpleDateFormat("d MMMM, HH:mm", Locale("ru", "RU"))
                val date = inputFormat.parse(dateString)
                if (date != null) {
                    outputFormat.format(date)
                } else {
                    dateString
                }
            } catch (e: Exception) {
                dateString
            }
        }
    }

    class TransactionDiffCallback : DiffUtil.ItemCallback<Transaction>() {
        override fun areItemsTheSame(oldItem: Transaction, newItem: Transaction): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: Transaction, newItem: Transaction): Boolean {
            return oldItem == newItem
        }
    }
}
