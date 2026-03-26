package com.example.worldcashbox.ui.resources

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.databinding.ActivityFiscalStorageBinding
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class FiscalStorageActivity : AppCompatActivity() {
    private lateinit var binding: ActivityFiscalStorageBinding
    private lateinit var storageAdapter: FiscalStorageAdapter
    private var kktRegId: String? = null
    private var kktModel: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityFiscalStorageBinding.inflate(layoutInflater)
        setContentView(binding.root)

        kktRegId = intent.getStringExtra("kkt_reg_id")
        kktModel = intent.getStringExtra("kkt_model")

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Фискальные накопители"

        if (kktModel != null) {
            binding.kktModelText.text = "ККТ: $kktModel"
        }

        setupRecyclerView()
        setupSwipeRefresh()
        loadFiscalStorages()
    }

    private fun setupRecyclerView() {
        binding.storagesRecyclerView.layoutManager = LinearLayoutManager(this)
        storageAdapter = FiscalStorageAdapter(emptyList())
        binding.storagesRecyclerView.adapter = storageAdapter
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            loadFiscalStorages()
        }
    }

    private fun loadFiscalStorages() {
        if (kktRegId == null) {
            Toast.makeText(this, "Регистрационный номер ККТ не указан", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        lifecycleScope.launch {
            try {
                binding.swipeRefresh.isRefreshing = true
                val response = RetrofitClient.apiService.getFiscalStorages(regId = kktRegId!!)
                
                if (response.isSuccessful && response.body() != null) {
                    val storagesResponse = response.body()!!
                    val storages = storagesResponse.data
                    
                    if (!storagesResponse.success) {
                        val errMsg = storagesResponse.details?.takeIf { it.isNotBlank() }
                            ?: storagesResponse.error ?: "Нет доступа к данным ФН"
                        binding.emptyStoragesTextView.visibility = android.view.View.VISIBLE
                        binding.storagesRecyclerView.visibility = android.view.View.GONE
                        binding.emptyStoragesTextView.text = "ФН не найдены: $errMsg"
                    } else if (storages.isNullOrEmpty()) {
                        binding.emptyStoragesTextView.visibility = android.view.View.VISIBLE
                        binding.storagesRecyclerView.visibility = android.view.View.GONE
                        binding.emptyStoragesTextView.text = "Фискальные накопители не найдены"
                    } else {
                        binding.emptyStoragesTextView.visibility = android.view.View.GONE
                        binding.storagesRecyclerView.visibility = android.view.View.VISIBLE
                        storageAdapter = FiscalStorageAdapter(storages)
                        binding.storagesRecyclerView.adapter = storageAdapter
                    }
                } else {
                    Toast.makeText(this@FiscalStorageActivity, "Ошибка загрузки ФН: ${response.message()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("FiscalStorageActivity", "Ошибка загрузки ФН", e)
                Toast.makeText(this@FiscalStorageActivity, "Ошибка загрузки: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}
