# 🚀 Запуск бэкенда в Android Studio

## Проблема
Файл `gradlew.bat` отсутствует. Есть несколько способов запустить бэкенд:

---

## ✅ Способ 1: Через системный Gradle (Если установлен)

### В терминале Android Studio:

```bash
cd backend-kotlin
gradle build
gradle run
```

---

## ✅ Способ 2: Открыть backend-kotlin как отдельный проект

### Шаг 1: Откройте backend-kotlin как проект

1. В Android Studio: `File` → `Open`
2. Выберите папку `backend-kotlin`
3. Android Studio откроет его как отдельный Gradle проект

### Шаг 2: Дождитесь синхронизации

Android Studio автоматически скачает Gradle и зависимости.

### Шаг 3: Запустите через конфигурацию

1. Вверху справа найдите выпадающий список конфигураций
2. Если там пусто, нажмите `Add Configuration...` → `+` → `Application`
3. Настройте:
   - **Name:** `Backend Server`
   - **Main class:** `com.worldcashbox.ApplicationKt`
   - **Working directory:** `$PROJECT_DIR$`
4. Нажмите `OK`
5. Запустите (зеленая стрелка или `Shift+F10`)

---

## ✅ Способ 3: Через Gradle панель

1. Справа откройте вкладку **"Gradle"**
2. Разверните: `backend-kotlin` → `Tasks` → `application`
3. Дважды кликните на `run`

---

## ✅ Способ 4: Использовать готовый скрипт

### В терминале Android Studio:

```bash
cd backend-kotlin
.\RUN_BACKEND.bat
```

(Если Gradle установлен в системе)

---

## ⚠️ Если Gradle не установлен

### Вариант А: Установить Gradle

1. Скачайте: https://gradle.org/install/
2. Установите и добавьте в PATH
3. Перезапустите Android Studio

### Вариант Б: Использовать IntelliJ IDEA

1. Скачайте IntelliJ IDEA Community Edition (бесплатно)
2. Откройте папку `backend-kotlin` как проект
3. IDEA автоматически настроит Gradle Wrapper
4. Запустите через конфигурацию

---

## 📝 После запуска

В консоли должно появиться:
```
🚀 Server running on port 3000
✅ Database connection established
```

Проверьте в браузере: `http://localhost:3000/health`

---

## 💡 Рекомендация

**Лучший вариант:** Откройте `backend-kotlin` как отдельный проект в Android Studio. Это самый простой способ, и Android Studio автоматически настроит всё необходимое.
