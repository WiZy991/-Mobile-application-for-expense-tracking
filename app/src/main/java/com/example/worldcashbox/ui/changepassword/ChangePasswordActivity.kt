package com.example.worldcashbox.ui.changepassword

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.data.model.ChangePasswordRequest
import com.example.worldcashbox.databinding.ActivityChangePasswordBinding
import kotlinx.coroutines.launch

class ChangePasswordActivity : AppCompatActivity() {
    private lateinit var binding: ActivityChangePasswordBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChangePasswordBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setupListeners()
    }

    private fun setupListeners() {
        binding.changePasswordButton.setOnClickListener {
            changePassword()
        }
    }

    private fun changePassword() {
        val currentPassword = binding.currentPasswordEditText.text.toString()
        val newPassword = binding.newPasswordEditText.text.toString()
        val confirmPassword = binding.confirmPasswordEditText.text.toString()

        // Валидация
        if (currentPassword.isEmpty() || newPassword.isEmpty() || confirmPassword.isEmpty()) {
            Toast.makeText(this, "Заполните все поля", Toast.LENGTH_SHORT).show()
            return
        }

        if (newPassword.length < 6) {
            Toast.makeText(this, "Пароль должен быть не менее 6 символов", Toast.LENGTH_SHORT).show()
            return
        }

        if (newPassword != confirmPassword) {
            Toast.makeText(this, "Новые пароли не совпадают", Toast.LENGTH_SHORT).show()
            return
        }

        if (currentPassword == newPassword) {
            Toast.makeText(this, "Новый пароль должен отличаться от текущего", Toast.LENGTH_SHORT).show()
            return
        }

        lifecycleScope.launch {
            try {
                binding.changePasswordButton.isEnabled = false
                val response = RetrofitClient.apiService.changePassword(
                    ChangePasswordRequest(currentPassword, newPassword)
                )

                if (response.isSuccessful && response.body()?.success == true) {
                    AlertDialog.Builder(this@ChangePasswordActivity)
                        .setTitle("Успех")
                        .setMessage("Пароль успешно изменен")
                        .setPositiveButton("OK") { _, _ ->
                            finish()
                        }
                        .show()
                } else {
                    val errorMsg = response.body()?.message ?: response.message()
                    Toast.makeText(this@ChangePasswordActivity, "Ошибка: $errorMsg", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ChangePasswordActivity, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.changePasswordButton.isEnabled = true
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressed()
        return true
    }
}
