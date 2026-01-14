# Скрипт для тестирования СБИС CRM интеграции
# Использование: .\test-sbis-crm.ps1 [test_name]

param(
    [string]$TestName = "all"
)

Write-Host "`n" -NoNewline
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           ТЕСТИРОВАНИЕ СБИС CRM ИНТЕГРАЦИИ               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Проверяем, запущен ли backend
$backendRunning = Get-Process node -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*src/server.js*"}

if (-not $backendRunning) {
    Write-Host "⚠️  Backend не запущен!" -ForegroundColor Yellow
    Write-Host "   Запустите: cd backend; npm start" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "✅ Backend запущен`n" -ForegroundColor Green

switch ($TestName) {
    "full" {
        Write-Host "🎯 Запуск полного теста (контрагент + клиент + сделка)..." -ForegroundColor Cyan
        node backend/test-crm-full-workflow.js
    }
    "simple" {
        Write-Host "🎯 Запуск простого теста (только контрагент)..." -ForegroundColor Cyan
        node backend/test-crm-simple.js
    }
    "format" {
        Write-Host "🎯 Запуск теста форматов..." -ForegroundColor Cyan
        node backend/test-correct-format.js
    }
    "all" {
        Write-Host "🎯 Запуск всех тестов...`n" -ForegroundColor Cyan
        
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Gray
        Write-Host "ТЕСТ 1: Простой поиск контрагента" -ForegroundColor Yellow
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Gray
        node backend/test-crm-simple.js
        
        Write-Host "`n`n═══════════════════════════════════════════════════════════" -ForegroundColor Gray
        Write-Host "ТЕСТ 2: Полный workflow (контрагент + клиент + сделка)" -ForegroundColor Yellow
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Gray
        node backend/test-crm-full-workflow.js
    }
    default {
        Write-Host "❌ Неизвестный тест: $TestName" -ForegroundColor Red
        Write-Host ""
        Write-Host "Доступные тесты:" -ForegroundColor Yellow
        Write-Host "  full    - Полный workflow (контрагент + клиент + сделка)" -ForegroundColor White
        Write-Host "  simple  - Простой поиск контрагента" -ForegroundColor White
        Write-Host "  format  - Тест форматов запросов" -ForegroundColor White
        Write-Host "  all     - Все тесты (по умолчанию)" -ForegroundColor White
        Write-Host ""
        exit 1
    }
}

Write-Host "`n✅ Тестирование завершено!`n" -ForegroundColor Green

