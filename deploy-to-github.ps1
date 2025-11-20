# PowerShell скрипт для загрузки проекта на GitHub
# Запустите: .\deploy-to-github.ps1

Write-Host "🚀 Подготовка к загрузке на GitHub..." -ForegroundColor Green

# Проверка, инициализирован ли git
if (-not (Test-Path .git)) {
    Write-Host "📦 Инициализация Git репозитория..." -ForegroundColor Yellow
    git init
}

# Добавление всех файлов
Write-Host "📝 Добавление файлов..." -ForegroundColor Yellow
git add .

# Проверка статуса
Write-Host "`n📊 Статус репозитория:" -ForegroundColor Cyan
git status

# Запрос на коммит
$commitMessage = Read-Host "`n💬 Введите сообщение коммита (или нажмите Enter для 'Initial commit')"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Initial commit: Billing system with SBIS integration"
}

Write-Host "💾 Создание коммита..." -ForegroundColor Yellow
git commit -m $commitMessage

# Проверка remote
$remoteExists = git remote | Select-String -Pattern "origin"
if (-not $remoteExists) {
    Write-Host "`n🔗 Необходимо добавить remote репозиторий" -ForegroundColor Yellow
    $repoUrl = Read-Host "Введите URL вашего GitHub репозитория (например: https://github.com/USERNAME/REPO.git)"
    
    if (-not [string]::IsNullOrWhiteSpace($repoUrl)) {
        git remote add origin $repoUrl
        Write-Host "✅ Remote добавлен" -ForegroundColor Green
    } else {
        Write-Host "❌ URL не указан. Добавьте remote вручную:" -ForegroundColor Red
        Write-Host "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git" -ForegroundColor Yellow
        exit
    }
}

# Переименование ветки в main
Write-Host "`n🌿 Настройка ветки main..." -ForegroundColor Yellow
git branch -M main

# Загрузка на GitHub
Write-Host "`n⬆️  Загрузка на GitHub..." -ForegroundColor Yellow
Write-Host "   (Может потребоваться авторизация)" -ForegroundColor Gray

try {
    git push -u origin main
    Write-Host "`n✅ Проект успешно загружен на GitHub!" -ForegroundColor Green
} catch {
    Write-Host "`n❌ Ошибка при загрузке. Проверьте:" -ForegroundColor Red
    Write-Host "   1. Правильность URL репозитория" -ForegroundColor Yellow
    Write-Host "   2. Наличие Personal Access Token (для HTTPS)" -ForegroundColor Yellow
    Write-Host "   3. Права доступа к репозиторию" -ForegroundColor Yellow
}

