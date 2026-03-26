package com.example.worldcashbox.ui.login

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.LoginRequest
import com.example.worldcashbox.databinding.ActivityLoginBinding
import com.example.worldcashbox.ui.main.MainActivity
import com.example.worldcashbox.utils.TokenManager
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        com.example.worldcashbox.data.api.RetrofitClient.initialize(this)

        // Проверяем, авторизован ли пользователь
        if (tokenManager.isLoggedIn()) {
            navigateToDashboard()
            return
        }

        setupListeners()
    }

    private var showPassword = false

    private fun setupListeners() {
        binding.loginButton.setOnClickListener {
            login()
        }

        binding.registerTextView.setOnClickListener {
            startActivity(Intent(this, com.example.worldcashbox.ui.register.RegisterActivity::class.java))
        }

        binding.forgotPasswordTextView.setOnClickListener {
            Toast.makeText(this, "Восстановление пароля будет добавлено", Toast.LENGTH_SHORT).show()
        }

        // Toggle password visibility
        binding.showPasswordIcon.setOnClickListener {
            showPassword = !showPassword
            binding.passwordEditText.transformationMethod = if (showPassword) {
                null
            } else {
                android.text.method.PasswordTransformationMethod.getInstance()
            }
            binding.showPasswordIcon.text = if (showPassword) "👁️" else "👁️‍🗨️"
        }
    }

    private fun login() {
        val email = binding.emailEditText.text.toString().trim().lowercase()
        val password = binding.passwordEditText.text.toString()

        if (email.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Заполните все поля", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBarContainer.visibility = android.view.View.VISIBLE
        binding.loginButton.isEnabled = false

        lifecycleScope.launch {
            var loginSuccessful = false
            var lastError: String? = null
            
            try {
                // Сначала пробуем войти как клиент
                try {
                    val clientResponse = RetrofitClient.apiService.login(LoginRequest(email, password))
                    if (clientResponse.isSuccessful && clientResponse.body() != null) {
                        val authResponse = clientResponse.body()!!
                        tokenManager.saveToken(authResponse.token)
                        tokenManager.saveUserType(authResponse.user?.type ?: "client")
                        tokenManager.saveUserRole(authResponse.user?.role)
                        navigateToDashboard()
                        loginSuccessful = true
                        return@launch
                    } else {
                        // Сохраняем ошибку клиента, но продолжаем пробовать staff login
                        lastError = clientResponse.errorBody()?.string() ?: "Неверный email или пароль"
                        android.util.Log.d("Login", "Client login failed: $lastError")
                    }
                } catch (clientError: Exception) {
                    // Игнорируем ошибку клиента, пробуем staff login
                    android.util.Log.d("Login", "Client login exception, trying staff login", clientError)
                }
                
                // Если не получилось как клиент, пробуем как сотрудник
                if (!loginSuccessful) {
                    try {
                        val staffResponse = RetrofitClient.apiService.staffLogin(LoginRequest(email, password))
                        if (staffResponse.isSuccessful && staffResponse.body() != null) {
                            val staffAuthResponse = staffResponse.body()!!
                            tokenManager.saveToken(staffAuthResponse.token)
                            tokenManager.saveUserType("staff")
                            tokenManager.saveUserRole(staffAuthResponse.staff.role)
                            navigateToDashboard()
                            loginSuccessful = true
                            return@launch
                        } else {
                            // Сохраняем ошибку staff
                            val errorBody = staffResponse.errorBody()?.string()
                            lastError = errorBody ?: "Неверный email или пароль"
                            android.util.Log.d("Login", "Staff login failed: $lastError")
                        }
                    } catch (staffError: Exception) {
                        android.util.Log.e("Login", "Staff login exception", staffError)
                        lastError = staffError.message ?: "Ошибка авторизации"
                    }
                }
                
                // Если оба варианта не сработали, показываем ошибку
                if (!loginSuccessful) {
                    val errorMessage = lastError ?: "Неверный email или пароль"
                    // Парсим JSON ошибку, если она есть
                    val displayMessage = if (errorMessage.contains("error")) {
                        try {
                            val json = org.json.JSONObject(errorMessage)
                            json.getString("error")
                        } catch (e: Exception) {
                            errorMessage
                        }
                    } else {
                        errorMessage
                    }
                    Toast.makeText(this@LoginActivity, displayMessage, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                val errorMessage = when {
                    e.message?.contains("Unable to resolve host") == true -> 
                        "Не удалось подключиться к серверу.\nПроверьте настройки API в разделе Настройки"
                    e.message?.contains("Connection refused") == true -> 
                        "Сервер недоступен.\nУбедитесь, что сервер запущен и URL правильный"
                    e.message?.contains("timeout") == true -> 
                        "Превышено время ожидания.\nПроверьте подключение к сети"
                    else -> "Ошибка подключения: ${e.message}\n\nПроверьте настройки API в разделе Настройки"
                }
                Toast.makeText(this@LoginActivity, errorMessage, Toast.LENGTH_LONG).show()
            } finally {
                binding.progressBarContainer.visibility = android.view.View.GONE
                binding.loginButton.isEnabled = true
            }
        }
    }

    private fun navigateToDashboard() {
        val userType = tokenManager.getUserType()
        val userRole = tokenManager.getUserRole()
        
        // Если это инженер или support, открываем инженерный кабинет
        val intent = if (userType == "staff" && (userRole == "engineer" || userRole == "support")) {
            Intent(this, com.example.worldcashbox.ui.engineer.EngineerTicketsActivity::class.java)
        } else {
            Intent(this, MainActivity::class.java)
        }
        
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
