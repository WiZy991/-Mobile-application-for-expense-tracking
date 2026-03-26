package com.example.worldcashbox.ui.employees

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.model.Store
import com.google.android.material.card.MaterialCardView

class StoresAdapter(
    private var stores: MutableList<Store>,
    private val onItemClick: (Store) -> Unit
) : RecyclerView.Adapter<StoresAdapter.StoreViewHolder>() {

    fun updateStores(newStores: List<Store>) {
        android.util.Log.d("StoresAdapter", "updateStores вызван с ${newStores.size} магазинами")
        stores.clear()
        stores.addAll(newStores)
        android.util.Log.d("StoresAdapter", "stores.size после обновления: ${stores.size}")
        notifyDataSetChanged()
        android.util.Log.d("StoresAdapter", "notifyDataSetChanged() вызван, itemCount: $itemCount")
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StoreViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_store, parent, false)
        return StoreViewHolder(view)
    }

    override fun onBindViewHolder(holder: StoreViewHolder, position: Int) {
        android.util.Log.d("StoresAdapter", "onBindViewHolder position=$position, stores.size=${stores.size}")
        if (position < stores.size) {
            val store = stores[position]
            android.util.Log.d("StoresAdapter", "Привязка магазина: id=${store.id}, name=${store.name}")
            holder.bind(store)
            holder.itemView.setOnClickListener { onItemClick(store) }
        } else {
            android.util.Log.e("StoresAdapter", "ОШИБКА: position $position >= stores.size ${stores.size}")
        }
    }

    override fun getItemCount() = stores.size

    class StoreViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val nameTextView: TextView = itemView.findViewById(R.id.nameTextView)
        private val addressTextView: TextView = itemView.findViewById(R.id.addressTextView)
        private val phoneTextView: TextView = itemView.findViewById(R.id.phoneTextView)
        private val cardView: MaterialCardView = itemView.findViewById(R.id.cardView)

        fun bind(store: Store) {
            nameTextView.text = store.name
            addressTextView.text = store.address
            val phoneContainer = itemView.findViewById<View>(R.id.phoneContainer)
            if (store.phone.isNullOrEmpty()) {
                phoneContainer?.visibility = View.GONE
            } else {
                phoneContainer?.visibility = View.VISIBLE
                phoneTextView.text = store.phone
            }
        }
    }
}
