# 🔧 Исправление: SBIS_LOGIN и SBIS_PASSWORD не установлены

## Проблема

В логах видно:
```
[Sync]   SBIS_LOGIN установлен: false
[Sync]   SBIS_PASSWORD установлен: false
[Sync] ⚠️  SBIS_LOGIN или SBIS_PASSWORD не установлены в переменных окружения
```

Это означает, что переменные окружения `SBIS_LOGIN` и `SBIS_PASSWORD` не загружаются из файла `.env`.

## Решение

### Шаг 1: Откройте файл `.env` в папке `backend`

Файл должен находиться по пути: `backend/.env`

### Шаг 2: Добавьте следующие переменные

Добавьте в конец файла `.env`:

```env
# СБИС Авторизация для SPP API (Все о компаниях)
# Нужны для получения полных данных организации (ОКТМО, ОКПО, ОКВЭД и т.д.)
SBIS_LOGIN=ваш_логин_сбис
SBIS_PASSWORD=ваш_пароль_сбис
SBIS_APP_CLIENT_ID=2651426000822745
SBIS_APP_SECRET=G6TMMMZWMAZ55YIP6EAV3S3D
SBIS_SECRET_KEY=7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg
```

**ВАЖНО:** Замените `ваш_логин_сбис` и `ваш_пароль_сбис` на реальные данные для входа в СБИС.

### Шаг 3: Перезапустите backend сервер

После добавления переменных в `.env` файл, **обязательно перезапустите сервер**, чтобы изменения вступили в силу:

```bash
# Остановите текущий процесс (Ctrl+C)
# Затем запустите снова:
cd backend
npm run dev
# или
npm start
```

### Шаг 4: Проверьте логи

После перезапуска и нажатия кнопки "Обновить" в приложении, в логах должно появиться:

```
[Sync]   SBIS_LOGIN установлен: true
[Sync]   SBIS_PASSWORD установлен: true
[Sync]   Выполняем авторизацию для получения SPP сессии...
[Sync]   Прямая авторизация в SPP API: https://api.sbis.ru/auth/service/
```

## Примечания

1. **Безопасность:** Файл `.env` должен быть в `.gitignore` и не должен попадать в репозиторий
2. **Формат:** В `.env` файле не должно быть пробелов вокруг знака `=`
3. **Кавычки:** Значения не нужно заключать в кавычки (кроме случаев, когда значение содержит пробелы)

## Пример полного `.env` файла

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=10.16.0.1
DB_PORT=3306
DB_NAME=wcb-service
DB_USER=wcb-service
DB_PASSWORD=Wcb12345@!

# JWT Configuration
JWT_SECRET=your_very_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# СБИС Авторизация для SPP API
SBIS_LOGIN=ваш_логин_сбис
SBIS_PASSWORD=ваш_пароль_сбис
SBIS_APP_CLIENT_ID=2651426000822745
SBIS_APP_SECRET=G6TMMMZWMAZ55YIP6EAV3S3D
SBIS_SECRET_KEY=7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg
```

## Проверка

После настройки и перезапуска сервера, при нажатии кнопки "Обновить" в приложении, данные должны начать подтягиваться из СБИС API.
