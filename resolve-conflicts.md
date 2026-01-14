# Инструкция по разрешению конфликтов слияния

## ✅ Уже исправлено:
- `backend/src/routes/auth.js` - разрешены конфликты
- `mobile/app.json` - разрешен конфликт (принята удаленная версия, убран favicon)
- `mobile/src/screens/ServicesScreen.js` - разрешен конфликт

## Быстрое решение для оставшихся файлов:

Выполните следующие команды в PowerShell в корне проекта:

### 1. Принять удаленную версию для всех экранов с конфликтами:

```powershell
git checkout --theirs mobile/src/screens/DashboardScreen.js
git checkout --theirs mobile/src/screens/HistoryScreen.js
git checkout --theirs mobile/src/screens/BalanceScreen.js
git checkout --theirs mobile/src/screens/AnalyticsScreen.js
git checkout --theirs mobile/src/screens/LoginScreen.js
git checkout --theirs mobile/src/screens/RegisterScreen.js
git checkout --theirs mobile/src/screens/NotificationsScreen.js
git checkout --theirs mobile/package-lock.json
```

### 2. Добавить все разрешенные файлы:

```powershell
git add .
```

### 3. Завершить merge:

```powershell
git commit -m "Merge: объединение локальных исправлений с удаленной версией"
```

## После merge (опционально):

Если в удаленной версии экранов нет исправлений импортов локали и обработки чисел, их можно применить позже:

1. **Импорты локали ru** - должны быть `import ru from 'date-fns/locale/ru'` (не `import { ru }`)
2. **Обработка чисел** - использовать проверку типа перед `.toFixed()`:
   ```javascript
   {typeof value === 'number' ? value.toFixed(2) : parseFloat(value || 0).toFixed(2)}
   ```
