package com.example.worldcashbox

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.ui.login.LoginActivity
import com.example.worldcashbox.ui.main.MainActivity as MainAppActivity
import com.example.worldcashbox.utils.TokenManager

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Инициализируем RetrofitClient
        RetrofitClient.initialize(this)
        
        val tokenManager = TokenManager(this)
        
        // Проверяем авторизацию и переходим на соответствующий экран
        if (tokenManager.isLoggedIn()) {
            startActivity(Intent(this, MainAppActivity::class.java))
        } else {
            startActivity(Intent(this, LoginActivity::class.java))
        }
        
        finish()
    }
}