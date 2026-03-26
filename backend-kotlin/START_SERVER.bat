@echo off
echo ========================================
echo   Запуск WorldCashBox Backend Server
echo ========================================
echo.

REM Проверка наличия .env файла
if not exist .env (
    echo [ОШИБКА] Файл .env не найден!
    echo.
    echo Создаю .env из шаблона...
    copy env.template .env
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

echo [INFO] Сборка проекта...
call gradlew.bat build
if errorlevel 1 (
    echo [ОШИБКА] Ошибка сборки проекта!
    pause
    exit /b 1
)

echo.
echo [INFO] Запуск сервера...
echo.
call gradlew.bat run

pause
