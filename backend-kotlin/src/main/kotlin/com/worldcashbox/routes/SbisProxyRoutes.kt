package com.worldcashbox.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

// Хранение сессий пользователей
private val userSessions = mutableMapOf<String, String>()
private val sppSessions = mutableMapOf<String, String>()
private val oauthTokens = mutableMapOf<String, String>()

private val httpClient = HttpClient(CIO) {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            isLenient = true
        })
    }
}

fun Application.configureSbisProxyRoutes() {
    routing {
        route("/api/sbis-proxy") {
            // Публичные endpoints для регистрации (без авторизации)
            post("/auth") {
                try {
                    val request = call.receive<Map<String, Any>>()
                    val login = request["login"] as? String
                        ?: throw IllegalArgumentException("login is required")
                    val password = request["password"] as? String
                        ?: throw IllegalArgumentException("password is required")
                    
                    // TODO: Реализовать реальную авторизацию в СБИС
                    // Пока возвращаем демо-ответ
                    val sessionId = "demo_session_${System.currentTimeMillis()}"
                    userSessions["registration"] = sessionId
                    
                    call.respond(mapOf(
                        "success" to true,
                        "onlineSession" to sessionId,
                        "sppSession" to "demo_spp_${System.currentTimeMillis()}"
                    ))
                } catch (e: Exception) {
                    call.application.environment.log.error("SBIS auth error", e)
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        mapOf("success" to false, "error" to (e.message ?: "Authentication failed"))
                    )
                }
            }
            
            post("/crm-client-oauth") {
                try {
                    val request = call.receive<Map<String, Any>>()
                    val inn = request["inn"] as? String
                        ?: throw IllegalArgumentException("inn is required")
                    
                    // TODO: Реализовать реальный поиск в CRM СБИС
                    // Пока возвращаем демо-ответ
                    call.respond(mapOf(
                        "success" to true,
                        "data" to mapOf(
                            "found" to false,
                            "message" to "CRM search not yet implemented, using demo data"
                        )
                    ))
                } catch (e: Exception) {
                    call.application.environment.log.error("CRM client search error", e)
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        mapOf("success" to false, "error" to (e.message ?: "Search failed"))
                    )
                }
            }
            
            authenticate("jwt-auth") {
                post("/proxy") {
                    try {
                        val request = call.receive<Map<String, Any>>()
                        val method = request["method"] as? String
                            ?: throw IllegalArgumentException("Method is required")
                        val params = request["params"] as? Map<String, Any> ?: emptyMap()
                        val userId = request["userId"] as? String ?: "default"
                        
                        // Получаем сессию
                        val sessionId = userSessions[userId]
                        
                        // Формируем параметры с сессией
                        val requestParams = if (sessionId != null) {
                            params + ("Сессия" to sessionId)
                        } else {
                            params
                        }
                        
                        // Определяем URL
                        val url = when {
                            method == "СБИС.Аутентифицировать" -> "https://online.sbis.ru/auth/service/"
                            else -> "https://online.sbis.ru/service/?srv=1"
                        }
                        
                        // Формируем JSON-RPC запрос
                        val jsonRpcRequest = mapOf(
                            "jsonrpc" to "2.0",
                            "method" to method,
                            "params" to requestParams,
                            "id" to System.currentTimeMillis()
                        )
                        
                        // Выполняем запрос
                        val response = httpClient.post(url) {
                            contentType(io.ktor.http.ContentType.Application.Json)
                            header("Content-Type", "application/json-rpc; charset=utf-8")
                            if (sessionId != null) {
                                header("X-SBISSessionID", sessionId)
                            }
                            setBody(jsonRpcRequest)
                        }.body<Map<String, Any>>()
                        
                        // Сохраняем сессию если это авторизация
                        if (method == "СБИС.Аутентифицировать" && response["result"] != null) {
                            val result = response["result"] as? Map<*, *>
                            val newSessionId = result?.get("Сессия") as? String
                            if (newSessionId != null) {
                                userSessions[userId] = newSessionId
                            }
                        }
                        
                        call.respond(response)
                    } catch (e: Exception) {
                        call.application.environment.log.error("SBIS proxy error", e)
                        call.respond(
                            HttpStatusCode.InternalServerError,
                            mapOf("error" to (e.message ?: "Proxy request failed"))
                        )
                    }
                }
                
                post("/create-invoice") {
                    try {
                        val request = call.receive<Map<String, Any>>()
                        // TODO: Реализовать создание счета через СБИС API
                        call.respond(mapOf(
                            "success" to true,
                            "message" to "Invoice creation not yet implemented in Kotlin backend"
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Create invoice error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
