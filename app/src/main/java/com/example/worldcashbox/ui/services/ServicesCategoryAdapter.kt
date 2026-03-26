package com.example.worldcashbox.ui.services

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.model.Service
import java.text.NumberFormat
import java.util.Locale

/**
 * Адаптер для отображения услуг с группировкой по категориям
 */
class ServicesCategoryAdapter(
    private val services: List<Service>,
    private val onItemClick: (Service) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val TYPE_CATEGORY_HEADER = 0
        private const val TYPE_SERVICE = 1
    }

    // Группируем услуги по категориям и подкатегориям (вычисляется каждый раз)
    private val groupedItems: List<AdapterItem>
        get() {
            android.util.Log.d("ServicesCategoryAdapter", "Вычисление groupedItems для ${services.size} услуг")
            
            val items = mutableListOf<AdapterItem>()
            val categoryMap = mutableMapOf<String, MutableList<Service>>()
            
            // Группируем услуги по категориям
            services.forEach { service ->
                val category = service.category ?: "other"
                val subcategory = service.subcategory
                
                val key = if (subcategory != null) "$category|$subcategory" else category
                
                if (!categoryMap.containsKey(key)) {
                    categoryMap[key] = mutableListOf()
                }
                categoryMap[key]!!.add(service)
            }
            
            android.util.Log.d("ServicesCategoryAdapter", "Найдено категорий: ${categoryMap.size}")
            
            // Создаем элементы для отображения
            categoryMap.toSortedMap().forEach { (key, serviceList) ->
                val parts = key.split("|")
                val category = parts[0]
                val subcategory = if (parts.size > 1) parts[1] else null
                
                // Добавляем заголовок категории
                items.add(AdapterItem.CategoryHeader(
                    category = getCategoryDisplayName(category),
                    subcategory = subcategory
                ))
                
                // Добавляем услуги этой категории
                serviceList.sortedBy { it.name }.forEach { service ->
                    items.add(AdapterItem.ServiceItem(service))
                }
            }
            
            android.util.Log.d("ServicesCategoryAdapter", "Итого элементов для отображения: ${items.size}")
            return items
        }

    override fun getItemViewType(position: Int): Int {
        return when (groupedItems[position]) {
            is AdapterItem.CategoryHeader -> TYPE_CATEGORY_HEADER
            is AdapterItem.ServiceItem -> TYPE_SERVICE
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return when (viewType) {
            TYPE_CATEGORY_HEADER -> {
                val view = LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_service_category_header, parent, false)
                CategoryHeaderViewHolder(view)
            }
            TYPE_SERVICE -> {
                val view = LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_service_catalog, parent, false)
                ServiceViewHolder(view)
            }
            else -> throw IllegalArgumentException("Unknown view type: $viewType")
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = groupedItems[position]) {
            is AdapterItem.CategoryHeader -> {
                (holder as CategoryHeaderViewHolder).bind(item)
            }
            is AdapterItem.ServiceItem -> {
                (holder as ServiceViewHolder).bind(item.service, onItemClick)
            }
        }
    }

    override fun getItemCount(): Int {
        val count = groupedItems.size
        android.util.Log.d("ServicesCategoryAdapter", "getItemCount() = $count, services.size = ${services.size}")
        return count
    }

    // ViewHolder для заголовка категории
    class CategoryHeaderViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val categoryNameText: TextView = view.findViewById(R.id.categoryNameTextView)
        private val categorySubcategoryText: TextView = view.findViewById(R.id.categorySubcategoryTextView)

        fun bind(item: AdapterItem.CategoryHeader) {
            categoryNameText.text = item.category
            if (item.subcategory != null) {
                categorySubcategoryText.text = item.subcategory
                categorySubcategoryText.visibility = View.VISIBLE
            } else {
                categorySubcategoryText.visibility = View.GONE
            }
        }
    }

    // ViewHolder для услуги
    class ServiceViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val nameText: TextView = view.findViewById(R.id.serviceNameTextView)
        private val descriptionText: TextView = view.findViewById(R.id.serviceDescriptionTextView)
        private val priceText: TextView = view.findViewById(R.id.servicePriceTextView)

        fun bind(service: Service, onItemClick: (Service) -> Unit) {
            nameText.text = service.name
            // Описание скрываем в списке - показываем только при клике на услугу
            descriptionText.visibility = View.GONE

            val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
            val price = service.price ?: 0.0
            priceText.text = "${formatter.format(price)} ₽"
            
            itemView.setOnClickListener {
                onItemClick(service)
            }
        }
    }

    // Sealed class для элементов списка
    sealed class AdapterItem {
        data class CategoryHeader(val category: String, val subcategory: String?) : AdapterItem()
        data class ServiceItem(val service: Service) : AdapterItem()
    }

    // Маппинг категорий на читаемые названия
    private fun getCategoryDisplayName(category: String): String {
        return when (category) {
            "ofd_keys" -> "Ключи ОФД"
            "licenses" -> "Лицензии и тарифы"
            "software" -> "Программное обеспечение"
            "kkt_services" -> "Услуги для ККТ и Автоматизации"
            "bitrix24" -> "CRM БИТРИКС24"
            "bitrix" -> "1С-Битрикс"
            "other" -> "Прочее"
            else -> category.replaceFirstChar { it.uppercase() }
        }
    }
}
