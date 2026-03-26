package com.example.worldcashbox.ui.resources

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.model.KKT
import java.text.SimpleDateFormat
import java.util.*

class KKTAdapter(
    private val kkts: List<KKT>,
    private val onItemClick: (KKT) -> Unit
) : RecyclerView.Adapter<KKTAdapter.KKTViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): KKTViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_kkt, parent, false)
        return KKTViewHolder(view)
    }

    override fun onBindViewHolder(holder: KKTViewHolder, position: Int) {
        holder.bind(kkts[position])
    }

    override fun getItemCount() = kkts.size

    inner class KKTViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val modelText: TextView = itemView.findViewById(R.id.kktModelText)
        private val factoryIdText: TextView = itemView.findViewById(R.id.kktFactoryIdText)
        private val regIdText: TextView = itemView.findViewById(R.id.kktRegIdText)
        private val organizationText: TextView = itemView.findViewById(R.id.kktOrganizationText)
        private val salesPointText: TextView = itemView.findViewById(R.id.kktSalesPointText)
        private val addressText: TextView = itemView.findViewById(R.id.kktAddressText)
        private val kppText: TextView = itemView.findViewById(R.id.kktKppText)
        private val statusText: TextView = itemView.findViewById(R.id.kktStatusText)
        private val firstShiftDateText: TextView = itemView.findViewById(R.id.kktFirstShiftDateText)
        private val licenseText: TextView = itemView.findViewById(R.id.kktLicenseText)
        private val fsNumberText: TextView = itemView.findViewById(R.id.kktFsNumberText)
        private val fsFinishDateText: TextView = itemView.findViewById(R.id.kktFsFinishDateText)

        fun bind(kkt: KKT) {
            modelText.text = kkt.model ?: "Модель не указана"
            
            // Заводской номер
            if (!kkt.factoryId.isNullOrBlank()) {
                factoryIdText.text = "Заводской номер: ${kkt.factoryId}"
                factoryIdText.visibility = View.VISIBLE
            } else {
                factoryIdText.visibility = View.GONE
            }
            
            regIdText.text = "Рег. номер: ${kkt.regId ?: "не указан"}"
            
            // Организация
            if (!kkt.organizationName.isNullOrBlank()) {
                organizationText.text = "Организация: ${kkt.organizationName}"
                organizationText.visibility = View.VISIBLE
            } else {
                organizationText.visibility = View.GONE
            }
            
            // Точка продаж
            if (!kkt.kktSalesPoint.isNullOrBlank()) {
                salesPointText.text = "Точка продаж: ${kkt.kktSalesPoint}"
                salesPointText.visibility = View.VISIBLE
            } else {
                salesPointText.visibility = View.GONE
            }
            
            addressText.text = kkt.address ?: "Адрес не указан"
            
            // КПП
            if (!kkt.kpp.isNullOrBlank()) {
                kppText.text = "КПП: ${kkt.kpp}"
                kppText.visibility = View.VISIBLE
            } else {
                kppText.visibility = View.GONE
            }
            
            // Статус ККТ
            val statusTextValue = when (kkt.status) {
                0 -> "Не зарегистрирована"
                2 -> "Активирована"
                3 -> "Снята с регистрации"
                4 -> "Ожидание активации"
                6 -> "Нет лицензии"
                else -> "Неизвестно"
            }
            statusText.text = "Статус: $statusTextValue"
            
            // Дата первой смены
            if (!kkt.firstShiftDate.isNullOrBlank()) {
                try {
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                    val date = dateFormat.parse(kkt.firstShiftDate)
                    val displayFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
                    firstShiftDateText.text = "Первая смена: ${displayFormat.format(date)}"
                    firstShiftDateText.visibility = View.VISIBLE
                } catch (e: Exception) {
                    firstShiftDateText.text = "Первая смена: ${kkt.firstShiftDate}"
                    firstShiftDateText.visibility = View.VISIBLE
                }
            } else {
                firstShiftDateText.visibility = View.GONE
            }
            
            // Лицензия
            val licenseParts = mutableListOf<String>()
            if (!kkt.licenseStartDate.isNullOrBlank()) {
                try {
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                    val date = dateFormat.parse(kkt.licenseStartDate)
                    val displayFormat = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
                    licenseParts.add("с ${displayFormat.format(date)}")
                } catch (e: Exception) {
                    licenseParts.add("с ${kkt.licenseStartDate}")
                }
            }
            if (!kkt.licenseFinishDate.isNullOrBlank()) {
                try {
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                    val date = dateFormat.parse(kkt.licenseFinishDate)
                    val displayFormat = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
                    licenseParts.add("до ${displayFormat.format(date)}")
                } catch (e: Exception) {
                    licenseParts.add("до ${kkt.licenseFinishDate}")
                }
            }
            if (licenseParts.isNotEmpty()) {
                licenseText.text = "Лицензия: ${licenseParts.joinToString(", ")}"
                licenseText.visibility = View.VISIBLE
            } else {
                licenseText.visibility = View.GONE
            }
            
            fsNumberText.text = "ФН: ${kkt.fsNumber ?: "не указан"}"
            
            // Дата окончания ФН
            if (kkt.fsFinishDate != null) {
                try {
                    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                    val date = dateFormat.parse(kkt.fsFinishDate)
                    val displayFormat = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
                    fsFinishDateText.text = "Срок ФН до: ${displayFormat.format(date)}"
                } catch (e: Exception) {
                    fsFinishDateText.text = "Срок ФН до: ${kkt.fsFinishDate}"
                }
            } else {
                fsFinishDateText.text = "Срок ФН: не указан"
            }

            itemView.setOnClickListener {
                onItemClick(kkt)
            }
        }
    }
}
