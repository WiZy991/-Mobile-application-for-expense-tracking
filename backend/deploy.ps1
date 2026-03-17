# PowerShell скрипт для автоматического деплоя бэкенда на Windows
# Использование: .\deploy.ps1 [production|staging]

param(
    [string]$Environment = "production"
)

Write-Host "🚀 Деплой в окружение: $Environment" -ForegroundColor Cyan

# Проверка наличия .env файла
if (-not (Test-Path ".env")) {
    Write-Host "❌ Файл .env не найден!" -ForegroundColor Red
    Write-Host "Создайте файл .env на основе env.template" -ForegroundColor Yellow
    exit 1
}

# Проверка Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js установлен: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js не установлен!" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Установка зависимостей..." -ForegroundColor Yellow
npm install --production

Write-Host "🔄 Запуск миграций БД..." -ForegroundColor Yellow
try {
    npm run migrate
    Write-Host "✅ Миграции выполнены" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Миграции не выполнены (возможно, таблицы уже существуют)" -ForegroundColor Yellow
}

# Проверка PM2
try {
    $pm2Version = pm2 --version
    Write-Host "✅ PM2 установлен: $pm2Version" -ForegroundColor Green
    
    Write-Host "🔄 Перезапуск PM2..." -ForegroundColor Yellow
    pm2 restart billing-backend 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Создание нового процесса PM2..." -ForegroundColor Yellow
        pm2 start src/server.js --name billing-backend
    }
    pm2 save
    Write-Host "✅ Приложение запущено через PM2" -ForegroundColor Green
    pm2 list
} catch {
    Write-Host "⚠️  PM2 не установлен. Запустите приложение вручную:" -ForegroundColor Yellow
    Write-Host "   npm start" -ForegroundColor White
    Write-Host "   или установите PM2: npm install -g pm2" -ForegroundColor White
}

Write-Host "✅ Деплой завершен!" -ForegroundColor Green
Write-Host "📊 Проверьте статус:" -ForegroundColor Yellow
Write-Host "   curl http://localhost:3000/health" -ForegroundColor White
