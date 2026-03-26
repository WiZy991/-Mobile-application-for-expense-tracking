package com.example.worldcashbox.ui.subscriptions

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.data.model.SubscriptionPlan
import com.example.worldcashbox.databinding.ItemSubscriptionBinding
import java.text.NumberFormat
import java.util.Locale

class SubscriptionsAdapter(
    private val onSubscribeClick: (SubscriptionPlan) -> Unit,
    private var balance: Double = 0.0
) : ListAdapter<SubscriptionPlan, SubscriptionsAdapter.PlanViewHolder>(
    PlanDiffCallback()
) {
    
    fun updateBalance(newBalance: Double) {
        balance = newBalance
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PlanViewHolder {
        val binding = ItemSubscriptionBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return PlanViewHolder(binding, onSubscribeClick)
    }

    override fun onBindViewHolder(holder: PlanViewHolder, position: Int) {
        holder.bind(getItem(position), balance)
    }

    class PlanViewHolder(
        private val binding: ItemSubscriptionBinding,
        private val onSubscribeClick: (SubscriptionPlan) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(plan: SubscriptionPlan, balance: Double) {
            binding.planNameTextView.text = plan.name
            binding.planDescriptionTextView.text = plan.description ?: ""
            
            val formatter = NumberFormat.getCurrencyInstance(Locale("ru", "RU"))
            binding.planPriceTextView.text = formatter.format(plan.price)
            
            binding.subscribeButton.isEnabled = balance >= plan.price
            binding.subscribeButton.text = if (balance < plan.price) "Недостаточно средств" else "Подписаться"
            binding.subscribeButton.setOnClickListener {
                onSubscribeClick(plan)
            }
        }
    }

    class PlanDiffCallback : DiffUtil.ItemCallback<SubscriptionPlan>() {
        override fun areItemsTheSame(oldItem: SubscriptionPlan, newItem: SubscriptionPlan): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: SubscriptionPlan, newItem: SubscriptionPlan): Boolean {
            return oldItem == newItem
        }
    }
}
