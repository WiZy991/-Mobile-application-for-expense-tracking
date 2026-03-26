package com.example.worldcashbox.ui.services

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.R
import com.example.worldcashbox.data.api.ApiConfig
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.Service
import com.example.worldcashbox.data.model.CreateCRMLeadRequest
import com.example.worldcashbox.databinding.DialogCreateInvoiceBinding
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import kotlinx.coroutines.launch

class CreateInvoiceDialogFragment : BottomSheetDialogFragment() {
    private var _binding: DialogCreateInvoiceBinding? = null
    private val binding get() = _binding!!
    
    private var service: Service? = null
    private var onInvoiceCreated: ((String) -> Unit)? = null
    private var invoiceUrl: String? = null
    private var fullDescription: String = ""
    private var shortDescription: String = ""
    private var isDescriptionExpanded: Boolean = false
    
    companion object {
        private const val ARG_SERVICE = "service"
        
        fun newInstance(service: Service, onRequestCreated: ((String) -> Unit)? = null): CreateInvoiceDialogFragment {
            val fragment = CreateInvoiceDialogFragment()
            val args = Bundle()
            args.putSerializable(ARG_SERVICE, service)
            fragment.arguments = args
            fragment.onInvoiceCreated = onRequestCreated
            return fragment
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        service = arguments?.getSerializable(ARG_SERVICE) as? Service
    }
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = DialogCreateInvoiceBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        service?.let { s ->
            binding.serviceNameText.text = "Услуга: ${s.name}"
            
            // Показываем описание услуги, если оно есть (убираем HTML теги)
            if (!s.description.isNullOrBlank()) {
                var description = s.description!!
                
                // Убираем HTML теги
                description = description
                    .replace(Regex("<[^>]+>"), "") // Удаляем все HTML теги
                    .replace("&nbsp;", " ")
                    .replace("&amp;", "&")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&quot;", "\"")
                    .replace("&#39;", "'")
                    .trim()
                
                // Сохраняем полное описание
                fullDescription = description
                
                // Краткое описание (первые 150 символов)
                val shortLength = 150
                shortDescription = if (description.length > shortLength) {
                    description.substring(0, shortLength).trim() + "..."
                } else {
                    description
                }
                
                // Показываем краткое описание по умолчанию
                binding.serviceDescriptionText.text = shortDescription
                binding.serviceDescriptionText.visibility = View.VISIBLE
                
                // Показываем кнопку развернуть/свернуть только если описание длинное
                if (description.length > shortLength) {
                    binding.descriptionContainer.visibility = View.VISIBLE
                    binding.expandDescriptionButton.visibility = View.VISIBLE
                    isDescriptionExpanded = false
                    
                    // Обработчик клика на кнопку развернуть/свернуть
                    binding.expandDescriptionButton.setOnClickListener {
                        isDescriptionExpanded = !isDescriptionExpanded
                        if (isDescriptionExpanded) {
                            binding.serviceDescriptionText.text = fullDescription
                            binding.expandDescriptionButton.setImageResource(android.R.drawable.arrow_up_float)
                            binding.expandDescriptionButton.contentDescription = "Свернуть описание"
                        } else {
                            binding.serviceDescriptionText.text = shortDescription
                            binding.expandDescriptionButton.setImageResource(android.R.drawable.arrow_down_float)
                            binding.expandDescriptionButton.contentDescription = "Развернуть описание"
                        }
                    }
                } else {
                    binding.descriptionContainer.visibility = View.VISIBLE
                    binding.expandDescriptionButton.visibility = View.GONE
                }
            } else {
                binding.descriptionContainer.visibility = View.GONE
            }
            
            // Устанавливаем цену по умолчанию (только для чтения)
            val basePrice = s.price ?: 0.0
            binding.priceEditText.setText(java.text.NumberFormat.getNumberInstance(java.util.Locale("ru", "RU")).format(basePrice))
            
            // Устанавливаем количество по умолчанию
            binding.countEditText.setText("1")
            
            // Обновляем общую сумму при изменении количества
            binding.countEditText.addTextChangedListener(object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: android.text.Editable?) {
                    updateTotalPrice(basePrice)
                }
            })
            
            // Обновляем общую сумму при первом отображении
            updateTotalPrice(basePrice)
        }
        
        binding.cancelButton.setOnClickListener {
            dismiss()
        }
        
        binding.createButton.setOnClickListener {
            createInvoice()
        }
        
        binding.downloadInvoiceButton.setOnClickListener {
            invoiceUrl?.let { url ->
                downloadInvoice(url)
            }
        }
    }
    
    private fun updateTotalPrice(basePrice: Double) {
        val countText = binding.countEditText.text?.toString()?.trim()
        val count = countText?.toIntOrNull() ?: 1
        
        if (count > 0) {
            val totalPrice = basePrice * count
            val formatter = java.text.NumberFormat.getNumberInstance(java.util.Locale("ru", "RU"))
            binding.totalPriceText.text = "Итого: ${formatter.format(totalPrice)} ₽"
        } else {
            binding.totalPriceText.text = "Итого: 0 ₽"
        }
    }
    
    private fun createInvoice() {
        val service = this.service ?: return
        
        val countText = binding.countEditText.text?.toString()?.trim()
        val notes = binding.notesEditText.text?.toString()?.trim()
        
        // Используем базовую цену услуги (пользователь не может её менять)
        val basePrice = service.price ?: 0.0
        
        if (countText.isNullOrEmpty()) {
            Toast.makeText(requireContext(), "Введите количество", Toast.LENGTH_SHORT).show()
            return
        }
        
        val count = countText.toIntOrNull()
        
        if (count == null || count <= 0) {
            Toast.makeText(requireContext(), "Введите корректное количество", Toast.LENGTH_SHORT).show()
            return
        }
        
        if (basePrice <= 0) {
            Toast.makeText(requireContext(), "Цена услуги не указана", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Код услуги - используем id или serviceId
        val serviceCode = service.serviceId?.toString() ?: service.id.toString()
        
        binding.createButton.isEnabled = false
        binding.createButton.text = "Отправка..."
        
        lifecycleScope.launch {
            try {
                val request = CreateCRMLeadRequest(
                    serviceName = service.name,
                    serviceCode = serviceCode,
                    price = basePrice, // Используем базовую цену услуги
                    count = count,
                    notes = notes
                )
                val response = RetrofitClient.apiService.createCRMLead(request)
                
                if (response.isSuccessful && response.body()?.success == true) {
                    val documentId = response.body()?.data?.documentId
                    val message = response.body()?.message ?: "Заявка успешно отправлена"
                    val invoice = response.body()?.data?.invoice
                    
                    // Если есть счет, показываем кнопку для скачивания
                    if (invoice?.url != null) {
                        invoiceUrl = invoice.url
                        binding.downloadInvoiceButton.visibility = View.VISIBLE
                        binding.createButton.text = "Закрыть"
                        binding.createButton.setOnClickListener {
                            dismiss()
                        }
                        Toast.makeText(requireContext(), "Заявка отправлена. Скачайте счет на оплату.", Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(requireContext(), message, Toast.LENGTH_LONG).show()
                        onInvoiceCreated?.invoke(documentId?.toString() ?: "")
                        dismiss()
                    }
                } else {
                    val errorMsg = response.body()?.error
                        ?: "Ошибка при отправке заявки: ${response.message()}"
                    Toast.makeText(requireContext(), errorMsg, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("CreateInvoiceDialog", "Ошибка отправки заявки", e)
                Toast.makeText(requireContext(), "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.createButton.isEnabled = true
                if (invoiceUrl == null) {
                    binding.createButton.text = "Отправить заявку"
                }
            }
        }
    }
    
    private fun downloadInvoice(url: String) {
        try {
            val fullUrl = if (url.startsWith("http")) {
                url
            } else {
                // Получаем базовый URL без /api/
                val baseUrl = ApiConfig.getBaseUrl(requireContext())
                val apiBaseUrl = baseUrl.removeSuffix("/api/")
                "$apiBaseUrl$url"
            }
            
            android.util.Log.d("CreateInvoiceDialog", "Открытие счета: $fullUrl")
            
            // Открываем PDF через браузер или приложение для просмотра PDF
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            
            try {
                startActivity(intent)
                Toast.makeText(requireContext(), "Счет открыт", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                android.util.Log.e("CreateInvoiceDialog", "Ошибка открытия PDF", e)
                Toast.makeText(requireContext(), "Не удалось открыть счет. Установите приложение для просмотра PDF", Toast.LENGTH_LONG).show()
            }
        } catch (e: Exception) {
            android.util.Log.e("CreateInvoiceDialog", "Ошибка открытия счета", e)
            Toast.makeText(requireContext(), "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
