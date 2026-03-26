# Веб-фронтенд в Kotlin Backend

## ✅ Веб-интерфейс перенесен

Веб-фронтенд (HTML страницы) теперь обслуживается Kotlin backend через Ktor.

## 📁 Структура

Статические файлы находятся в:
```
backend-kotlin/src/main/resources/static/
└── staff-register.html    # Страница регистрации сотрудников
```

## 🌐 Доступные страницы

### Регистрация сотрудников
- **URL**: `http://localhost:3000/staff-register.html`
- **Описание**: Веб-форма для регистрации новых сотрудников (поддержка, менеджеры)
- **Требует**: Секретный ключ из `STAFF_REGISTRATION_KEY`

## 🔧 Как это работает

Ktor автоматически отдает статические файлы из папки `resources/static/`:

```kotlin
staticResources("/", "static")
```

Это означает:
- `http://localhost:3000/staff-register.html` → `resources/static/staff-register.html`
- `http://localhost:3000/` → редирект на `/staff-register.html`

## 📝 Добавление новых страниц

Чтобы добавить новую HTML страницу:

1. Создайте файл в `backend-kotlin/src/main/resources/static/`
2. Он автоматически будет доступен по URL: `http://localhost:3000/имя-файла.html`

## 🎨 Текущие страницы

- ✅ `staff-register.html` - Регистрация сотрудников

## 💡 Примечания

- HTML страницы используют JavaScript для работы с API
- API endpoints остались теми же (`/api/staff/register`)
- Все работает так же, как в Node.js версии
- Можно добавить больше веб-страниц при необходимости

## 🚀 Использование

1. Запустите Kotlin backend
2. Откройте в браузере: `http://localhost:3000/staff-register.html`
3. Заполните форму и зарегистрируйте сотрудника

Готово! Веб-интерфейс работает через Kotlin backend.
