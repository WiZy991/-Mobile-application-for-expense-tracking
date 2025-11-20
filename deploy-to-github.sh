#!/bin/bash
# Bash скрипт для загрузки проекта на GitHub
# Запустите: chmod +x deploy-to-github.sh && ./deploy-to-github.sh

echo "🚀 Подготовка к загрузке на GitHub..."

# Проверка, инициализирован ли git
if [ ! -d .git ]; then
    echo "📦 Инициализация Git репозитория..."
    git init
fi

# Добавление всех файлов
echo "📝 Добавление файлов..."
git add .

# Проверка статуса
echo ""
echo "📊 Статус репозитория:"
git status

# Запрос на коммит
echo ""
read -p "💬 Введите сообщение коммита (или нажмите Enter для 'Initial commit'): " commit_message
if [ -z "$commit_message" ]; then
    commit_message="Initial commit: Billing system with SBIS integration"
fi

echo "💾 Создание коммита..."
git commit -m "$commit_message"

# Проверка remote
if ! git remote | grep -q "origin"; then
    echo ""
    echo "🔗 Необходимо добавить remote репозиторий"
    read -p "Введите URL вашего GitHub репозитория (например: https://github.com/USERNAME/REPO.git): " repo_url
    
    if [ ! -z "$repo_url" ]; then
        git remote add origin "$repo_url"
        echo "✅ Remote добавлен"
    else
        echo "❌ URL не указан. Добавьте remote вручную:"
        echo "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git"
        exit 1
    fi
fi

# Переименование ветки в main
echo ""
echo "🌿 Настройка ветки main..."
git branch -M main

# Загрузка на GitHub
echo ""
echo "⬆️  Загрузка на GitHub..."
echo "   (Может потребоваться авторизация)"

if git push -u origin main; then
    echo ""
    echo "✅ Проект успешно загружен на GitHub!"
else
    echo ""
    echo "❌ Ошибка при загрузке. Проверьте:"
    echo "   1. Правильность URL репозитория"
    echo "   2. Наличие Personal Access Token (для HTTPS)"
    echo "   3. Права доступа к репозиторию"
fi

