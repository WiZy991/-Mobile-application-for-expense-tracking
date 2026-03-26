package com.worldcashbox.utils

import org.mindrot.jbcrypt.BCrypt

object PasswordUtils {
    fun hash(password: String): String {
        return BCrypt.hashpw(password, BCrypt.gensalt(10))
    }
    
    fun verify(password: String, hash: String): Boolean {
        return try {
            BCrypt.checkpw(password, hash)
        } catch (e: Exception) {
            false
        }
    }
}
