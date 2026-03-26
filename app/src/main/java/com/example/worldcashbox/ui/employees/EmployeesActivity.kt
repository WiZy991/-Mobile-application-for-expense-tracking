package com.example.worldcashbox.ui.employees

import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.*
import com.example.worldcashbox.databinding.ActivityEmployeesBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class EmployeesActivity : AppCompatActivity() {
    private lateinit var binding: ActivityEmployeesBinding
    private lateinit var storesAdapter: StoresAdapter
    private lateinit var employeesAdapter: EmployeesAdapter
    private var stores: MutableList<Store> = mutableListOf()
    private var employees: MutableList<Employee> = mutableListOf()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        try {
            // Инициализируем RetrofitClient
            RetrofitClient.initialize(this)
            
            binding = ActivityEmployeesBinding.inflate(layoutInflater)
            setContentView(binding.root)

            setSupportActionBar(binding.toolbar)
            supportActionBar?.setDisplayHomeAsUpEnabled(true)
            supportActionBar?.title = "Сотрудники и магазины"

            setupRecyclerViews()
            setupTabs()
            // Убеждаемся, что контейнер магазинов виден по умолчанию
            binding.storesContainer.visibility = android.view.View.VISIBLE
            binding.employeesContainer.visibility = android.view.View.GONE
            loadData()
        } catch (e: Exception) {
            android.util.Log.e("Employees", "Ошибка инициализации EmployeesActivity", e)
            e.printStackTrace()
            Toast.makeText(this, "Ошибка загрузки: ${e.message}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun setupRecyclerViews() {
        storesAdapter = StoresAdapter(stores) { store ->
            showEditStoreDialog(store)
        }
        binding.storesRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.storesRecyclerView.adapter = storesAdapter
        binding.storesRecyclerView.setHasFixedSize(false)
        binding.storesRecyclerView.isNestedScrollingEnabled = false
        android.util.Log.d("Employees", "Stores RecyclerView настроен, adapter: ${storesAdapter.itemCount}")

        employeesAdapter = EmployeesAdapter(employees, stores) { employee ->
            showEditEmployeeDialog(employee)
        }
        binding.employeesRecyclerView.layoutManager = LinearLayoutManager(this)
        binding.employeesRecyclerView.adapter = employeesAdapter
        binding.employeesRecyclerView.setHasFixedSize(false)
        binding.employeesRecyclerView.isNestedScrollingEnabled = false
        android.util.Log.d("Employees", "Employees RecyclerView настроен, adapter: ${employeesAdapter.itemCount}")
    }

    private fun setupTabs() {
        binding.tabLayout.addTab(binding.tabLayout.newTab().setText("Магазины"))
        binding.tabLayout.addTab(binding.tabLayout.newTab().setText("Сотрудники"))

        binding.tabLayout.addOnTabSelectedListener(object : com.google.android.material.tabs.TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: com.google.android.material.tabs.TabLayout.Tab?) {
                when (tab?.position) {
                    0 -> {
                        binding.storesContainer.visibility = android.view.View.VISIBLE
                        binding.employeesContainer.visibility = android.view.View.GONE
                        invalidateOptionsMenu() // Обновляем меню
                    }
                    1 -> {
                        binding.storesContainer.visibility = android.view.View.GONE
                        binding.employeesContainer.visibility = android.view.View.VISIBLE
                        invalidateOptionsMenu() // Обновляем меню
                    }
                }
            }

            override fun onTabUnselected(tab: com.google.android.material.tabs.TabLayout.Tab?) {}
            override fun onTabReselected(tab: com.google.android.material.tabs.TabLayout.Tab?) {}
        })
    }

    private fun loadData() {
        lifecycleScope.launch {
            try {
                binding.swipeRefresh.isRefreshing = true

                // Загружаем магазины
                val storesResponse = RetrofitClient.apiService.getStores()
                android.util.Log.d("Employees", "Stores response code: ${storesResponse.code()}")
                
                if (storesResponse.isSuccessful && storesResponse.body() != null) {
                    val responseBody = storesResponse.body()!!
                    android.util.Log.d("Employees", "Stores response body: $responseBody")
                    android.util.Log.d("Employees", "Stores response body type: ${responseBody::class.java.simpleName}")
                    
                    val storesList = responseBody.stores
                    android.util.Log.d("Employees", "Loaded ${storesList.size} stores from API")
                    
                    if (storesList.isNotEmpty()) {
                        for ((index, store) in storesList.withIndex()) {
                            android.util.Log.d("Employees", "Store $index: id=${store.id}, name=${store.name}, address=${store.address}, clientId=${store.clientId}")
                        }
                    } else {
                        android.util.Log.w("Employees", "⚠️  API вернул пустой список магазинов!")
                    }
                    
                    // Обновляем список на главном потоке
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                        try {
                            android.util.Log.d("Employees", "Обновление списка магазинов на UI потоке...")
                            android.util.Log.d("Employees", "  - storesList.size: ${storesList.size}")
                            
                            // Обновляем локальный список
                            stores.clear()
                            stores.addAll(storesList)
                            
                            // Обновляем список через метод адаптера
                            storesAdapter.updateStores(storesList)
                            // Обновляем список магазинов в адаптере сотрудников тоже
                            employeesAdapter.updateStores(storesList)
                            
                            android.util.Log.d("Employees", "  - stores.size после addAll: ${stores.size}")
                            android.util.Log.d("Employees", "  - adapter.itemCount: ${storesAdapter.itemCount}")
                            
                            // ПРИНУДИТЕЛЬНО обновляем состояние пустого списка
                            if (stores.isEmpty()) {
                                binding.emptyStoresTextView.visibility = android.view.View.VISIBLE
                                binding.storesRecyclerView.visibility = android.view.View.GONE
                                android.util.Log.d("Employees", "  - Список пуст, показываем emptyStoresTextView")
                            } else {
                                binding.emptyStoresTextView.visibility = android.view.View.GONE
                                binding.storesRecyclerView.visibility = android.view.View.VISIBLE
                                android.util.Log.d("Employees", "  - Список не пуст (${stores.size} магазинов), показываем storesRecyclerView")
                            }
                            
                            // ПРИНУДИТЕЛЬНО обновляем видимость контейнера
                            binding.storesContainer.visibility = android.view.View.VISIBLE
                            
                            // ПРИНУДИТЕЛЬНО обновляем RecyclerView
                            binding.storesRecyclerView.invalidate()
                            binding.storesRecyclerView.requestLayout()
                            
                            // Принудительно обновляем адаптер еще раз
                            storesAdapter.notifyDataSetChanged()
                            
                            android.util.Log.d("Employees", "RecyclerView обновлен:")
                            android.util.Log.d("Employees", "  - adapter.itemCount: ${storesAdapter.itemCount}")
                            android.util.Log.d("Employees", "  - stores.size: ${stores.size}")
                            android.util.Log.d("Employees", "  - emptyStoresTextView.visibility: ${if (binding.emptyStoresTextView.visibility == android.view.View.VISIBLE) "VISIBLE" else "GONE"}")
                            android.util.Log.d("Employees", "  - storesRecyclerView.visibility: ${if (binding.storesRecyclerView.visibility == android.view.View.VISIBLE) "VISIBLE" else "GONE"}")
                            android.util.Log.d("Employees", "  - storesContainer.visibility: ${if (binding.storesContainer.visibility == android.view.View.VISIBLE) "VISIBLE" else "GONE"}")
                        } catch (e: Exception) {
                            android.util.Log.e("Employees", "Ошибка обновления UI магазинов", e)
                            e.printStackTrace()
                        }
                    }
                } else {
                    val errorBody = storesResponse.errorBody()?.string()
                    android.util.Log.e("Employees", "Failed to load stores: ${storesResponse.code()}, $errorBody")
                    Toast.makeText(this@EmployeesActivity, "Ошибка загрузки магазинов: ${errorBody ?: storesResponse.message()}", Toast.LENGTH_LONG).show()
                }

                // Загружаем сотрудников
                val employeesResponse = RetrofitClient.apiService.getEmployees()
                android.util.Log.d("Employees", "Employees response code: ${employeesResponse.code()}")
                
                if (employeesResponse.isSuccessful && employeesResponse.body() != null) {
                    val responseBody = employeesResponse.body()!!
                    android.util.Log.d("Employees", "Employees response body: $responseBody")
                    
                    val employeesList = responseBody.employees
                    android.util.Log.d("Employees", "Loaded ${employeesList.size} employees from API")
                    
                    if (employeesList.isNotEmpty()) {
                        for ((index, employee) in employeesList.withIndex()) {
                            android.util.Log.d("Employees", "Employee $index: id=${employee.id}, phone=${employee.phone}, name=${employee.name}, storeId=${employee.storeId}")
                        }
                    } else {
                        android.util.Log.w("Employees", "⚠️  API вернул пустой список сотрудников!")
                    }
                    
                    // Обновляем список на главном потоке
                    binding.employeesRecyclerView.post {
                        try {
                            android.util.Log.d("Employees", "Обновление списка сотрудников на UI потоке...")
                            android.util.Log.d("Employees", "  - employeesList.size: ${employeesList.size}")
                            
                            // Обновляем список через метод адаптера
                            employeesAdapter.updateEmployees(employeesList)
                            employeesAdapter.updateStores(stores) // Обновляем список магазинов в адаптере
                            employees.clear()
                            employees.addAll(employeesList)
                            android.util.Log.d("Employees", "  - employees.size после addAll: ${employees.size}")
                            android.util.Log.d("Employees", "  - notifyDataSetChanged() вызван через updateEmployees, itemCount: ${employeesAdapter.itemCount}")
                            
                            // ПРИНУДИТЕЛЬНО обновляем состояние пустого списка
                            if (employees.isEmpty()) {
                                binding.emptyEmployeesTextView.visibility = android.view.View.VISIBLE
                                binding.employeesRecyclerView.visibility = android.view.View.GONE
                                android.util.Log.d("Employees", "  - Список пуст, показываем emptyEmployeesTextView")
                            } else {
                                binding.emptyEmployeesTextView.visibility = android.view.View.GONE
                                binding.employeesRecyclerView.visibility = android.view.View.VISIBLE
                                android.util.Log.d("Employees", "  - Список не пуст (${employees.size} сотрудников), показываем employeesRecyclerView")
                            }
                            
                            // ПРИНУДИТЕЛЬНО обновляем RecyclerView
                            binding.employeesRecyclerView.invalidate()
                            binding.employeesRecyclerView.requestLayout()
                            
                            // ПРИНУДИТЕЛЬНО обновляем видимость контейнера
                            binding.employeesContainer.visibility = android.view.View.VISIBLE
                            
                            android.util.Log.d("Employees", "RecyclerView обновлен:")
                            android.util.Log.d("Employees", "  - adapter.itemCount: ${employeesAdapter.itemCount}")
                            android.util.Log.d("Employees", "  - employees.size: ${employees.size}")
                            android.util.Log.d("Employees", "  - emptyEmployeesTextView.visibility: ${if (binding.emptyEmployeesTextView.visibility == android.view.View.VISIBLE) "VISIBLE" else "GONE"}")
                            android.util.Log.d("Employees", "  - employeesRecyclerView.visibility: ${if (binding.employeesRecyclerView.visibility == android.view.View.VISIBLE) "VISIBLE" else "GONE"}")
                            android.util.Log.d("Employees", "  - employeesContainer.visibility: ${if (binding.employeesContainer.visibility == android.view.View.VISIBLE) "VISIBLE" else "GONE"}")
                        } catch (e: Exception) {
                            android.util.Log.e("Employees", "Ошибка обновления UI сотрудников", e)
                            e.printStackTrace()
                        }
                    }
                } else {
                    val errorBody = employeesResponse.errorBody()?.string()
                    android.util.Log.e("Employees", "Failed to load employees: ${employeesResponse.code()}, $errorBody")
                    Toast.makeText(this@EmployeesActivity, "Ошибка загрузки сотрудников: ${errorBody ?: employeesResponse.message()}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("Employees", "Ошибка загрузки данных", e)
                e.printStackTrace()
                Toast.makeText(this@EmployeesActivity, "Ошибка загрузки: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun updateStoresEmptyState() {
        if (stores.isEmpty()) {
            binding.emptyStoresTextView.visibility = android.view.View.VISIBLE
            binding.storesRecyclerView.visibility = android.view.View.GONE
        } else {
            binding.emptyStoresTextView.visibility = android.view.View.GONE
            binding.storesRecyclerView.visibility = android.view.View.VISIBLE
        }
    }

    private fun updateEmployeesEmptyState() {
        if (employees.isEmpty()) {
            binding.emptyEmployeesTextView.visibility = android.view.View.VISIBLE
            binding.employeesRecyclerView.visibility = android.view.View.GONE
        } else {
            binding.emptyEmployeesTextView.visibility = android.view.View.GONE
            binding.employeesRecyclerView.visibility = android.view.View.VISIBLE
        }
    }

    private fun showAddStoreDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_store, null)
        val nameEditText = dialogView.findViewById<TextInputEditText>(R.id.nameEditText)
        val addressEditText = dialogView.findViewById<TextInputEditText>(R.id.addressEditText)
        val phoneEditText = dialogView.findViewById<TextInputEditText>(R.id.phoneEditText)

        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Добавить магазин")
            .setView(dialogView)
            .setPositiveButton("Добавить", null) // Устанавливаем null, чтобы обработать клик после показа диалога
            .setNegativeButton("Отмена", null)
            .create()
        
        dialog.setOnShowListener {
            val positiveButton = dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE)
            positiveButton.setOnClickListener {
                val name = nameEditText.text?.toString()?.trim()
                val address = addressEditText.text?.toString()?.trim()
                val phone = phoneEditText.text?.toString()?.trim()

                if (name.isNullOrEmpty() || address.isNullOrEmpty()) {
                    Toast.makeText(this, "Заполните название и адрес", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                dialog.dismiss()
                addStore(AddStoreRequest(name, address, phone?.takeIf { it.isNotEmpty() }))
            }
        }
        
        dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        dialog.show()
    }

    private fun showEditStoreDialog(store: Store) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_store, null)
        val nameEditText = dialogView.findViewById<TextInputEditText>(R.id.nameEditText)
        val addressEditText = dialogView.findViewById<TextInputEditText>(R.id.addressEditText)
        val phoneEditText = dialogView.findViewById<TextInputEditText>(R.id.phoneEditText)

        nameEditText.setText(store.name)
        addressEditText.setText(store.address)
        phoneEditText.setText(store.phone ?: "")

        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Редактировать магазин")
            .setView(dialogView)
            .setPositiveButton("Сохранить", null) // Устанавливаем null, чтобы обработать клик после показа диалога
            .setNeutralButton("Удалить") { _, _ ->
                deleteStore(store.id)
            }
            .setNegativeButton("Отмена", null)
            .create()
        
        dialog.setOnShowListener {
            val positiveButton = dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE)
            positiveButton.setOnClickListener {
                val name = nameEditText.text?.toString()?.trim()
                val address = addressEditText.text?.toString()?.trim()
                val phone = phoneEditText.text?.toString()?.trim()

                if (name.isNullOrEmpty() || address.isNullOrEmpty()) {
                    Toast.makeText(this, "Заполните название и адрес", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                dialog.dismiss()
                updateStore(store.id, UpdateStoreRequest(name, address, phone?.takeIf { it.isNotEmpty() }))
            }
        }
        
        dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        dialog.show()
    }

    private fun showAddEmployeeDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_employee, null)
        val phoneEditText = dialogView.findViewById<TextInputEditText>(R.id.phoneEditText)
        val nameEditText = dialogView.findViewById<TextInputEditText>(R.id.nameEditText)
        val storeSpinner = dialogView.findViewById<android.widget.Spinner>(R.id.storeSpinner)

        // Заполняем спиннер магазинов
        val storeNames = mutableListOf<String>("Без привязки к магазину")
        storeNames.addAll(stores.map { it.name })
        val adapter = android.widget.ArrayAdapter(this, android.R.layout.simple_spinner_item, storeNames)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        storeSpinner.adapter = adapter

        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Добавить сотрудника")
            .setView(dialogView)
            .setPositiveButton("Добавить", null) // Устанавливаем null, чтобы обработать клик после показа диалога
            .setNegativeButton("Отмена", null)
            .create()
        
        dialog.setOnShowListener {
            val positiveButton = dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE)
            positiveButton.setOnClickListener {
                val phone = phoneEditText.text?.toString()?.trim()
                val name = nameEditText.text?.toString()?.trim()

                if (phone.isNullOrEmpty()) {
                    Toast.makeText(this, "Введите номер телефона", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                val selectedStoreIndex = storeSpinner.selectedItemPosition
                val storeId = if (selectedStoreIndex > 0) stores[selectedStoreIndex - 1].id else null

                dialog.dismiss()
                addEmployee(AddEmployeeRequest(phone, name?.takeIf { it.isNotEmpty() }, storeId))
            }
        }
        
        dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        dialog.show()
    }

    private fun showEditEmployeeDialog(employee: Employee) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_employee, null)
        val phoneEditText = dialogView.findViewById<TextInputEditText>(R.id.phoneEditText)
        val nameEditText = dialogView.findViewById<TextInputEditText>(R.id.nameEditText)
        val storeSpinner = dialogView.findViewById<android.widget.Spinner>(R.id.storeSpinner)

        phoneEditText.setText(employee.phone)
        phoneEditText.isEnabled = false // Телефон нельзя менять
        nameEditText.setText(employee.name ?: "")

        // Заполняем спиннер магазинов
        val storeNames = mutableListOf<String>("Без привязки к магазину")
        storeNames.addAll(stores.map { it.name })
        val adapter = android.widget.ArrayAdapter(this, android.R.layout.simple_spinner_item, storeNames)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        storeSpinner.adapter = adapter

        // Выбираем текущий магазин
        val currentStoreIndex = if (employee.storeId != null) {
            stores.indexOfFirst { it.id == employee.storeId } + 1
        } else {
            0
        }
        storeSpinner.setSelection(currentStoreIndex)

        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Редактировать сотрудника")
            .setView(dialogView)
            .setPositiveButton("Сохранить", null) // Устанавливаем null, чтобы обработать клик после показа диалога
            .setNeutralButton("Удалить") { _, _ ->
                deleteEmployee(employee.id)
            }
            .setNegativeButton("Отмена", null)
            .create()
        
        dialog.setOnShowListener {
            val positiveButton = dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE)
            positiveButton.setOnClickListener {
                val name = nameEditText.text?.toString()?.trim()
                val selectedStoreIndex = storeSpinner.selectedItemPosition
                val storeId = if (selectedStoreIndex > 0) stores[selectedStoreIndex - 1].id else null

                dialog.dismiss()
                updateEmployee(employee.id, UpdateEmployeeRequest(name?.takeIf { it.isNotEmpty() }, storeId))
            }
        }
        
        dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        dialog.show()
    }

    private fun addStore(request: AddStoreRequest) {
        lifecycleScope.launch {
            try {
                android.util.Log.d("Employees", "Adding store: $request")
                val response = RetrofitClient.apiService.createStore(request)
                android.util.Log.d("Employees", "Create store response code: ${response.code()}")
                android.util.Log.d("Employees", "Create store response body: ${response.body()}")
                
                if (response.isSuccessful && response.body() != null) {
                    val responseBody = response.body()!!
                    val createdStore = responseBody.store
                    android.util.Log.d("Employees", "Created store: id=${createdStore.id}, name=${createdStore.name}, address=${createdStore.address}, clientId=${createdStore.clientId}")
                    
                    Toast.makeText(this@EmployeesActivity, "Магазин добавлен", Toast.LENGTH_SHORT).show()
                    
                    // Перезагружаем данные с сервера (не добавляем локально, чтобы избежать рассинхронизации)
                    kotlinx.coroutines.delay(500)
                    loadData()
                } else {
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("Employees", "Failed to create store: ${response.code()}, $errorBody")
                    Toast.makeText(this@EmployeesActivity, "Ошибка добавления магазина: ${errorBody ?: response.message()}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("Employees", "Ошибка добавления магазина", e)
                e.printStackTrace()
                Toast.makeText(this@EmployeesActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateStore(id: Int, request: UpdateStoreRequest) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.updateStore(id, request)
                if (response.isSuccessful && response.body() != null) {
                    Toast.makeText(this@EmployeesActivity, "Магазин обновлен", Toast.LENGTH_SHORT).show()
                    loadData()
                } else {
                    Toast.makeText(this@EmployeesActivity, "Ошибка обновления магазина", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("Employees", "Ошибка обновления магазина", e)
                Toast.makeText(this@EmployeesActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun deleteStore(id: Int) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Удалить магазин?")
            .setMessage("Все сотрудники этого магазина будут отвязаны")
            .setPositiveButton("Удалить") { _, _ ->
                lifecycleScope.launch {
                    try {
                        val response = RetrofitClient.apiService.deleteStore(id)
                        if (response.isSuccessful) {
                            Toast.makeText(this@EmployeesActivity, "Магазин удален", Toast.LENGTH_SHORT).show()
                            loadData()
                        } else {
                            Toast.makeText(this@EmployeesActivity, "Ошибка удаления магазина", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("Employees", "Ошибка удаления магазина", e)
                        Toast.makeText(this@EmployeesActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun addEmployee(request: AddEmployeeRequest) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.addEmployee(request)
                if (response.isSuccessful && response.body() != null) {
                    Toast.makeText(this@EmployeesActivity, "Сотрудник добавлен", Toast.LENGTH_SHORT).show()
                    loadData()
                } else {
                    val errorMsg = response.errorBody()?.string() ?: "Ошибка добавления сотрудника"
                    Toast.makeText(this@EmployeesActivity, errorMsg, Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("Employees", "Ошибка добавления сотрудника", e)
                Toast.makeText(this@EmployeesActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateEmployee(id: Int, request: UpdateEmployeeRequest) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.updateEmployee(id, request)
                if (response.isSuccessful && response.body() != null) {
                    Toast.makeText(this@EmployeesActivity, "Сотрудник обновлен", Toast.LENGTH_SHORT).show()
                    loadData()
                } else {
                    Toast.makeText(this@EmployeesActivity, "Ошибка обновления сотрудника", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("Employees", "Ошибка обновления сотрудника", e)
                Toast.makeText(this@EmployeesActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun deleteEmployee(id: Int) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Удалить сотрудника?")
            .setMessage("Сотрудник потеряет доступ к приложению")
            .setPositiveButton("Удалить") { _, _ ->
                lifecycleScope.launch {
                    try {
                        val response = RetrofitClient.apiService.deleteEmployee(id)
                        if (response.isSuccessful) {
                            Toast.makeText(this@EmployeesActivity, "Сотрудник удален", Toast.LENGTH_SHORT).show()
                            loadData()
                        } else {
                            Toast.makeText(this@EmployeesActivity, "Ошибка удаления сотрудника", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("Employees", "Ошибка удаления сотрудника", e)
                        Toast.makeText(this@EmployeesActivity, "Ошибка: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_employees, menu)
        
        // Показываем только одну кнопку в зависимости от выбранной вкладки
        val selectedTab = binding.tabLayout.selectedTabPosition
        val addStoreItem = menu.findItem(R.id.action_add_store)
        val addEmployeeItem = menu.findItem(R.id.action_add_employee)
        
        when (selectedTab) {
            0 -> { // Магазины
                addStoreItem?.isVisible = true
                addEmployeeItem?.isVisible = false
            }
            1 -> { // Сотрудники
                addStoreItem?.isVisible = false
                addEmployeeItem?.isVisible = true
            }
        }
        
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                finish()
                true
            }
            R.id.action_add_store -> {
                showAddStoreDialog()
                true
            }
            R.id.action_add_employee -> {
                showAddEmployeeDialog()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}
