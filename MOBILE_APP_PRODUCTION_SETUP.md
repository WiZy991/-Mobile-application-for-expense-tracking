# 📱 Настройка мобильного приложения для продакшн

После деплоя бэкенда на сервер нужно обновить URL API в мобильном приложении.

## 🔧 Способ 1: Обновление кода (рекомендуется для продакшн)

### Шаг 1: Обновите ApiConfig.kt

Откройте файл `app/src/main/java/com/example/worldcashbox/data/api/ApiConfig.kt`:

```kotlin
object ApiConfig {
    // ... существующий код ...
    
    // URL по умолчанию для продакшн
    private const val DEFAULT_PRODUCTION_URL = "https://your-domain.com/api/"
    // или для Railway: "https://your-app.up.railway.app/api/"
    // или для Render: "https://your-app.onrender.com/api/"
    
    // URL для разработки
    private const val DEFAULT_EMULATOR_URL = "http://10.0.2.2:3000/api/"
    private const val DEFAULT_DEVICE_URL = "http://192.168.0.62:3000/api/"
    
    fun getBaseUrl(context: Context): String {
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedUrl = prefs.getString(KEY_BASE_URL, null)

        // 1) Если пользователь задал URL – используем его
        if (!savedUrl.isNullOrBlank()) {
            return savedUrl
        }

        // 2) Для продакшн сборки используем продакшн URL
        // Для debug сборки используем локальный URL
        return if (BuildConfig.DEBUG) {
            // Режим разработки
            if (isEmulator()) {
                DEFAULT_EMULATOR_URL
            } else {
                DEFAULT_DEVICE_URL
            }
        } else {
            // Режим продакшн
            DEFAULT_PRODUCTION_URL
        }
    }
    
    // ... остальной код ...
}
```

### Шаг 2: Используйте Build Variants (лучший подход)

Создайте файл `app/src/main/res/values/config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- URL для продакшн -->
    <string name="api_base_url">https://your-domain.com/api/</string>
</resources>
```

И файл `app/src/debug/res/values/config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- URL для разработки -->
    <string name="api_base_url">http://10.0.2.2:3000/api/</string>
</resources>
```

Затем в `ApiConfig.kt`:

```kotlin
fun getBaseUrl(context: Context): String {
    val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val savedUrl = prefs.getString(KEY_BASE_URL, null)

    if (!savedUrl.isNullOrBlank()) {
        return savedUrl
    }

    // Используем URL из ресурсов (разный для debug/release)
    val defaultUrl = context.getString(R.string.api_base_url)
    
    return if (isEmulator() && BuildConfig.DEBUG) {
        // Для эмулятора в режиме разработки
        DEFAULT_EMULATOR_URL
    } else {
        defaultUrl
    }
}
```

---

## 🔧 Способ 2: Настройка через SharedPreferences (для тестирования)

Приложение уже поддерживает настройку URL через SharedPreferences. Пользователь может изменить URL в настройках приложения (если такая функция есть).

Или программно:

```kotlin
ApiConfig.setBaseUrl(context, "https://your-domain.com/api/")
RetrofitClient.initialize(context) // Переинициализация
```

---

## 🏗️ Сборка продакшн APK

### Шаг 1: Обновите версию

В `app/build.gradle.kts`:

```kotlin
android {
    defaultConfig {
        versionCode = 2  // Увеличьте на 1
        versionName = "1.0.1"  // Обновите версию
    }
}
```

### Шаг 2: Настройте signing config (для Google Play)

В `app/build.gradle.kts`:

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("path/to/your/keystore.jks")
            storePassword = "your_store_password"
            keyAlias = "your_key_alias"
            keyPassword = "your_key_password"
        }
    }
    
    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

### Шаг 3: Соберите APK

```bash
cd app
./gradlew assembleRelease
```

APK будет в: `app/build/outputs/apk/release/app-release.apk`

### Или соберите AAB (для Google Play)

```bash
./gradlew bundleRelease
```

AAB будет в: `app/build/outputs/bundle/release/app-release.aab`

---

## ✅ Проверка перед публикацией

1. **Проверьте URL API**
   - Убедитесь, что URL указывает на продакшн сервер
   - Проверьте, что используется HTTPS (не HTTP)

2. **Протестируйте основные функции**
   - Регистрация/Вход
   - Просмотр услуг
   - Создание заявок
   - Просмотр счетов
   - Поддержка

3. **Проверьте безопасность**
   - Убедитесь, что debug логи отключены в продакшн сборке
   - Проверьте, что нет хардкода секретов в коде

---

## 🔐 Настройка HTTPS

**ВАЖНО**: Для продакшн обязательно используйте HTTPS!

Мобильные приложения (особенно на Android 9+) требуют HTTPS для сетевых запросов. Если ваш сервер использует самоподписанный сертификат, нужно:

1. **Использовать валидный SSL сертификат** (Let's Encrypt, Cloudflare и т.д.)
2. **Или настроить Network Security Config** (не рекомендуется для продакшн)

Создайте `app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- ТОЛЬКО для разработки! Не используйте в продакшн! -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

И в `AndroidManifest.xml`:

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

**Но лучше просто используйте валидный SSL сертификат на сервере!**

---

## 📝 Чеклист перед публикацией

- [ ] URL API обновлен на продакшн
- [ ] Используется HTTPS
- [ ] Версия приложения обновлена
- [ ] Подпись APK настроена
- [ ] Протестированы все основные функции
- [ ] Debug логи отключены
- [ ] ProGuard настроен (если используется)
- [ ] Иконка и название приложения настроены
- [ ] Privacy Policy и Terms of Service готовы (если требуется)

---

## 🚀 Публикация в Google Play

1. Создайте аккаунт разработчика Google Play
2. Создайте новое приложение в Google Play Console
3. Загрузите AAB файл
4. Заполните описание, скриншоты, иконки
5. Настройте ценообразование и распространение
6. Отправьте на проверку

---

## 🔄 Обновление приложения

При обновлении бэкенда:

1. Обновите версию приложения
2. Пересоберите APK/AAB
3. Загрузите новую версию в Google Play
4. Уведомите пользователей об обновлении (если нужно)

---

**Готово! Ваше приложение готово к использованию клиентами! 🎉**
