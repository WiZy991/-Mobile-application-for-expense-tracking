package com.example.worldcashbox.ui.notifications

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.model.Notification
import com.example.worldcashbox.databinding.ItemNotificationBinding
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class NotificationsAdapter(
    private val onNotificationClick: (Notification) -> Unit
) : ListAdapter<Notification, NotificationsAdapter.ViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemNotificationBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ViewHolder(
        private val binding: ItemNotificationBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(notification: Notification) {
            binding.notificationTitle.text = notification.title
            binding.notificationMessage.text = notification.message
            binding.notificationTime.text = formatTime(notification.createdAt)

            // Индикатор непрочитанного
            binding.unreadIndicator.visibility = if (!notification.isRead) View.VISIBLE else View.INVISIBLE

            // Стрелка для кликабельных уведомлений (с привязкой к тикету/сервису)
            if (notification.relatedId != null && notification.relatedType != null) {
                binding.arrowIcon.visibility = View.VISIBLE
            } else {
                binding.arrowIcon.visibility = View.GONE
            }

            binding.root.setOnClickListener {
                onNotificationClick(notification)
            }
        }

        private fun formatTime(dateStr: String): String {
            return try {
                // Пробуем разные форматы даты
                val formats = listOf(
                    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                    "yyyy-MM-dd'T'HH:mm:ss'Z'",
                    "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
                    "yyyy-MM-dd HH:mm:ss"
                )
                var date: java.util.Date? = null
                for (format in formats) {
                    try {
                        val sdf = SimpleDateFormat(format, Locale("ru", "RU"))
                        sdf.timeZone = TimeZone.getTimeZone("UTC")
                        date = sdf.parse(dateStr)
                        if (date != null) break
                    } catch (_: Exception) { }
                }
                if (date != null) {
                    val outputFormat = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale("ru", "RU"))
                    outputFormat.timeZone = TimeZone.getDefault()
                    outputFormat.format(date)
                } else {
                    dateStr
                }
            } catch (_: Exception) {
                dateStr
            }
        }
    }

    class DiffCallback : DiffUtil.ItemCallback<Notification>() {
        override fun areItemsTheSame(oldItem: Notification, newItem: Notification): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: Notification, newItem: Notification): Boolean {
            return oldItem == newItem
        }
    }
}
