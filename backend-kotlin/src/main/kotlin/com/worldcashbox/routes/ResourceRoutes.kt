package com.worldcashbox.routes

import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.authenticatedUser
import com.worldcashbox.models.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.math.BigDecimal
import java.time.LocalDate
import java.time.temporal.ChronoUnit

fun Application.configureResourceRoutes() {
    routing {
        authenticate("jwt-auth") {
            route("/api/resources") {
                get("/") {
                    try {
                        val user = call.authenticatedUser()
                        val status = call.request.queryParameters["status"]
                        val resourceType = call.request.queryParameters["resource_type"]
                        
                        val queryBuilder = StringBuilder(
                            """
                            SELECT 
                                cr.*,
                                CASE 
                                    WHEN cr.expiry_date <= CURRENT_DATE THEN 'expired'
                                    WHEN cr.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'
                                    WHEN cr.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
                                    ELSE 'active'
                                END as calculated_status
                            FROM client_resources cr
                            WHERE cr.client_id = ?
                            """.trimIndent()
                        )
                        
                        val params = mutableListOf<Any>(user.userId)
                        var paramIndex = 2
                        
                        if (status != null) {
                            queryBuilder.append(" AND cr.status = ?")
                            params.add(status)
                        }
                        
                        if (resourceType != null) {
                            queryBuilder.append(" AND cr.resource_type = ?")
                            params.add(resourceType)
                        }
                        
                        queryBuilder.append(" ORDER BY cr.expiry_date ASC")
                        
                        val resources = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(queryBuilder.toString()).apply {
                                params.forEachIndexed { index, param ->
                                    when (param) {
                                        is Int -> setInt(index + 1, param)
                                        is String -> setString(index + 1, param)
                                        else -> setObject(index + 1, param)
                                    }
                                }
                            }.executeQuery().let { rs ->
                                mutableListOf<Resource>().apply {
                                    while (rs.next()) {
                                        val expiryDate = rs.getDate("expiry_date")?.toLocalDate()
                                        val daysUntilExpiry = if (expiryDate != null) {
                                            ChronoUnit.DAYS.between(LocalDate.now(), expiryDate).toInt().coerceAtLeast(0)
                                        } else 0
                                        
                                        add(Resource(
                                            id = rs.getInt("id"),
                                            clientId = rs.getInt("client_id"),
                                            resourceType = rs.getString("resource_type"),
                                            resourceName = rs.getString("resource_name"),
                                            serialNumber = rs.getString("serial_number"),
                                            model = rs.getString("model"),
                                            startDate = rs.getDate("start_date")?.toString(),
                                            expiryDate = rs.getDate("expiry_date").toString(),
                                            renewalPrice = rs.getBigDecimal("renewal_price").toDouble(),
                                            autoRenewal = rs.getBoolean("auto_renewal"),
                                            status = rs.getString("status"),
                                            daysUntilExpiry = daysUntilExpiry,
                                            calculatedStatus = rs.getString("calculated_status")
                                        ))
                                    }
                                }
                            }
                        }
                        
                        call.respond(ResourcesResponse(resources = resources))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get resources error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                get("/{id}") {
                    try {
                        val user = call.authenticatedUser()
                        val resourceId = call.parameters["id"]?.toIntOrNull()
                            ?: throw IllegalArgumentException("Invalid resource ID")
                        
                        val resource = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                "SELECT * FROM client_resources WHERE id = ? AND client_id = ?"
                            ).apply {
                                setInt(1, resourceId)
                                setInt(2, user.userId)
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    val expiryDate = rs.getDate("expiry_date")?.toLocalDate()
                                    val daysUntilExpiry = if (expiryDate != null) {
                                        ChronoUnit.DAYS.between(LocalDate.now(), expiryDate).toInt().coerceAtLeast(0)
                                    } else 0
                                    
                                    Resource(
                                        id = rs.getInt("id"),
                                        clientId = rs.getInt("client_id"),
                                        resourceType = rs.getString("resource_type"),
                                        resourceName = rs.getString("resource_name"),
                                        serialNumber = rs.getString("serial_number"),
                                        model = rs.getString("model"),
                                        startDate = rs.getDate("start_date")?.toString(),
                                        expiryDate = rs.getDate("expiry_date").toString(),
                                        renewalPrice = rs.getBigDecimal("renewal_price").toDouble(),
                                        autoRenewal = rs.getBoolean("auto_renewal"),
                                        status = rs.getString("status"),
                                        daysUntilExpiry = daysUntilExpiry
                                    )
                                } else null
                            }
                        }
                        
                        if (resource == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Resource not found"))
                            return@get
                        }
                        
                        call.respond(resource)
                    } catch (e: Exception) {
                        call.application.environment.log.error("Get resource error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
                
                post("/") {
                    try {
                        val user = call.authenticatedUser()
                        val request = call.receive<CreateResourceRequest>()
                        
                        if (request.resourceType.isEmpty() || request.resourceName.isEmpty() || request.expiryDate.isEmpty()) {
                            call.respond(HttpStatusCode.BadRequest, mapOf(
                                "error" to "resource_type, resource_name and expiry_date are required"
                            ))
                            return@post
                        }
                        
                        val startDate = request.startDate ?: LocalDate.now().toString()
                        val metadataJson = if (request.metadata != null) {
                            // Простое преобразование Map в JSON строку
                            request.metadata.entries.joinToString(",", "{", "}") { 
                                "\"${it.key}\":\"${it.value}\"" 
                            }
                        } else null
                        
                        val resource = DatabaseFactory.getConnection().use { conn ->
                            conn.prepareStatement(
                                """
                                INSERT INTO client_resources 
                                (client_id, resource_type, resource_name, serial_number, model, 
                                 start_date, expiry_date, renewal_price, auto_renewal, 
                                 sbis_resource_id, metadata, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
                                RETURNING *
                                """.trimIndent()
                            ).apply {
                                setInt(1, user.userId)
                                setString(2, request.resourceType)
                                setString(3, request.resourceName)
                                setString(4, request.serialNumber)
                                setString(5, request.model)
                                setDate(6, java.sql.Date.valueOf(LocalDate.parse(startDate)))
                                setDate(7, java.sql.Date.valueOf(LocalDate.parse(request.expiryDate)))
                                setBigDecimal(8, BigDecimal.valueOf(request.renewalPrice ?: 0.0))
                                setBoolean(9, request.autoRenewal ?: false)
                                setString(10, request.sbisResourceId)
                                if (metadataJson != null) {
                                    setString(11, metadataJson)
                                } else {
                                    setNull(11, java.sql.Types.VARCHAR)
                                }
                            }.executeQuery().let { rs ->
                                if (rs.next()) {
                                    val expiryDate = rs.getDate("expiry_date")?.toLocalDate()
                                    val daysUntilExpiry = if (expiryDate != null) {
                                        ChronoUnit.DAYS.between(LocalDate.now(), expiryDate).toInt().coerceAtLeast(0)
                                    } else 0
                                    
                                    Resource(
                                        id = rs.getInt("id"),
                                        clientId = rs.getInt("client_id"),
                                        resourceType = rs.getString("resource_type"),
                                        resourceName = rs.getString("resource_name"),
                                        serialNumber = rs.getString("serial_number"),
                                        model = rs.getString("model"),
                                        startDate = rs.getDate("start_date")?.toString(),
                                        expiryDate = rs.getDate("expiry_date").toString(),
                                        renewalPrice = rs.getBigDecimal("renewal_price").toDouble(),
                                        autoRenewal = rs.getBoolean("auto_renewal"),
                                        status = rs.getString("status"),
                                        daysUntilExpiry = daysUntilExpiry
                                    )
                                } else throw IllegalStateException("Failed to create resource")
                            }
                        }
                        
                        call.respond(HttpStatusCode.Created, CreateResourceResponse(
                            success = true,
                            resource = resource
                        ))
                    } catch (e: Exception) {
                        call.application.environment.log.error("Create resource error", e)
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Internal server error"))
                    }
                }
            }
        }
    }
}
