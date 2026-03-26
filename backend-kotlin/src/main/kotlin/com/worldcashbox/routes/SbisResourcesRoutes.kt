package com.worldcashbox.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureSbisResourcesRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/sbis-resources") {
                post("/get-fn-list") {
                    try {
                        val request = call.receive<Map<String, Any>>()
                        val userId = request["userId"] as? String ?: "default"
                        val contractorINN = request["contractorINN"] as? String
                        
                        if (contractorINN.isNullOrBlank()) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "contractorINN is required"))
                            return@post
                        }
                        
                        // TODO: Реализовать получение списка ФН через СБИС API
                        call.respond(mapOf(
                            "success" to true,
                            "fn_list" to emptyList<Any>(),
                            "message" to "FN list retrieval not yet implemented in Kotlin backend"
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get FN list error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
