# Скрипт для разрешения конфликтов слияния
# Принимает удаленную версию для экранов, затем применяет исправления

Write-Host "Разрешение конфликтов слияния..." -ForegroundColor Yellow

# Принимаем удаленную версию для экранов
$screens = @(
    "mobile/src/screens/DashboardScreen.js",
    "mobile/src/screens/HistoryScreen.js",
    "mobile/src/screens/BalanceScreen.js",
    "mobile/src/screens/AnalyticsScreen.js",
    "mobile/src/screens/LoginScreen.js",
    "mobile/src/screens/RegisterScreen.js",
    "mobile/src/screens/NotificationsScreen.js"
)

foreach ($file in $screens) {
    if (Test-Path $file) {
        Write-Host "Принимаем удаленную версию: $file" -ForegroundColor Cyan
        git checkout --theirs $file
    }
}

# Принимаем удаленную версию для package-lock.json
if (Test-Path "mobile/package-lock.json") {
    Write-Host "Принимаем удаленную версию: mobile/package-lock.json" -ForegroundColor Cyan
    git checkout --theirs "mobile/package-lock.json"
}

Write-Host "`nКонфликты разрешены. Теперь нужно:" -ForegroundColor Green
Write-Host "1. Применить исправления импортов локали (import ru from вместо import { ru })" -ForegroundColor Yellow
Write-Host "2. Применить исправления обработки чисел (проверка типа перед toFixed)" -ForegroundColor Yellow
Write-Host "3. Выполнить: git add ." -ForegroundColor Yellow
Write-Host "4. Выполнить: git commit -m 'Merge: объединение версий'" -ForegroundColor Yellow
