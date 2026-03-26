@echo off
chcp 65001 >nul
echo ========================================
echo   Запуск WorldCashBox Backend Server
echo ========================================
echo.

REM Проверка наличия .env файла
if not exist .env (
    echo [ОШИБКА] Файл .env не найден!
    echo.
    echo Создаю .env из шаблона...
    copy env.template .env >nul
    echo.
    echo [ВАЖНО] Отредактируйте файл .env и укажите:
    echo   - DB_PASSWORD (пароль от PostgreSQL)
    echo   - JWT_SECRET (любой секретный ключ)
    echo.
    pause
    exit /b 1
)

echo [INFO] Проверка .env файла...
findstr /C:"JWT_SECRET" .env >nul
if errorlevel 1 (
    echo [ОШИБКА] JWT_SECRET не найден в .env файле!
    echo Откройте .env и добавьте: JWT_SECRET=ваш_секретный_ключ
    pause
    exit /b 1
)

echo [INFO] Поиск Gradle...
where gradle >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Gradle не найден в PATH!
    echo.
    echo Попробуйте один из вариантов:
    echo 1. Установите Gradle: https://gradle.org/install/
    echo 2. Используйте Android Studio: File ^> Open ^> выберите папку backend-kotlin
    echo 3. Используйте IntelliJ IDEA для запуска бэкенда
    echo.
    pause
    exit /b 1
)

echo [INFO] Сборка проекта...
call gradle build
if errorlevel 1 (
    echo [ОШИБКА] Ошибка сборки проекта!
    pause
    exit /b 1
)

echo.
echo [INFO] Запуск сервера...
echo [INFO] Сервер будет доступен на http://localhost:3000
echo [INFO] Для остановки нажмите Ctrl+C
echo.
call gradle run

pause
