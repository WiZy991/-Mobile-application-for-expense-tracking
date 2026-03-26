# Миграция проекта на Kotlin

## 📋 Обзор

Проект мигрируется с JavaScript/TypeScript на Kotlin для:
- **Backend**: Node.js/Express → Kotlin/Ktor
- **Mobile**: React Native → Нативный Android Kotlin (уже готово в `app/`)
- **Backend**: Node.js → Kotlin (в процессе)

## ✅ Что уже сделано

### Android приложение
- ✅ Полностью на Kotlin в папке `app/`
- ✅ Все экраны готовы
- ✅ API интеграция настроена

### Backend (Kotlin)
- ✅ Создана структура проекта `backend-kotlin/`
- ✅ Настроен Ktor сервер
- ✅ Инициализация базы данных
- ✅ Аутентификация (JWT) для клиентов и сотрудников
- ✅ **Все 14 роутов перенесены**:
  - auth, clients, services, payments, notifications, subscriptions
  - analytics, resources, recommendations
  - sbis, sbis-proxy, sbis-resources
  - support, staff
- ✅ Middleware для аутентификации (клиенты и сотрудники)
- ✅ Модели данных (все основные модели)
- ✅ Утилиты (JWT, Password hashing)
- ✅ Фоновые задачи (структура)
- ✅ **Совместимость с Android приложением**

## 🔄 Что нужно сделать

### Backend миграция

1. **Перенести все роуты:**
   - [x] auth
   - [x] clients
   - [x] services
   - [x] payments
   - [x] notifications
   - [x] subscriptions
   - [x] analytics
   - [x] sbis
   - [x] sbis-proxy
   - [x] sbis-resources
   - [x] support
   - [x] recommendations
   - [x] staff
   - [x] resources

2. **Перенести сервисы:**
   - [ ] sbisService
   - [ ] subscriptionService
   - [ ] notificationService
   - [ ] resourceMonitorService
   - [ ] contractorService

3. **Перенести фоновые задачи:**
   - [ ] paymentReminder
   - [ ] sbisSync
   - [ ] resourceMonitor
   - [ ] subscriptionMonitor

4. **Перенести middleware:**
   - [x] auth
   - [ ] upload (multer → Ktor multipart)

## 📁 Структура проекта после миграции

```
project/
├── app/                          # Android приложение (Kotlin) ✅
├── backend-kotlin/               # Backend (Kotlin) 🔄
│   ├── src/main/kotlin/
│   │   ├── Application.kt
│   │   ├── database/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── jobs/
│   │   └── ...
│   └── build.gradle.kts
├── backend/                      # Старый Node.js backend (можно удалить после миграции)
└── mobile/                       # Старое React Native приложение (можно удалить)
```

## 🚀 Как использовать новый backend

1. **Перейдите в папку backend-kotlin:**
```bash
cd backend-kotlin
```

2. **Настройте переменные окружения:**
```bash
cp env.template .env
# Отредактируйте .env файл
```

3. **Соберите и запустите:**
```bash
./gradlew build
./gradlew run
```

## 📝 Примечания

- Старый Node.js backend в папке `backend/` можно оставить для справки или удалить после полной миграции
- React Native приложение в папке `mobile/` можно удалить, так как уже есть нативный Android
- Все API endpoints остаются теми же, поэтому Android приложение будет работать без изменений

## 🔧 Следующие шаги

1. Продолжить перенос роутов из Node.js в Kotlin
2. Перенести бизнес-логику из services
3. Реализовать фоновые задачи
4. Протестировать все endpoints
5. Удалить старый Node.js backend после полной миграции
