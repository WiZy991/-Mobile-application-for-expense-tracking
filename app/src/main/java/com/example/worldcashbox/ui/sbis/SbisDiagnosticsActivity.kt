package com.example.worldcashbox.ui.sbis

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.databinding.ActivitySbisDiagnosticsBinding
import kotlinx.coroutines.launch

class SbisDiagnosticsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySbisDiagnosticsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySbisDiagnosticsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupListeners()
        runDiagnostics()
    }

    private fun setupListeners() {
        binding.refreshButton.setOnClickListener {
            runDiagnostics()
        }
    }

    private fun runDiagnostics() {
        lifecycleScope.launch {
            try {
                binding.progressBar.visibility = View.VISIBLE
                binding.diagnosticsText.text = "Проверка подключения..."
                
                // Проверяем статус СБИС
                val statusResponse = RetrofitClient.apiService.getSbisStatus()
                if (statusResponse.isSuccessful && statusResponse.body() != null) {
                    val status = statusResponse.body()!!
                    val isConnected = status.connected ?: false
                    
                    if (isConnected) {
                        binding.diagnosticsText.text = "✓ СБИС подключен\n\nДоступные методы API:\n• Получение данных клиента\n• Синхронизация счетов\n• Получение услуг\n• Получение ресурсов"
                    } else {
                        binding.diagnosticsText.text = "✗ СБИС не подключен\n\nДля подключения:\n1. Проверьте настройки в профиле\n2. Убедитесь, что данные СБИС корректны\n3. Попробуйте синхронизировать данные"
                    }
                } else {
                    binding.diagnosticsText.text = "✗ Ошибка проверки статуса СБИС\n\nПроверьте:\n1. Запущен ли сервер\n2. Правильность URL API\n3. Подключение к сети"
                }
            } catch (e: Exception) {
                android.util.Log.e("SbisDiagnostics", "Error running diagnostics", e)
                binding.diagnosticsText.text = "✗ Ошибка: ${e.message}\n\nПроверьте подключение к серверу"
            } finally {
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}
