# Быстрое исправление: добавление backend и mobile на GitHub

## Проблема
Папки `backend` и `mobile` не были загружены на GitHub.

## Решение

Выполните эти команды в PowerShell в папке проекта:

```powershell
# 1. Добавить все файлы (включая backend и mobile)
git add .

# 2. Проверить, что добавилось
git status

# 3. Сделать коммит
git commit -m "Add backend and mobile folders"

# 4. Загрузить на GitHub
git push origin main
```

## Если команды не работают из-за кириллицы в пути

Попробуйте через Git Bash или выполните команды по отдельности:

```powershell
# Перейти в папку проекта
cd "C:\Users\Антон\Desktop\Приложение"

# Добавить backend
git add backend/

# Добавить mobile
git add mobile/

# Добавить остальные файлы
git add .

# Коммит
git commit -m "Add backend and mobile folders"

# Push
git push origin main
```

## Альтернатива: через GitHub Desktop

1. Откройте GitHub Desktop
2. Выберите ваш репозиторий
3. Вы увидите изменения (backend и mobile)
4. Напишите коммит сообщение: "Add backend and mobile folders"
5. Нажмите "Commit to main"
6. Нажмите "Push origin"

