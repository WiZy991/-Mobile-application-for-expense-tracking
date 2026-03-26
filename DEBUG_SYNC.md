# Отладка синхронизации данных клиента

## Проблема
После нажатия кнопки "Обновить" данные не подтягиваются из СБИС.

## Шаги для отладки

### 1. Проверьте логи сервера

При нажатии кнопки "Обновить" в приложении, проверьте логи backend сервера. Должны быть сообщения вида:
```
[Sync] Синхронизация данных клиента X из SBIS по ИНН: Y
[Sync] Получение OAuth токена SBIS...
[Sync] Получаем полные данные через SppAPI.Requisites...
```

### 2. Проверьте переменные окружения

Убедитесь, что в файле `backend/.env` настроены:
```env
SBIS_LOGIN=ваш_логин
SBIS_PASSWORD=ваш_пароль
SBIS_APP_CLIENT_ID=2651426000822745
SBIS_APP_SECRET=G6TMMMZWMAZ55YIP6EAV3S3D
SBIS_SECRET_KEY=7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg
```

### 3. Проверьте, что у клиента есть ИНН

В БД должно быть заполнено поле `inn` для клиента. Проверьте:
```sql
SELECT id, inn, name FROM clients WHERE id = YOUR_CLIENT_ID;
```

### 4. Проверьте авторизацию в СБИС

Проверьте, что авторизация работает:
```bash
curl -X POST http://localhost:3000/api/sbis-proxy/auth \
  -H "Content-Type: application/json" \
  -d '{
    "login": "YOUR_SBIS_LOGIN",
    "password": "YOUR_SBIS_PASSWORD",
    "userId": "test"
  }'
```

Должен вернуться ответ с `sppSessionId` или `sessionId`.

### 5. Проверьте SPP API напрямую

После авторизации, проверьте SPP API:
```bash
curl -X POST http://localhost:3000/api/sbis-proxy/spp-requisites \
  -H "Content-Type: application/json" \
  -d '{
    "inn": "253812528630",
    "userId": "test"
  }'
```

Должен вернуться ответ с данными организации.

### 6. Проверьте endpoint синхронизации

Вызовите endpoint синхронизации напрямую (с авторизацией):
```bash
curl -X POST http://localhost:3000/api/clients/sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Проверьте ответ - должны быть данные в поле `client`.

### 7. Проверьте данные в БД после синхронизации

После синхронизации проверьте БД:
```sql
SELECT 
  inn, kpp, ogrn, company_address,
  oktmo, okpo, okved,
  pf_reg_number, sfr_reg_number,
  registration_date, registration_authority
FROM clients 
WHERE id = YOUR_CLIENT_ID;
```

### 8. Проверьте endpoint /me

Проверьте, что endpoint `/me` возвращает все поля:
```bash
curl -X GET http://localhost:3000/api/clients/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Должны быть все поля, включая новые: `oktmo`, `okpo`, `okved`, `pfRegNumber`, `sfrRegNumber`, `registrationDate`, `registrationAuthority`.

## Возможные проблемы

### Проблема 1: SPP сессия не получается
**Симптом:** В логах `[Sync] ⚠️  SPP сессия не получена`

**Решение:**
- Проверьте, что `SBIS_LOGIN` и `SBIS_PASSWORD` правильные
- Проверьте, что авторизация в СБИС работает
- Возможно, нужен доступ к API "Все о компаниях" в вашем тарифе СБИС

### Проблема 2: SPP API не возвращает данные
**Симптом:** В логах `[Sync] ⚠️  SPP API не вернул данные`

**Решение:**
- Проверьте, что ИНН правильный
- Проверьте, что организация существует в СБИС
- Возможно, нужен доступ к API "Все о компаниях"

### Проблема 3: Данные не сохраняются в БД
**Симптом:** В логах видно, что данные получены, но в БД NULL

**Решение:**
- Проверьте SQL запрос на ошибки
- Проверьте, что миграция выполнена (все поля добавлены)
- Проверьте логи SQL ошибок

### Проблема 4: Данные не отображаются в приложении
**Симптом:** Данные есть в БД, но не показываются в приложении

**Решение:**
- Проверьте, что endpoint `/me` возвращает все поля
- Проверьте, что модель `Client` в Android включает все поля
- Проверьте логи Android приложения (Logcat)

## Логи для проверки

При успешной синхронизации должны быть логи:
```
[Sync] ✅ Получены данные из SPP API: inn, kpp, ogrn, name, address, oktmo, okpo, okved, ...
[Sync] ✅ Обновление oktmo: "05701000001"
[Sync] ✅ Обновление okpo: "2035362148"
[Sync] ✅ Обновление okved: "47.23.1"
[Sync] ✅ Данные клиента X обновлены в БД
```

## Тестирование

1. Откройте приложение
2. Перейдите в "Профиль"
3. Нажмите кнопку "🔄 Обновить"
4. Проверьте логи сервера
5. Проверьте данные в БД
6. Проверьте, что данные отображаются в приложении
