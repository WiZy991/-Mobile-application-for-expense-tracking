package com.example.worldcashbox.ui.engineer

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.data.model.Ticket
import com.example.worldcashbox.databinding.ItemEngineerTicketBinding
import java.text.SimpleDateFormat
import java.util.Locale

class EngineerTicketsAdapter(
    private val onTicketClick: (Ticket) -> Unit
) : ListAdapter<Ticket, EngineerTicketsAdapter.TicketViewHolder>(
    TicketDiffCallback()
) {

    fun updateTickets(tickets: List<Ticket>) {
        submitList(tickets)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TicketViewHolder {
        val binding = ItemEngineerTicketBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return TicketViewHolder(binding, onTicketClick)
    }

    override fun onBindViewHolder(holder: TicketViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class TicketViewHolder(
        private val binding: ItemEngineerTicketBinding,
        private val onTicketClick: (Ticket) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(ticket: Ticket) {
            binding.ticketSubjectTextView.text = ticket.subject
            binding.ticketDateTextView.text = formatDate(ticket.createdAt)
            
            // Имя клиента
            binding.clientNameTextView.text = ticket.clientName ?: "Клиент"
            
            // Статус
            binding.ticketStatusTextView.text = when (ticket.status) {
                "to_do" -> "К выполнению"
                "in_progress" -> "В работе"
                "in_review" -> "На проверке"
                "done" -> "Выполнено"
                "closed" -> "Закрыто"
                else -> ticket.status
            }
            
            // Цвет статуса
            val statusColor = when (ticket.status) {
                "to_do" -> binding.root.context.getColor(com.example.worldcashbox.R.color.warning)
                "in_progress" -> binding.root.context.getColor(com.example.worldcashbox.R.color.primary)
                "in_review" -> binding.root.context.getColor(com.example.worldcashbox.R.color.info)
                "done" -> binding.root.context.getColor(com.example.worldcashbox.R.color.success)
                "closed" -> binding.root.context.getColor(com.example.worldcashbox.R.color.text_muted)
                else -> binding.root.context.getColor(com.example.worldcashbox.R.color.text_muted)
            }
            binding.ticketStatusTextView.setTextColor(statusColor)
            
            // Приоритет
            binding.ticketPriorityIcon.text = when (ticket.priority) {
                "low" -> "🟢"
                "normal" -> "🟡"
                "high" -> "🟠"
                "urgent" -> "🔴"
                else -> "🟡"
            }
            
            binding.root.setOnClickListener {
                onTicketClick(ticket)
            }
        }

        private fun formatDate(dateString: String): String {
            return try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                val outputFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
                val date = inputFormat.parse(dateString)
                outputFormat.format(date ?: return dateString)
            } catch (e: Exception) {
                dateString
            }
        }
    }

    class TicketDiffCallback : DiffUtil.ItemCallback<Ticket>() {
        override fun areItemsTheSame(oldItem: Ticket, newItem: Ticket): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: Ticket, newItem: Ticket): Boolean {
            return oldItem == newItem
        }
    }
}
