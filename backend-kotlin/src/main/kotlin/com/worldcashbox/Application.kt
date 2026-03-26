package com.worldcashbox

import com.typesafe.config.ConfigFactory
import com.worldcashbox.database.DatabaseFactory
import com.worldcashbox.middleware.configureAuth
import com.worldcashbox.middleware.configureStaffAuth
import com.worldcashbox.routes.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.http.content.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.Json
import com.worldcashbox.jobs.*
import org.quartz.*
import org.quartz.impl.StdSchedulerFactory
import com.worldcashbox.utils.EnvUtils

fun main() {
    val config = ConfigFactory.load()
    val port = EnvUtils.getEnvInt("PORT") 
        ?: config.getInt("ktor.deployment.port")
    val host = EnvUtils.getEnv("HOST") 
        ?: config.getString("ktor.deployment.host")
    
    embeddedServer(Netty, port = port, host = host, module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    // Проверка обязательных переменных окружения
    val jwtSecret = EnvUtils.getEnv("JWT_SECRET")
    if (jwtSecret.isNullOrBlank()) {
        throw IllegalStateException(
            """
            ❌ ОШИБКА: JWT_SECRET не установлен в переменных окружения!
            📝 Создайте файл .env в папке backend-kotlin со следующим содержимым:
            
            JWT_SECRET=your_very_secret_jwt_key_change_this_in_production
            DB_HOST=localhost
            DB_PORT=5432
            DB_NAME=billing_db
            DB_USER=postgres
            DB_PASSWORD=your_password
            """.trimIndent()
        )
    }
    
    // Инициализация базы данных
    DatabaseFactory.init()
    
    // Настройка аутентификации
    configureAuth()
    configureStaffAuth()
    
    // Настройка CORS
    install(CORS) {
        anyHost()
        allowHeader("Authorization")
        allowHeader("Content-Type")
        allowMethod(io.ktor.http.HttpMethod.Options)
        allowMethod(io.ktor.http.HttpMethod.Get)
        allowMethod(io.ktor.http.HttpMethod.Post)
        allowMethod(io.ktor.http.HttpMethod.Put)
        allowMethod(io.ktor.http.HttpMethod.Delete)
    }
    
    // Настройка JSON сериализации
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = false
        })
    }
    
    // Обработка ошибок
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            call.application.environment.log.error("Unhandled exception", cause)
            call.respond(
                io.ktor.http.HttpStatusCode.InternalServerError,
                mapOf("error" to (cause.message ?: "Internal Server Error"))
            )
        }
    }
    
    // Статические файлы
    routing {
        // Веб-интерфейс (HTML страницы)
        staticResources("/", "static")
        
        // Загруженные файлы
        staticFiles("/uploads", java.io.File("uploads"))
        
        // Главная страница - редирект на регистрацию сотрудников
        get("/") {
            call.respondRedirect("/staff-register.html", permanent = false)
        }
    }
    
    // Роуты
    configureAuthRoutes()
    configureClientRoutes()
    configureServiceRoutes()
    configurePaymentRoutes()
    configureAnalyticsRoutes()
    configureSbisRoutes()
    configureSbisProxyRoutes()
    configureSbisResourcesRoutes()
    configureNotificationRoutes()
    configureSupportRoutes()
    configureRecommendationRoutes()
    configureStaffRoutes()
    configureResourceRoutes()
    configureSubscriptionRoutes()
    
    // Health check
    routing {
        get("/health") {
            try {
                DatabaseFactory.checkConnection()
                call.respond(mapOf(
                    "status" to "ok",
                    "timestamp" to java.time.Instant.now().toString(),
                    "database" to "connected",
                    "jwtSecret" to jwtSecret.isNotBlank()
                ))
            } catch (e: Exception) {
                call.respond(
                    io.ktor.http.HttpStatusCode.ServiceUnavailable,
                    mapOf(
                        "status" to "error",
                        "timestamp" to java.time.Instant.now().toString(),
                        "database" to "disconnected",
                        "error" to e.message
                    )
                )
            }
        }
    }
    
    // Запуск фоновых задач
    startBackgroundJobs()
    
    val port = EnvUtils.getEnvInt("PORT") ?: 3000
    val env = EnvUtils.getEnv("NODE_ENV") ?: "development"
    println("🚀 Server running on port $port")
    println("📊 Environment: $env")
    println("🌐 API доступен по адресу: http://localhost:$port/api/")
    println("💚 Health check: http://localhost:$port/health")
}

fun startBackgroundJobs() {
    val scheduler = StdSchedulerFactory.getDefaultScheduler()
    scheduler.start()
    
    // Payment Reminder Job
    val paymentReminderJob = JobBuilder.newJob(PaymentReminderJob::class.java)
        .withIdentity("paymentReminderJob", "group1")
        .build()
    
    val paymentReminderTrigger = TriggerBuilder.newTrigger()
        .withIdentity("paymentReminderTrigger", "group1")
        .withSchedule(CronScheduleBuilder.cronSchedule("0 0 9 * * ?")) // Каждый день в 9:00
        .build()
    
    scheduler.scheduleJob(paymentReminderJob, paymentReminderTrigger)
    
    // SBIS Sync Job
    val sbisSyncJob = JobBuilder.newJob(SbisSyncJob::class.java)
        .withIdentity("sbisSyncJob", "group1")
        .build()
    
    val sbisSyncTrigger = TriggerBuilder.newTrigger()
        .withIdentity("sbisSyncTrigger", "group1")
        .withSchedule(CronScheduleBuilder.cronSchedule("0 0 */6 * * ?")) // Каждые 6 часов
        .build()
    
    scheduler.scheduleJob(sbisSyncJob, sbisSyncTrigger)
    
    // Resource Monitor Job
    val resourceMonitorJob = JobBuilder.newJob(ResourceMonitorJob::class.java)
        .withIdentity("resourceMonitorJob", "group1")
        .build()
    
    val resourceMonitorTrigger = TriggerBuilder.newTrigger()
        .withIdentity("resourceMonitorTrigger", "group1")
        .withSchedule(CronScheduleBuilder.cronSchedule("0 0 10 * * ?")) // Каждый день в 10:00
        .build()
    
    scheduler.scheduleJob(resourceMonitorJob, resourceMonitorTrigger)
    
    // Subscription Monitor Job
    val subscriptionMonitorJob = JobBuilder.newJob(SubscriptionMonitorJob::class.java)
        .withIdentity("subscriptionMonitorJob", "group1")
        .build()
    
    val subscriptionMonitorTrigger = TriggerBuilder.newTrigger()
        .withIdentity("subscriptionMonitorTrigger", "group1")
        .withSchedule(CronScheduleBuilder.cronSchedule("0 0 11 * * ?")) // Каждый день в 11:00
        .build()
    
    scheduler.scheduleJob(subscriptionMonitorJob, subscriptionMonitorTrigger)
    
    println("✅ Background jobs started")
}
