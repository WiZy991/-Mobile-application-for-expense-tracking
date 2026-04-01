package com.example.worldcashbox

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.example.worldcashbox.data.api.RetrofitClient
import com.example.worldcashbox.ui.login.LoginActivity
import com.example.worldcashbox.ui.engineer.EngineerTicketsActivity
import com.example.worldcashbox.ui.main.MainActivity as MainAppActivity
import com.example.worldcashbox.utils.TokenManager

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        RetrofitClient.initialize(this)
        
        val tokenManager = TokenManager(this)
        
        if (!tokenManager.isLoggedIn()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        val userType = tokenManager.getUserType()
        val userRole = tokenManager.getUserRole()

        val target = if (userType == "staff" && (userRole == "engineer" || userRole == "support" || userRole == "manager")) {
            EngineerTicketsActivity::class.java
        } else {
            MainAppActivity::class.java
        }
        startActivity(Intent(this, target))
        finish()
    }
}