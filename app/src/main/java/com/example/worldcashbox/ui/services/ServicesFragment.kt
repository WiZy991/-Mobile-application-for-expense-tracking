package com.example.worldcashbox.ui.services

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Service
import com.example.worldcashbox.databinding.FragmentServicesBinding
import kotlinx.coroutines.launch

class ServicesFragment : Fragment() {
    private var _binding: FragmentServicesBinding? = null
    private val binding get() = _binding!!
    private val allServices = mutableListOf<Service>()
    private val filteredServices = mutableListOf<Service>()
    private lateinit var adapter: ServicesCategoryAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentServicesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRecycler()
        setupSearch()
        
        // Автоматически загружаем услуги при открытии вкладки
        if (savedInstanceState == null) {
            loadServices()
        }
    }

    private fun setupRecycler() {
        binding.servicesRecyclerView.layoutManager = LinearLayoutManager(requireContext())
        updateAdapter()
    }
    
    private fun updateAdapter() {
        android.util.Log.d("ServicesFragment", "updateAdapter: filteredServices.size = ${filteredServices.size}")
        adapter = ServicesCategoryAdapter(filteredServices) { service ->
            showCreateInvoiceDialog(service)
        }
        binding.servicesRecyclerView.adapter = adapter
        android.util.Log.d("ServicesFragment", "Адаптер обновлен, getItemCount = ${adapter.itemCount}")
    }

    private fun setupSearch() {
        binding.searchEditText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                filterServices(s?.toString() ?: "")
            }
        })
    }

    private fun showCreateInvoiceDialog(service: Service) {
        val dialog = CreateInvoiceDialogFragment.newInstance(service) { documentId ->
            android.util.Log.d("ServicesFragment", "Заявка отправлена, ID: $documentId")
        }
        dialog.show(parentFragmentManager, "CreateInvoiceDialog")
    }

    private fun loadServices() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                android.util.Log.d("ServicesFragment", "Загрузка услуг...")
                
                // Загружаем услуги из базы (backend автоматически синхронизирует если нужно)
                val response = RetrofitClient.apiService.getAvailableServices()
                
                android.util.Log.d("ServicesFragment", "Ответ получен: код ${response.code()}, успешно: ${response.isSuccessful}")
                
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    android.util.Log.d("ServicesFragment", "Получено услуг: ${body.services.size}")
                    
                    // Логируем первые несколько услуг для отладки
                    if (body.services.isNotEmpty()) {
                        val firstService = body.services[0]
                        android.util.Log.d("ServicesFragment", "Первая услуга: name='${firstService.name}', category='${firstService.category}', subcategory='${firstService.subcategory}', price=${firstService.price}")
                        if (body.services.size > 1) {
                            android.util.Log.d("ServicesFragment", "Вторая услуга: name='${body.services[1].name}', category='${body.services[1].category}'")
                        }
                    }
                    
                    allServices.clear()
                    allServices.addAll(body.services)
                    
                    android.util.Log.d("ServicesFragment", "allServices.size = ${allServices.size}")
                    
                    // Проверяем, что данные действительно добавлены
                    if (allServices.isEmpty()) {
                        android.util.Log.e("ServicesFragment", "ОШИБКА: allServices пуст после добавления!")
                    } else {
                        android.util.Log.d("ServicesFragment", "allServices[0] = ${allServices[0].name}")
                    }
                    
                    filterServices("")
                    
                    android.util.Log.d("ServicesFragment", "filteredServices.size = ${filteredServices.size}")
                    
                    if (filteredServices.isEmpty()) {
                        android.util.Log.w("ServicesFragment", "Список отфильтрованных услуг пуст")
                        binding.emptyContainer.visibility = View.VISIBLE
                        binding.servicesRecyclerView.visibility = View.GONE
                    } else {
                        android.util.Log.d("ServicesFragment", "Отображаем ${filteredServices.size} услуг, создаем адаптер...")
                        binding.emptyContainer.visibility = View.GONE
                        binding.servicesRecyclerView.visibility = View.VISIBLE
                    }
                } else {
                    val code = response.code()
                    val errorBody = response.errorBody()?.string()
                    android.util.Log.e("ServicesFragment", "Ошибка загрузки услуг: код $code, тело: $errorBody")
                    Toast.makeText(requireContext(), "Ошибка загрузки услуг (код $code)", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("ServicesFragment", "Ошибка загрузки услуг", e)
                e.printStackTrace()
                Toast.makeText(requireContext(), "Ошибка загрузки услуг: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }


    private fun filterServices(query: String) {
        filteredServices.clear()
        
        if (query.isBlank()) {
            filteredServices.addAll(allServices)
        } else {
            val lowerQuery = query.lowercase()
            filteredServices.addAll(
                allServices.filter { service ->
                    service.name.lowercase().contains(lowerQuery) ||
                    service.description?.lowercase()?.contains(lowerQuery) == true ||
                    service.category?.lowercase()?.contains(lowerQuery) == true ||
                    service.subcategory?.lowercase()?.contains(lowerQuery) == true
                }
            )
        }
        
        android.util.Log.d("ServicesFragment", "filterServices: query='$query', filtered=${filteredServices.size} из ${allServices.size}")
        
        // Пересоздаем адаптер с новыми данными
        updateAdapter()
        
        if (filteredServices.isEmpty() && query.isNotBlank()) {
            binding.emptyContainer.visibility = View.VISIBLE
            binding.servicesRecyclerView.visibility = View.GONE
        } else if (filteredServices.isEmpty()) {
            binding.emptyContainer.visibility = View.VISIBLE
            binding.servicesRecyclerView.visibility = View.GONE
        } else {
            binding.emptyContainer.visibility = View.GONE
            binding.servicesRecyclerView.visibility = View.VISIBLE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
