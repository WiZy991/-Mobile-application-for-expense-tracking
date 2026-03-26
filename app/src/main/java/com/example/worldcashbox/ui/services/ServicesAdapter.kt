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

class ServicesAdapter(
    private val items: List<Service>,
    private val onItemClick: (Service) -> Unit
) : RecyclerView.Adapter<ServicesAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val nameText: TextView = view.findViewById(R.id.serviceNameTextView)
        val descriptionText: TextView = view.findViewById(R.id.serviceDescriptionTextView)
        val priceText: TextView = view.findViewById(R.id.servicePriceTextView)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_service_catalog, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val service = items[position]

        holder.nameText.text = service.name
        holder.descriptionText.text = service.description ?: ""
        holder.descriptionText.visibility =
            if (service.description.isNullOrBlank()) View.GONE else View.VISIBLE

        val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
        val price = service.price ?: 0.0
        holder.priceText.text = "${formatter.format(price)} ₽"
        
        holder.itemView.setOnClickListener {
            onItemClick(service)
        }
    }

    override fun getItemCount(): Int = items.size
}

