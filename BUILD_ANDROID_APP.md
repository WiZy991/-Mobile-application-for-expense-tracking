# 📱 Сборка Android приложения

## ✅ Проект готов к сборке!

Ваше Android приложение полностью готово и настроено для сборки APK файла.

## 🚀 Как собрать APK

### Вариант 1: Через Android Studio (Рекомендуется)

1. **Откройте проект в Android Studio**
   - File → Open → выберите папку проекта

2. **Дождитесь синхронизации Gradle**
   - Android Studio автоматически синхронизирует зависимости

3. **Соберите APK:**
   - Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Или: Build → Generate Signed Bundle / APK → APK

4. **APK будет в папке:**
   - `app/build/outputs/apk/debug/app-debug.apk` (debug версия)
   - `app/build/outputs/apk/release/app-release.apk` (release версия)

### Вариант 2: Через командную строку

```bash
# Windows (PowerShell)
.\gradlew assembleDebug

# Или для release версии
.\gradlew assembleRelease
```

APK будет в: `app/build/outputs/apk/debug/app-debug.apk`

## ⚙️ Настройка для реального устройства

### 1. Измените URL API

Откройте файл: `app/src/main/java/com/example/worldcashbox/data/api/RetrofitClient.kt`

Измените строку:
```kotlin
private const val BASE_URL = "http://10.0.2.2:3000/api/" // Для эмулятора
```

На:
```kotlin
private const val BASE_URL = "http://ВАШ_IP_АДРЕС:3000/api/" // Для реального устройства
```

**Как узнать IP адрес:**
- Windows: `ipconfig` в командной строке
- Mac/Linux: `ifconfig` в терминале
- Ищите IPv4 адрес (например: 192.168.1.100)

### 2. Убедитесь, что телефон и компьютер в одной сети Wi-Fi

### 3. Разрешите установку из неизвестных источников

На Android телефоне:
- Настройки → Безопасность → Неизвестные источники (включить)

## 📦 Установка APK на телефон

### Способ 1: Через USB
1. Подключите телефон к компьютеру
2. Скопируйте APK файл на телефон
3. Откройте файл на телефоне и установите

### Способ 2: Через ADB
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Способ 3: Через облако
1. Загрузите APK в Google Drive / Dropbox
2. Откройте на телефоне и скачайте
3. Установите

## 🔧 Текущие настройки проекта

- **Application ID:** `com.example.worldcashbox`
- **Min SDK:** 27 (Android 8.1)
- **Target SDK:** 36 (Android 14+)
- **Version Code:** 1
- **Version Name:** 1.0

## 📱 Все экраны готовы

✅ LoginActivity - Вход
✅ RegisterActivity - Регистрация  
✅ DashboardFragment - Главная
✅ ServicesFragment - Услуги
✅ HistoryFragment - История
✅ NotificationsFragment - Уведомления
✅ SettingsFragment - Настройки
✅ ProfileActivity - Профиль
✅ BalanceActivity - Баланс
✅ AnalyticsActivity - Аналитика

## 🎨 Дизайн

- Material Design компоненты
- Цветовая схема WorldCashBox
- Адаптивные layout'ы
- Bottom Navigation

## ⚠️ Важно перед сборкой

1. **Убедитесь, что backend сервер запущен**
2. **Измените BASE_URL для реального устройства**
3. **Проверьте, что все зависимости загружены**

## 🐛 Решение проблем

### Ошибка: "Unresolved reference 'R'"
- Build → Clean Project
- Build → Rebuild Project
- File → Invalidate Caches / Restart

### Ошибка подключения к API
- Проверьте, что backend запущен
- Проверьте IP адрес в RetrofitClient.kt
- Убедитесь, что телефон и компьютер в одной сети

### APK не устанавливается
- Проверьте разрешение "Неизвестные источники"
- Убедитесь, что версия Android >= 8.1

## ✅ Готово!

Ваше приложение готово к сборке и установке на Android телефон!
