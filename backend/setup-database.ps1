# PowerShell скрипт для автоматической настройки PostgreSQL
# Запустите этот скрипт после установки PostgreSQL

Write-Host "🚀 Начинаем настройку базы данных PostgreSQL..." -ForegroundColor Cyan
Write-Host ""

# Запрос пароля для пользователя postgres
$postgresPassword = Read-Host "Введите пароль для пользователя postgres" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($postgresPassword)
$postgresPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Установка переменной окружения для пароля
$env:PGPASSWORD = $postgresPasswordPlain

Write-Host ""
Write-Host "📝 Создаем базу данных и пользователя..." -ForegroundColor Yellow

# Проверка подключения к PostgreSQL
try {
    $testConnection = & psql -U postgres -h localhost -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Не удалось подключиться к PostgreSQL. Проверьте:" -ForegroundColor Red
        Write-Host "   1. PostgreSQL установлен и запущен" -ForegroundColor Red
        Write-Host "   2. Пароль для пользователя postgres правильный" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Подключение к PostgreSQL успешно" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка подключения: $_" -ForegroundColor Red
    exit 1
}

# Выполнение SQL скрипта
Write-Host ""
Write-Host "📊 Создаем базу данных billing_db..." -ForegroundColor Yellow

& psql -U postgres -h localhost -f setup-database.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ База данных успешно настроена!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Следующие шаги:" -ForegroundColor Cyan
    Write-Host "   1. Создайте файл .env с настройками подключения" -ForegroundColor White
    Write-Host "   2. Запустите миграции: npm run migrate" -ForegroundColor White
    Write-Host "   3. Запустите сервер: npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 Пример содержимого файла .env:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "DB_HOST=localhost" -ForegroundColor Gray
    Write-Host "DB_PORT=5432" -ForegroundColor Gray
    Write-Host "DB_NAME=billing_db" -ForegroundColor Gray
    Write-Host "DB_USER=billing_user" -ForegroundColor Gray
    Write-Host "DB_PASSWORD=SecurePassword123" -ForegroundColor Gray
    Write-Host "JWT_SECRET=your_secret_key_here" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Произошла ошибка при настройке базы данных" -ForegroundColor Red
    Write-Host "Проверьте вывод выше для деталей" -ForegroundColor Red
}

# Очистка переменной окружения с паролем
Remove-Item Env:\PGPASSWORD

Write-Host ""
Write-Host "Нажмите любую клавишу для выхода..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

