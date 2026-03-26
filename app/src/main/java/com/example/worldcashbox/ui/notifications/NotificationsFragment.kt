package com.example.worldcashbox.ui.notifications

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Notification
import com.example.worldcashbox.databinding.FragmentNotificationsBinding
import com.example.worldcashbox.ui.support.ClientTicketDetailActivity
import kotlinx.coroutines.launch

class NotificationsFragment : Fragment() {
    private var _binding: FragmentNotificationsBinding? = null
    private val binding get() = _binding!!
    private lateinit var notificationsAdapter: NotificationsAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentNotificationsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecyclerView()
        loadNotifications()
    }

    override fun onResume() {
        super.onResume()
        loadNotifications()
    }

    private fun setupRecyclerView() {
        notificationsAdapter = NotificationsAdapter { notification ->
            onNotificationClick(notification)
        }
        binding.notificationsRecyclerView.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = notificationsAdapter
        }
    }

    private fun onNotificationClick(notification: Notification) {
        // Отмечаем как прочитанное
        if (!notification.isRead) {
            markAsRead(notification.id)
        }

        // Навигация по типу уведомления
        when (notification.relatedType) {
            "ticket" -> {
                if (notification.relatedId != null) {
                    val intent = Intent(requireContext(), ClientTicketDetailActivity::class.java)
                    intent.putExtra("ticketId", notification.relatedId)
                    startActivity(intent)
                }
            }
            // Можно добавить другие типы: "service", "subscription", etc.
            else -> {
                // Просто отмечаем как прочитанное
            }
        }
    }

    private fun markAsRead(notificationId: Int) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                RetrofitClient.apiService.markNotificationAsRead(notificationId)
                // Обновляем список
                loadNotifications()
            } catch (_: Exception) { }
        }
    }

    private fun loadNotifications() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getNotifications()
                if (response.isSuccessful && response.body() != null) {
                    val notifications = response.body()!!
                    if (notifications.isEmpty()) {
                        binding.notificationsRecyclerView.visibility = View.GONE
                        binding.emptyTextView.visibility = View.VISIBLE
                    } else {
                        binding.notificationsRecyclerView.visibility = View.VISIBLE
                        binding.emptyTextView.visibility = View.GONE
                        notificationsAdapter.submitList(notifications)
                    }
                } else {
                    binding.emptyTextView.visibility = View.VISIBLE
                    binding.emptyTextView.text = "Ошибка загрузки уведомлений"
                }
            } catch (e: Exception) {
                binding.emptyTextView.visibility = View.VISIBLE
                binding.emptyTextView.text = "Ошибка: ${e.message}"
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
