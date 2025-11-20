# Инструкция по загрузке проекта на GitHub

## Шаг 1: Создание репозитория на GitHub

1. Войдите в свой аккаунт GitHub
2. Нажмите кнопку **"New"** или **"+"** в правом верхнем углу
3. Заполните форму:
   - **Repository name**: `billing-system` (или любое другое имя)
   - **Description**: "Система биллинга и личного кабинета клиентов с интеграцией СБИС"
   - Выберите **Public** или **Private**
   - **НЕ** ставьте галочки на "Initialize this repository with a README" (у нас уже есть файлы)
4. Нажмите **"Create repository"**

## Шаг 2: Инициализация Git в проекте

Откройте терминал в корневой папке проекта и выполните:

```bash
# Инициализация git репозитория
git init

# Добавление всех файлов
git add .

# Первый коммит
git commit -m "Initial commit: Billing system with SBIS integration"
```

## Шаг 3: Подключение к GitHub

```bash
# Добавьте remote репозиторий (замените YOUR_USERNAME на ваш GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/billing-system.git

# Или если используете SSH:
# git remote add origin git@github.com:YOUR_USERNAME/billing-system.git

# Проверьте, что remote добавлен
git remote -v
```

## Шаг 4: Загрузка на GitHub

```bash
# Переименуйте основную ветку в main (если нужно)
git branch -M main

# Загрузите код на GitHub
git push -u origin main
```

Если GitHub попросит авторизацию:
- Для HTTPS: используйте Personal Access Token (не пароль)
- Для SSH: убедитесь, что SSH ключ добавлен в GitHub

## Альтернативный способ через GitHub CLI

Если у вас установлен GitHub CLI:

```bash
# Авторизация
gh auth login

# Создание репозитория и загрузка
gh repo create billing-system --public --source=. --remote=origin --push
```

## Проверка

После загрузки откройте ваш репозиторий на GitHub:
```
https://github.com/YOUR_USERNAME/billing-system
```

Вы должны увидеть все файлы проекта.

## Важные замечания

⚠️ **НЕ загружайте файлы с секретами!**

Убедитесь, что в `.gitignore` есть:
- `.env` файлы
- `node_modules/`
- Логи и временные файлы

Если случайно загрузили `.env` с секретами:
1. Удалите файл из истории: `git rm --cached .env`
2. Добавьте в `.gitignore`
3. Сделайте коммит: `git commit -m "Remove .env from tracking"`
4. Смените все секреты в `.env` на новые!

## Создание Personal Access Token (для HTTPS)

Если GitHub требует токен вместо пароля:

1. Перейдите: https://github.com/settings/tokens
2. Нажмите **"Generate new token"** → **"Generate new token (classic)"**
3. Дайте имя токену
4. Выберите срок действия
5. Выберите права: `repo` (полный доступ к репозиториям)
6. Нажмите **"Generate token"**
7. **Скопируйте токен** (он показывается только один раз!)
8. Используйте этот токен вместо пароля при `git push`

## Дальнейшая работа

После первого push, для обновления кода:

```bash
# Добавить изменения
git add .

# Сделать коммит
git commit -m "Описание изменений"

# Загрузить на GitHub
git push
```

## Полезные команды

```bash
# Проверить статус
git status

# Посмотреть историю коммитов
git log

# Создать новую ветку
git checkout -b feature/new-feature

# Переключиться на ветку
git checkout main

# Слить ветку
git merge feature/new-feature
```

