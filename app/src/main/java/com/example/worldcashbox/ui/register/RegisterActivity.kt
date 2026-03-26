package com.example.worldcashbox.ui.register

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.animation.LinearInterpolator
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.databinding.ActivityRegisterBinding
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.RegisterRequest
import com.example.worldcashbox.ui.main.MainActivity
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class RegisterActivity : AppCompatActivity() {
    private lateinit var binding: ActivityRegisterBinding
    private lateinit var tokenManager: TokenManager

    // Шаги регистрации
    private enum class Step {
        CREDENTIALS,  // Шаг 1: Данные
        INN,          // Шаг 2: ИНН
        SEARCHING,    // Шаг 3: Поиск
        SUCCESS       // Шаг 4: Успех
    }

    private var currentStep = Step.CREDENTIALS
    private var searchProgress = 0
    private var companyData: CompanyData? = null
    private var sbisData: Map<String, String?>? = null // Данные из SBIS для сохранения в БД

    // Данные формы
    private var phone = ""
    private var email = ""
    private var password = ""
    private var confirmPassword = ""
    private var inn = ""
    private var companyName = ""
    
    // Job для автоматического поиска по ИНН
    private var innSearchJob: kotlinx.coroutines.Job? = null

    data class CompanyData(
        val name: String,
        val inn: String,
        val kpp: String? = null,
        val ogrn: String? = null,
        val address: String? = null,
        val director: String? = null,
        val totalSpent: Double = 0.0,
        val invoicesCount: Int = 0,
        val fromCRM: Boolean = false,
        val isVerified: Boolean = false
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        RetrofitClient.initialize(this)

        setupListeners()
        showStep(currentStep)
    }

    private fun setupListeners() {
        try {
            binding.nextButton.setOnClickListener {
                try {
                    handleNextStep()
                } catch (e: Exception) {
                    e.printStackTrace()
                    Toast.makeText(this@RegisterActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }

            binding.backButton?.setOnClickListener {
                try {
                    when (currentStep) {
                        Step.INN -> {
                            currentStep = Step.CREDENTIALS
                            showStep(currentStep)
                        }
                        else -> {}
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                    Toast.makeText(this@RegisterActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }

            binding.completeButton?.setOnClickListener {
                try {
                    completeRegistration()
                } catch (e: Exception) {
                    e.printStackTrace()
                    Toast.makeText(this@RegisterActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }

            binding.loginLinkTextView?.setOnClickListener {
                finish()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Ошибка инициализации: ${e.message}", Toast.LENGTH_LONG).show()
        }

        // Форматирование телефона
        binding.phoneEditText?.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val formatted = formatPhone(s.toString())
                if (formatted != s.toString()) {
                    binding.phoneEditText?.setText(formatted)
                    binding.phoneEditText?.setSelection(formatted.length)
                }
            }
        })

        // Только цифры для ИНН и автоматический поиск при вводе 10 или 12 цифр
        binding.innEditText?.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, before: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val cleaned = s.toString().replace(Regex("[^0-9]"), "")
                if (cleaned != s.toString()) {
                    binding.innEditText?.setText(cleaned)
                    binding.innEditText?.setSelection(cleaned.length)
                }
                
                // Отменяем предыдущий поиск
                innSearchJob?.cancel()
                
                // Автоматический поиск при вводе полного ИНН (10 или 12 цифр)
                if ((cleaned.length == 10 || cleaned.length == 12) && !isDestroyed && !isFinishing) {
                    innSearchJob = lifecycleScope.launch {
                        delay(1500) // Задержка 1.5 секунды
                        // Проверяем, что Activity еще активна
                        if (!isDestroyed && !isFinishing) {
                            val currentInn = binding.innEditText?.text?.toString()?.replace(Regex("[^0-9]"), "") ?: ""
                            if (currentInn == cleaned) {
                                // Автоматически заполняем данные, если пользователь еще не нажал "Найти"
                                if (currentStep == Step.INN && companyName.isEmpty()) {
                                    searchCompanyByInn(cleaned)
                                }
                            }
                        }
                    }
                }
            }
        })
    }

    private fun formatPhone(text: String): String {
        val cleaned = text.replace(Regex("[^0-9]"), "")
        if (cleaned.isEmpty()) return ""
        
        var formatted = "+7"
        if (cleaned.length > 1) {
            formatted += " (${cleaned.substring(1, minOf(4, cleaned.length))}"
        }
        if (cleaned.length > 4) {
            formatted += ") ${cleaned.substring(4, minOf(7, cleaned.length))}"
        }
        if (cleaned.length > 7) {
            formatted += "-${cleaned.substring(7, minOf(9, cleaned.length))}"
        }
        if (cleaned.length > 9) {
            formatted += "-${cleaned.substring(9, minOf(11, cleaned.length))}"
        }
        return formatted
    }

    private fun showStep(step: Step) {
        try {
            // Скрываем все шаги
            binding.credentialsStep?.visibility = android.view.View.GONE
            binding.innStep?.visibility = android.view.View.GONE
            binding.searchingStep?.visibility = android.view.View.GONE
            binding.successStep?.visibility = android.view.View.GONE

            // Показываем нужный шаг
            when (step) {
                Step.CREDENTIALS -> {
                    binding.credentialsStep?.visibility = android.view.View.VISIBLE
                    binding.stepIndicator?.visibility = android.view.View.VISIBLE
                    binding.nextButton?.text = "Далее"
                    binding.backButton?.visibility = android.view.View.GONE
                    binding.completeButton?.visibility = android.view.View.GONE
                    binding.nextButton?.visibility = android.view.View.VISIBLE
                }
                Step.INN -> {
                    binding.innStep?.visibility = android.view.View.VISIBLE
                    binding.stepIndicator?.visibility = android.view.View.VISIBLE
                    binding.nextButton?.text = "Найти компанию"
                    binding.backButton?.visibility = android.view.View.VISIBLE
                    binding.completeButton?.visibility = android.view.View.GONE
                    binding.nextButton?.visibility = android.view.View.VISIBLE
                }
                Step.SEARCHING -> {
                    binding.searchingStep?.visibility = android.view.View.VISIBLE
                    binding.stepIndicator?.visibility = android.view.View.GONE
                    binding.nextButton?.visibility = android.view.View.GONE
                    binding.backButton?.visibility = android.view.View.GONE
                    binding.completeButton?.visibility = android.view.View.GONE
                    binding.searchingInnTextView?.text = "ИНН: $inn"
                    startSearchAnimation()
                    startSearch()
                }
                Step.SUCCESS -> {
                    binding.successStep?.visibility = android.view.View.VISIBLE
                    binding.stepIndicator?.visibility = android.view.View.GONE
                    binding.nextButton?.visibility = android.view.View.GONE
                    binding.backButton?.visibility = android.view.View.GONE
                    binding.completeButton?.visibility = android.view.View.VISIBLE
                    showCompanyData()
                }
            }

            updateStepIndicator(step)
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Ошибка отображения шага: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun updateStepIndicator(step: Step) {
        try {
            when (step) {
                Step.CREDENTIALS -> {
                    binding.step1Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle_active)
                    binding.step2Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle)
                    binding.step3Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle)
                }
                Step.INN -> {
                    binding.step1Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle_completed)
                    binding.step2Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle_active)
                    binding.step3Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle)
                }
                Step.SEARCHING, Step.SUCCESS -> {
                    binding.step1Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle_completed)
                    binding.step2Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle_completed)
                    binding.step3Circle?.setBackgroundResource(com.example.worldcashbox.R.drawable.step_circle_active)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleNextStep() {
        try {
            when (currentStep) {
                Step.CREDENTIALS -> {
                    if (validateCredentials()) {
                        currentStep = Step.INN
                        showStep(currentStep)
                    }
                }
                Step.INN -> {
                    if (validateInn()) {
                        currentStep = Step.SEARCHING
                        showStep(currentStep)
                    }
                }
                else -> {}
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun validateCredentials(): Boolean {
        phone = binding.phoneEditText?.text?.toString()?.replace(Regex("[^0-9]"), "") ?: ""
        email = binding.emailEditText?.text?.toString()?.trim() ?: ""
        password = binding.passwordEditText?.text?.toString() ?: ""
        confirmPassword = binding.confirmPasswordEditText?.text?.toString() ?: ""

        if (phone.length < 11) {
            Toast.makeText(this, "Введите корректный номер телефона", Toast.LENGTH_SHORT).show()
            return false
        }

        if (!email.contains("@")) {
            Toast.makeText(this, "Введите корректный email", Toast.LENGTH_SHORT).show()
            return false
        }

        if (password.length < 6) {
            Toast.makeText(this, "Пароль должен содержать минимум 6 символов", Toast.LENGTH_SHORT).show()
            return false
        }

        if (password != confirmPassword) {
            Toast.makeText(this, "Пароли не совпадают", Toast.LENGTH_SHORT).show()
            return false
        }

        return true
    }

    private fun validateInn(): Boolean {
        inn = binding.innEditText?.text?.toString()?.replace(Regex("[^0-9]"), "") ?: ""
        companyName = binding.companyNameEditText?.text?.toString()?.trim() ?: ""

        if (inn.length != 10 && inn.length != 12) {
            Toast.makeText(this, "Введите корректный ИНН (10 или 12 цифр)", Toast.LENGTH_SHORT).show()
            return false
        }

        // Название организации не обязательно, так как оно будет загружено из SBIS
        // Но если пользователь ввел название, проверяем его
        if (companyName.isNotEmpty() && companyName.length < 3) {
            Toast.makeText(this, "Название организации должно содержать минимум 3 символа", Toast.LENGTH_SHORT).show()
            return false
        }

        return true
    }
    
    private fun searchCompanyByInn(innValue: String) {
        if (isDestroyed || isFinishing) return
        
        lifecycleScope.launch {
            try {
                if (isDestroyed || isFinishing) return@launch
                
                // Очищаем ИНН от всех нецифровых символов перед отправкой
                val cleanedInn = innValue.replace(Regex("[^0-9]"), "")
                if (cleanedInn.isEmpty()) {
                    return@launch
                }
                
                android.util.Log.d("Register", "Auto-search contractor with INN: $cleanedInn (length: ${cleanedInn.length})")
                
                val contractorResponse = RetrofitClient.apiService.getContractorInfo(
                    mapOf("inn" to cleanedInn)
                )
                
                if (isDestroyed || isFinishing) return@launch
                
                if (contractorResponse.isSuccessful && contractorResponse.body()?.success == true) {
                    val contractorInfo = contractorResponse.body()!!
                    
                    if (isDestroyed || isFinishing) return@launch
                    
                    // Автоматически заполняем поля, если они пустые
                    // БЕЗ уведомлений пользователю - тихое заполнение
                    if (contractorInfo.name != null && contractorInfo.name.isNotEmpty()) {
                        binding.companyNameEditText?.setText(contractorInfo.name)
                        companyName = contractorInfo.name
                        android.util.Log.d("Register", "✅ Автоматически заполнено название компании: ${contractorInfo.name}")
                    }
                }
            } catch (e: Exception) {
                // Тихая ошибка - не показываем пользователю, так как это автоматический поиск
                android.util.Log.d("Register", "Auto-search failed: ${e.message}")
            }
        }
    }

    private var searchIconAnimator: ObjectAnimator? = null
    private var searchIconPulseAnimator: ValueAnimator? = null

    private fun startSearchAnimation() {
        try {
            val searchIcon = binding.searchingIconContainer
            searchIcon ?: return

            // Анимация вращения
            searchIconAnimator = ObjectAnimator.ofFloat(searchIcon, "rotation", 0f, 360f).apply {
                duration = 2000
                repeatCount = ObjectAnimator.INFINITE
                interpolator = LinearInterpolator()
                start()
            }

            // Анимация пульсации
            searchIconPulseAnimator = ValueAnimator.ofFloat(1f, 1.2f, 1f).apply {
                duration = 2000
                repeatCount = ValueAnimator.INFINITE
                addUpdateListener { animator ->
                    val scale = animator.animatedValue as Float
                    searchIcon.scaleX = scale
                    searchIcon.scaleY = scale
                }
                start()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopSearchAnimation() {
        try {
            searchIconAnimator?.cancel()
            searchIconPulseAnimator?.cancel()
            searchIconAnimator = null
            searchIconPulseAnimator = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun startSearch() {
        searchProgress = 0
        lifecycleScope.launch {
            try {
                // Проверяем, что мы все еще на шаге поиска
                if (currentStep != Step.SEARCHING) {
                    return@launch
                }
                
                // Шаг 1: Получение информации о контрагенте (30%)
                updateSearchProgress(30, "Поиск организации по ИНН")
                
                // Очищаем ИНН от всех нецифровых символов перед отправкой
                val cleanedInn = inn.replace(Regex("[^0-9]"), "")
                if (cleanedInn.isEmpty()) {
                    throw Exception("ИНН не может быть пустым")
                }
                
                android.util.Log.d("Register", "Searching contractor with INN: $cleanedInn (length: ${cleanedInn.length})")
                
                val contractorResponse = RetrofitClient.apiService.getContractorInfo(
                    mapOf("inn" to cleanedInn)
                )
                
                if (!contractorResponse.isSuccessful) {
                    val errorBody = contractorResponse.errorBody()?.string()
                    android.util.Log.e("Register", "Contractor info error: $errorBody")
                    throw Exception("Ошибка при поиске организации: ${contractorResponse.message()}")
                }
                
                val contractorInfo = contractorResponse.body()
                if (contractorInfo == null || !contractorInfo.success) {
                    throw Exception(contractorInfo?.error ?: contractorInfo?.message ?: "Организация не найдена")
                }
                
                // Логируем полученные данные из SBIS
                android.util.Log.d("Register", "SBIS Contractor Info:")
                android.util.Log.d("Register", "  name: ${contractorInfo.name}")
                android.util.Log.d("Register", "  inn: ${contractorInfo.inn}")
                android.util.Log.d("Register", "  kpp: ${contractorInfo.kpp}")
                android.util.Log.d("Register", "  legalAddress: ${contractorInfo.legalAddress}")
                android.util.Log.d("Register", "  ogrn: ${contractorInfo.ogrn}")
                android.util.Log.d("Register", "  ogrnip: ${contractorInfo.ogrnip}")
                android.util.Log.d("Register", "  type: ${contractorInfo.type}")
                android.util.Log.d("Register", "  identifier: ${contractorInfo.identifier}")
                
                delay(500)

                // Шаг 2: Обработка данных (60%)
                updateSearchProgress(60, "Обработка данных")
                delay(500)

                // Шаг 3: Завершение (100%)
                updateSearchProgress(100, "Завершение")
                delay(300)

                // Проверяем, что мы все еще на шаге поиска
                if (currentStep != Step.SEARCHING) {
                    return@launch
                }

                // Определяем тип организации
                val isIP = inn.length == 12
                
                // Формируем данные компании из ответа SBIS
                val resolvedName = contractorInfo.name ?: companyName.ifEmpty {
                    if (isIP) "ИП (ИНН: $inn)" else "Организация (ИНН: $inn)"
                }

                companyData = CompanyData(
                    name = resolvedName,
                    inn = contractorInfo.inn,
                    kpp = contractorInfo.kpp,
                    ogrn = if (isIP) contractorInfo.ogrnip else contractorInfo.ogrn, // ОГРНИП для ИП, ОГРН для ООО
                    address = contractorInfo.legalAddress,
                    director = null, // Директор не возвращается этим методом
                    totalSpent = 0.0,
                    invoicesCount = 0,
                    fromCRM = true,
                    isVerified = true
                )
                
                // Сохраняем данные из SBIS для отправки при регистрации
                // Для ИП используем ogrnip, для ООО - ogrn
                sbisData = mapOf(
                    "kpp" to contractorInfo.kpp,
                    "ogrn" to (if (isIP) contractorInfo.ogrnip else contractorInfo.ogrn),
                    "companyAddress" to contractorInfo.legalAddress,
                    "sbisContractId" to contractorInfo.identifier
                )
                
                android.util.Log.d("Register", "SBIS Data saved:")
                android.util.Log.d("Register", "  kpp: ${sbisData?.get("kpp")}")
                android.util.Log.d("Register", "  ogrn: ${sbisData?.get("ogrn")}")
                android.util.Log.d("Register", "  companyAddress: ${sbisData?.get("companyAddress")}")
                android.util.Log.d("Register", "  sbisContractId: ${sbisData?.get("sbisContractId")}")
                
                // Обновляем название компании и поле ввода, если оно было получено из SBIS
                if (resolvedName.isNotEmpty()) {
                    companyName = resolvedName
                    binding.companyNameEditText?.setText(resolvedName)
                    android.util.Log.d("Register", "Company name updated from SBIS: $companyName")
                }

                stopSearchAnimation()
                currentStep = Step.SUCCESS
                showStep(currentStep)
            } catch (e: Exception) {
                android.util.Log.e("Register", "Error searching contractor", e)
                stopSearchAnimation()
                
                // Показываем ошибку, но все равно переходим к успеху с введенными данными
                Toast.makeText(
                    this@RegisterActivity, 
                    "Не удалось загрузить данные из SBIS: ${e.message}. Используются введенные данные.", 
                    Toast.LENGTH_LONG
                ).show()
                
                // Используем введенные данные
                val isIP = inn.length == 12
                companyData = CompanyData(
                    name = companyName.ifEmpty { 
                        if (isIP) "ИП (ИНН: $inn)" else "Организация (ИНН: $inn)"
                    },
                    inn = inn,
                    totalSpent = 0.0,
                    invoicesCount = 0,
                    fromCRM = false,
                    isVerified = false
                )
                currentStep = Step.SUCCESS
                showStep(currentStep)
            }
        }
    }

    private fun updateSearchProgress(progress: Int, stepText: String) {
        try {
            searchProgress = progress
            binding.searchProgressBar?.progress = progress
            binding.progressText?.text = "$progress%"
            
            // Обновляем статус шагов
            binding.searchStep1?.setTextColor(
                if (progress >= 20) getColor(com.example.worldcashbox.R.color.success)
                else getColor(com.example.worldcashbox.R.color.text_muted)
            )
            binding.searchStep2?.setTextColor(
                if (progress >= 40) getColor(com.example.worldcashbox.R.color.success)
                else getColor(com.example.worldcashbox.R.color.text_muted)
            )
            binding.searchStep3?.setTextColor(
                if (progress >= 60) getColor(com.example.worldcashbox.R.color.success)
                else getColor(com.example.worldcashbox.R.color.text_muted)
            )
            binding.searchStep4?.setTextColor(
                if (progress >= 80) getColor(com.example.worldcashbox.R.color.success)
                else getColor(com.example.worldcashbox.R.color.text_muted)
            )
            binding.searchStep5?.setTextColor(
                if (progress >= 100) getColor(com.example.worldcashbox.R.color.success)
                else getColor(com.example.worldcashbox.R.color.text_muted)
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun showCompanyData() {
        try {
            val data = companyData ?: return
            
            binding.companyNameTextView?.text = data.name
            binding.companyInnTextView?.text = "ИНН: ${data.inn}"
            
            if (data.kpp != null) {
                binding.companyKppTextView?.text = "КПП: ${data.kpp}"
                binding.companyKppTextView?.visibility = android.view.View.VISIBLE
            } else {
                binding.companyKppTextView?.visibility = android.view.View.GONE
            }

            if (data.fromCRM) {
                binding.verifiedBadge?.visibility = android.view.View.VISIBLE
                binding.verifiedBadgeText?.text = "✓ Данные загружены из вашей CRM СБИС"
            } else {
                binding.verifiedBadge?.visibility = android.view.View.GONE
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun completeRegistration() {
        try {
            binding.completeButton?.isEnabled = false
            // Показываем индикатор загрузки
            binding.completeButton?.text = "Регистрация..."

            lifecycleScope.launch {
                try {
                    // Используем название компании из SBIS, если оно было получено
                    val companyNameToSend = if (companyData?.name != null && companyData!!.name.isNotEmpty()) {
                        companyData!!.name
                    } else {
                        companyName.ifEmpty { 
                            if (inn.length == 12) "ИП (ИНН: $inn)" else "Организация (ИНН: $inn)"
                        }
                    }
                    
                    val response = RetrofitClient.apiService.register(
                        RegisterRequest(
                            email = email,
                            password = password,
                            name = companyNameToSend, // Название из SBIS или введенное пользователем
                            phone = phone, // Телефон вводится пользователем (SBIS API не возвращает телефон)
                            inn = inn,
                            kpp = sbisData?.get("kpp") as? String,
                            ogrn = sbisData?.get("ogrn") as? String, // ОГРН для ООО или ОГРНИП для ИП
                            companyAddress = sbisData?.get("companyAddress") as? String, // Адрес из SBIS
                            sbisContractId = sbisData?.get("sbisContractId") as? String
                        )
                    )

                    if (response.isSuccessful && response.body() != null) {
                        val authResponse = response.body()!!
                        tokenManager.saveToken(authResponse.token)
                        tokenManager.saveUserType(authResponse.user?.type ?: "client")

                        val intent = Intent(this@RegisterActivity, MainActivity::class.java)
                        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                        startActivity(intent)
                        finish()
                    } else {
                        val errorBody = response.errorBody()?.string() ?: "Неизвестная ошибка"
                        Toast.makeText(this@RegisterActivity, "Ошибка регистрации: $errorBody", Toast.LENGTH_LONG).show()
                        binding.completeButton?.isEnabled = true
                        binding.completeButton?.text = "Завершить регистрацию"
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                    Toast.makeText(this@RegisterActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
                    binding.completeButton?.isEnabled = true
                    binding.completeButton?.text = "Завершить регистрацию"
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Ошибка начала регистрации: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Отменяем все отложенные задачи при уничтожении Activity
        innSearchJob?.cancel()
        stopSearchAnimation()
    }
}
