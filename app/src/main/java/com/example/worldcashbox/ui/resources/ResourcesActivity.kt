package com.example.worldcashbox.ui.resources

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.KKT
import com.example.worldcashbox.data.model.SBISAuthRequest
import com.example.worldcashbox.data.model.SBIS2FARequest
import com.example.worldcashbox.data.model.SaveSBISCredentialsRequest
import com.example.worldcashbox.databinding.ActivityResourcesBinding
import kotlinx.coroutines.launch

class ResourcesActivity : AppCompatActivity() {
    private lateinit var binding: ActivityResourcesBinding
    private lateinit var kktAdapter: KKTAdapter
    private var pending2FASessionId: String? = null
    private var pending2FAResourceId: String? = null
    private var pending2FAMethodToValidate: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityResourcesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Мои ККТ"

        setupRecyclerView()
        setupSwipeRefresh()
        setupAuthForm()
        loadSavedCredentials()
        loadKKTs()
    }

    private fun setupRecyclerView() {
        binding.resourcesRecyclerView.layoutManager = LinearLayoutManager(this)
        kktAdapter = KKTAdapter(emptyList()) { kkt ->
            // Открываем детальный экран с ФН для этой ККТ
            val intent = Intent(this, FiscalStorageActivity::class.java)
            intent.putExtra("kkt_reg_id", kkt.regId)
            intent.putExtra("kkt_model", kkt.model)
            startActivity(intent)
        }
        binding.resourcesRecyclerView.adapter = kktAdapter
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            loadKKTs()
        }
    }

    private fun setupAuthForm() {
        binding.authButton.setOnClickListener {
            performAuth()
        }

        binding.confirm2FAButton.setOnClickListener {
            confirm2FA()
        }

        // Автоматическое форматирование кода 2FA (только цифры, максимум 6)
        binding.twoFactorCodeEditText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val text = s?.toString()?.filter { it.isDigit() } ?: ""
                if (text.length > 6) {
                    s?.replace(0, s.length, text.take(6))
                } else if (s?.toString() != text) {
                    s?.replace(0, s.length, text)
                }
            }
        })
    }

    private fun loadSavedCredentials() {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.apiService.getSBISCredentials()
                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    data?.login?.let { login ->
                        binding.sbisLoginEditText.setText(login)
                    }
                    data?.notes?.let { notes ->
                        binding.sbisNotesEditText.setText(notes)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("ResourcesActivity", "Ошибка загрузки сохраненных данных", e)
            }
        }
    }

    private fun performAuth() {
        val login = binding.sbisLoginEditText.text?.toString()?.trim()
        val password = binding.sbisPasswordEditText.text?.toString()?.trim()
        val notes = binding.sbisNotesEditText.text?.toString()?.trim()

        if (login.isNullOrEmpty() || password.isNullOrEmpty()) {
            Toast.makeText(this, "Введите логин и пароль", Toast.LENGTH_SHORT).show()
            return
        }

        lifecycleScope.launch {
            try {
                binding.authButton.isEnabled = false
                binding.authButton.text = "Авторизация..."

                val authResponse = RetrofitClient.apiService.authSBIS(
                    SBISAuthRequest(login = login, password = password)
                )

                if (authResponse.isSuccessful && authResponse.body()?.success == true) {
                    val body = authResponse.body()!!

                    // Сохраняем данные (логин, пароль, заметки)
                    if (!notes.isNullOrEmpty()) {
                        try {
                            RetrofitClient.apiService.saveSBISCredentials(
                                SaveSBISCredentialsRequest(login = login, password = password, notes = notes)
                            )
                        } catch (e: Exception) {
                            android.util.Log.w("ResourcesActivity", "Не удалось сохранить заметки", e)
                        }
                    } else {
                        // Сохраняем только логин и пароль
                        try {
                            RetrofitClient.apiService.saveSBISCredentials(
                                SaveSBISCredentialsRequest(login = login, password = password)
                            )
                        } catch (e: Exception) {
                            android.util.Log.w("ResourcesActivity", "Не удалось сохранить данные", e)
                        }
                    }

                    if (body.requires2FA) {
                        // Требуется 2FA
                        pending2FASessionId = body.sessionId
                        pending2FAResourceId = body.resourceId
                        pending2FAMethodToValidate = body.methodToValidate

                        binding.twoFactorInputLayout.visibility = View.VISIBLE
                        binding.confirm2FAButton.visibility = View.VISIBLE
                        binding.authButton.visibility = View.GONE

                        Toast.makeText(
                            this@ResourcesActivity,
                            "Код подтверждения отправлен на ваш телефон",
                            Toast.LENGTH_LONG
                        ).show()
                    } else {
                        // Авторизация успешна без 2FA
                        Toast.makeText(this@ResourcesActivity, "Авторизация успешна", Toast.LENGTH_SHORT).show()
                        hideAuthForm()
                        loadKKTs()
                    }
                } else {
                    val errorMsg = authResponse.body()?.error
                        ?: "Ошибка авторизации: ${authResponse.message()}"
                    Toast.makeText(this@ResourcesActivity, errorMsg, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("ResourcesActivity", "Ошибка авторизации", e)
                Toast.makeText(this@ResourcesActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.authButton.isEnabled = true
                binding.authButton.text = "Войти"
            }
        }
    }

    private fun confirm2FA() {
        val code = binding.twoFactorCodeEditText.text?.toString()?.trim()

        if (code.isNullOrEmpty() || code.length != 6) {
            Toast.makeText(this, "Введите 6-значный код подтверждения", Toast.LENGTH_SHORT).show()
            return
        }

        if (pending2FASessionId == null || pending2FAResourceId == null) {
            Toast.makeText(this, "Ошибка: данные 2FA не найдены", Toast.LENGTH_SHORT).show()
            return
        }

        lifecycleScope.launch {
            try {
                binding.confirm2FAButton.isEnabled = false
                binding.confirm2FAButton.text = "Подтверждение..."

                val response = RetrofitClient.apiService.confirmSBIS2FA(
                    SBIS2FARequest(code = code)
                )

                if (response.isSuccessful && response.body()?.success == true) {
                    Toast.makeText(this@ResourcesActivity, "Код подтвержден, авторизация успешна", Toast.LENGTH_SHORT).show()
                    hideAuthForm()
                    loadKKTs()
                } else {
                    val errorMsg = response.body()?.error
                        ?: "Неверный код подтверждения"
                    Toast.makeText(this@ResourcesActivity, errorMsg, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("ResourcesActivity", "Ошибка подтверждения 2FA", e)
                Toast.makeText(this@ResourcesActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.confirm2FAButton.isEnabled = true
                binding.confirm2FAButton.text = "Подтвердить код"
            }
        }
    }

    private fun showAuthForm() {
        binding.authCard.visibility = View.VISIBLE
        binding.resourcesRecyclerView.visibility = View.GONE
        binding.emptyResourcesTextView.visibility = View.GONE
    }

    private fun hideAuthForm() {
        binding.authCard.visibility = View.GONE
        binding.twoFactorInputLayout.visibility = View.GONE
        binding.confirm2FAButton.visibility = View.GONE
        binding.authButton.visibility = View.VISIBLE
        pending2FASessionId = null
        pending2FAResourceId = null
        pending2FAMethodToValidate = null
        binding.twoFactorCodeEditText.text?.clear()
    }

    private fun loadKKTs() {
        lifecycleScope.launch {
            try {
                binding.swipeRefresh.isRefreshing = true
                // Получаем ИНН клиента для запроса
                val clientResponse = RetrofitClient.apiService.getClientInfo()
                val inn = if (clientResponse.isSuccessful && clientResponse.body() != null) {
                    clientResponse.body()!!.inn
                } else {
                    null
                }
                
                val response = RetrofitClient.apiService.getKKTs(inn = inn)
                
                if (response.isSuccessful && response.body() != null) {
                    val kktsResponse = response.body()!!
                    if (kktsResponse.success && !kktsResponse.data.isNullOrEmpty()) {
                        val kkts = kktsResponse.data!!
                        hideAuthForm()
                        binding.emptyResourcesTextView.visibility = android.view.View.GONE
                        binding.resourcesRecyclerView.visibility = android.view.View.VISIBLE
                        kktAdapter = KKTAdapter(kkts) { kkt ->
                            val intent = Intent(this@ResourcesActivity, FiscalStorageActivity::class.java)
                            intent.putExtra("kkt_reg_id", kkt.regId)
                            intent.putExtra("kkt_model", kkt.model)
                            startActivity(intent)
                        }
                        binding.resourcesRecyclerView.adapter = kktAdapter
                    } else if (!kktsResponse.success) {
                        // Сервер вернул ошибку (например, нет доступа к ОФД API)
                        val errorMsg = kktsResponse.details?.takeIf { it.isNotBlank() }
                            ?: kktsResponse.error
                            ?: "Нет доступа к данным ККТ"
                        android.util.Log.w("ResourcesActivity", "SBIS error: $errorMsg")
                        binding.emptyResourcesTextView.visibility = android.view.View.VISIBLE
                        binding.resourcesRecyclerView.visibility = android.view.View.GONE
                        binding.emptyResourcesTextView.text = "ККТ не найдены: $errorMsg"
                    } else {
                        // success=true, но данных нет
                        hideAuthForm()
                        binding.emptyResourcesTextView.visibility = android.view.View.VISIBLE
                        binding.resourcesRecyclerView.visibility = android.view.View.GONE
                        binding.emptyResourcesTextView.text = "У вас нет зарегистрированных ККТ"
                    }
                } else {
                    val errorBody = response.errorBody()?.string()
                    // Пробуем извлечь сообщение из JSON-ответа сервера
                    var requiresAuth = false
                    try {
                        val json = org.json.JSONObject(errorBody ?: "{}")
                        requiresAuth = json.optBoolean("requiresAuth", false)
                    } catch (e: Exception) { 
                        // Если не удалось распарсить, проверяем код ответа
                        requiresAuth = response.code() == 401
                    }
                    
                    // Также проверяем, может быть ответ успешный, но с requiresAuth
                    val responseBody = response.body()
                    if (responseBody != null && responseBody.requiresAuth == true) {
                        requiresAuth = true
                    }
                    
                    if (response.code() == 401 && requiresAuth) {
                        // Требуется авторизация - показываем форму
                        showAuthForm()
                        android.util.Log.d("ResourcesActivity", "Требуется авторизация в СБИС")
                    } else {
                        val serverMsg = try {
                            val json = org.json.JSONObject(errorBody ?: "{}")
                            json.optString("error", "").takeIf { it.isNotBlank() }
                        } catch (e: Exception) { null }
                        
                        val errorMsg = serverMsg ?: when {
                            response.code() == 400 -> "Неверный запрос. Проверьте, что ИНН указан в профиле."
                            response.code() == 401 -> "Требуется авторизация в СБИС"
                            response.code() == 404 -> "Организация не найдена в СБИС ОФД. Убедитесь, что ваши кассы подключены через СБИС ОФД."
                            else -> "Ошибка загрузки ККТ: ${response.message()}"
                        }
                        Toast.makeText(this@ResourcesActivity, errorMsg, Toast.LENGTH_LONG).show()
                        android.util.Log.e("ResourcesActivity", "Error: ${response.code()}, Body: $errorBody")
                        
                        binding.emptyResourcesTextView.visibility = android.view.View.VISIBLE
                        binding.resourcesRecyclerView.visibility = android.view.View.GONE
                        binding.emptyResourcesTextView.text = errorMsg
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("ResourcesActivity", "Ошибка загрузки ККТ", e)
                Toast.makeText(this@ResourcesActivity, "Ошибка загрузки: ${e.message}", Toast.LENGTH_LONG).show()
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
