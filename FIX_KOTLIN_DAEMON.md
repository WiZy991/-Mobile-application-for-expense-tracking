# Исправление ошибки Kotlin Daemon

## Проблема
```
The daemon has terminated unexpectedly on startup attempt #1 with error code: 0
```

## Решения

### 1. Остановить все Gradle daemon процессы

**Windows (PowerShell):**
```powershell
.\gradlew.bat --stop
```

**Или через Android Studio:**
- File → Invalidate Caches / Restart
- Выберите "Invalidate and Restart"

### 2. Очистить кэш Gradle

**Windows:**
```powershell
# Очистить кэш Gradle
Remove-Item -Recurse -Force $env:USERPROFILE\.gradle\caches

# Очистить кэш Kotlin daemon
Remove-Item -Recurse -Force $env:USERPROFILE\.gradle\daemon
```

### 3. Увеличить память для Kotlin daemon

Добавьте в `gradle.properties` (в корне проекта или в `~/.gradle/gradle.properties`):

```properties
# Увеличить память для Kotlin daemon
kotlin.daemon.jvmargs=-Xmx2048m -Xms512m

# Или для всего Gradle
org.gradle.jvmargs=-Xmx2048m -Xms512m -XX:MaxMetaspaceSize=512m
```

### 4. Перезапустить Android Studio

1. Закройте Android Studio полностью
2. Откройте снова
3. Попробуйте собрать проект

### 5. Проверить версии

Убедитесь, что версии Kotlin и Gradle совместимы в `build.gradle.kts` и `gradle/wrapper/gradle-wrapper.properties`.

### 6. Если ничего не помогает

Попробуйте:
1. Удалить папку `.gradle` в корне проекта
2. Удалить папку `build` в папке `app`
3. Пересобрать проект

## Быстрое решение

1. В Android Studio: **File → Invalidate Caches / Restart**
2. Выберите **"Invalidate and Restart"**
3. После перезапуска попробуйте собрать проект снова

Это обычно решает проблему с Kotlin daemon.
