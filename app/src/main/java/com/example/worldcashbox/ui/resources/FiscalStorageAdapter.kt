package com.example.worldcashbox.ui.resources

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.model.FiscalStorage
import java.text.SimpleDateFormat
import java.util.*

class FiscalStorageAdapter(
    private val storages: List<FiscalStorage>
) : RecyclerView.Adapter<FiscalStorageAdapter.StorageViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StorageViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_fiscal_storage, parent, false)
        return StorageViewHolder(view)
    }

    override fun onBindViewHolder(holder: StorageViewHolder, position: Int) {
        holder.bind(storages[position])
    }

    override fun getItemCount() = storages.size

    inner class StorageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val storageIdText: TextView = itemView.findViewById(R.id.storageIdText)
        private val modelText: TextView = itemView.findViewById(R.id.storageModelText)
        private val statusText: TextView = itemView.findViewById(R.id.storageStatusText)
        private val effectiveFromText: TextView = itemView.findViewById(R.id.effectiveFromText)
        private val effectiveToText: TextView = itemView.findViewById(R.id.effectiveToText)
        private val fsFinishDateText: TextView = itemView.findViewById(R.id.fsFinishDateText)
        private val workDurationText: TextView = itemView.findViewById(R.id.workDurationText)
        private val daysRemainingText: TextView = itemView.findViewById(R.id.daysRemainingText)

        fun bind(storage: FiscalStorage) {
            storageIdText.text = "Номер ФН: ${storage.storageId ?: "не указан"}"
            modelText.text = storage.model ?: "Модель не указана"
            
            // Статус ФН
            val statusTextValue = when (storage.status) {
                0 -> "Не зарегистрирован"
                2 -> "Зарегистрирован"
                3 -> "Снят с регистрации"
                4 -> "Ждет активации"
                else -> "Неизвестно"
            }
            statusText.text = "Статус: $statusTextValue"
            
            // Дата начала работы
            if (storage.effectiveFrom != null) {
                try {
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                    val date = dateFormat.parse(storage.effectiveFrom)
                    val displayFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
                    effectiveFromText.text = "Начало работы: ${displayFormat.format(date)}"
                } catch (e: Exception) {
                    effectiveFromText.text = "Начало работы: ${storage.effectiveFrom}"
                }
            } else {
                effectiveFromText.text = "Начало работы: не указано"
            }
            
            // Дата окончания работы (если есть)
            if (storage.effectiveTo != null) {
                try {
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                    val date = dateFormat.parse(storage.effectiveTo)
                    val displayFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
                    effectiveToText.text = "Окончание работы: ${displayFormat.format(date)}"
                    effectiveToText.visibility = View.VISIBLE
                } catch (e: Exception) {
                    effectiveToText.text = "Окончание работы: ${storage.effectiveTo}"
                    effectiveToText.visibility = View.VISIBLE
                }
            } else {
                effectiveToText.visibility = View.GONE
            }
            
            // Дата окончания срока действия ФН
            if (storage.fsFinishDate != null) {
                try {
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                    val finishDate = dateFormat.parse(storage.fsFinishDate)
                    val displayFormat = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
                    fsFinishDateText.text = "Срок действия до: ${displayFormat.format(finishDate)}"
                    
                    // Подсчитываем оставшиеся дни
                    val now = Date()
                    val daysRemaining = storage.daysRemaining ?: 0
                    
                    when {
                        daysRemaining < 0 -> {
                            daysRemainingText.text = "⚠️ Срок действия истек"
                            daysRemainingText.setTextColor(ContextCompat.getColor(itemView.context, R.color.error))
                        }
                        daysRemaining < 30 -> {
                            daysRemainingText.text = "⚠️ Осталось дней: $daysRemaining"
                            daysRemainingText.setTextColor(ContextCompat.getColor(itemView.context, R.color.warning))
                        }
                        else -> {
                            daysRemainingText.text = "Осталось дней: $daysRemaining"
                            daysRemainingText.setTextColor(ContextCompat.getColor(itemView.context, R.color.success))
                        }
                    }
                    daysRemainingText.visibility = View.VISIBLE
                } catch (e: Exception) {
                    fsFinishDateText.text = "Срок действия до: ${storage.fsFinishDate}"
                    daysRemainingText.visibility = View.GONE
                }
            } else {
                fsFinishDateText.text = "Срок действия: не указан"
                daysRemainingText.visibility = View.GONE
            }
            
            // Продолжительность работы
            if (storage.workDurationDays != null) {
                workDurationText.text = "Работает: ${storage.workDurationDays} дней"
                workDurationText.visibility = View.VISIBLE
            } else {
                workDurationText.visibility = View.GONE
            }
        }
    }
}
