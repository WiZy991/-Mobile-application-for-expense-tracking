# Исправление: инициализация Git репозитория

## Проблема
Git репозиторий не инициализирован в корневой папке проекта.

## Решение

Выполните эти команды по порядку в PowerShell:

```powershell
# 1. Убедитесь, что вы в корневой папке проекта
# Должны видеть папки backend и mobile
ls

# 2. Инициализируйте git репозиторий
git init

# 3. Добавьте remote (подключение к GitHub)
git remote add origin https://github.com/WiZy991/-Mobile-application-for-expense-tracking.git

# 4. Проверьте remote
git remote -v

# 5. Добавьте все файлы
git add .

# 6. Проверьте статус
git status

# 7. Сделайте первый коммит
git commit -m "Initial commit: Add backend and mobile folders"

# 8. Переименуйте ветку в main (если нужно)
git branch -M main

# 9. Загрузите на GitHub
git push -u origin main
```

## Если при push будет ошибка о конфликте

Если GitHub говорит, что репозиторий не пустой, выполните:

```powershell
# Получить изменения с GitHub
git pull origin main --allow-unrelated-histories

# Разрешить конфликты (если будут)
# Затем снова push
git push -u origin main
```

## Альтернатива: принудительный push (ОСТОРОЖНО!)

Только если вы уверены, что хотите перезаписать всё на GitHub:

```powershell
git push -u origin main --force
```

⚠️ **Внимание:** Это удалит всё, что было на GitHub!

