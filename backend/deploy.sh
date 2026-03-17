#!/bin/bash

# Скрипт для автоматического деплоя бэкенда
# Использование: ./deploy.sh [production|staging]

set -e  # Остановка при ошибке

ENVIRONMENT=${1:-production}
echo "🚀 Деплой в окружение: $ENVIRONMENT"

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка наличия .env файла
if [ ! -f .env ]; then
    echo -e "${RED}❌ Файл .env не найден!${NC}"
    echo "Создайте файл .env на основе env.template"
    exit 1
fi

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js не установлен!${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Установка зависимостей...${NC}"
npm install --production

echo -e "${YELLOW}🔄 Запуск миграций БД...${NC}"
npm run migrate || echo -e "${YELLOW}⚠️  Миграции не выполнены (возможно, таблицы уже существуют)${NC}"

# Если используется PM2
if command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}🔄 Перезапуск PM2...${NC}"
    pm2 restart billing-backend || pm2 start src/server.js --name billing-backend
    pm2 save
    echo -e "${GREEN}✅ Приложение запущено через PM2${NC}"
    pm2 list
else
    echo -e "${YELLOW}⚠️  PM2 не установлен. Запустите приложение вручную:${NC}"
    echo "   npm start"
    echo "   или установите PM2: npm install -g pm2"
fi

echo -e "${GREEN}✅ Деплой завершен!${NC}"
echo -e "${YELLOW}📊 Проверьте статус:${NC}"
echo "   curl http://localhost:3000/health"
