# 💾 Сервис кэширования контрагентов

## Описание

Сервис для кэширования данных контрагентов из СБИС CRM в PostgreSQL. Это ускоряет повторные запросы и снижает нагрузку на СБИС API.

---

## 📊 Структура БД

### Таблица `sbis_contractors`

Хранит основную информацию о контрагентах:

```sql
id                 - PRIMARY KEY
sbis_id           - ID в СБИС (UNIQUE)
inn               - ИНН
kpp               - КПП
ogrn              - ОГРН
name              - Название
short_name        - Краткое название
full_name         - Полное название
address           - Адрес
legal_address     - Юридический адрес
phone             - Телефон
email             - Email
director          - Руководитель
deals_count       - Количество сделок
documents_count   - Количество документов
total_amount      - Общая сумма сделок
last_sync_at      - Последняя синхронизация
created_at        - Дата создания
updated_at        - Дата обновления
```

### Таблица `sbis_deals`

Хранит сделки контрагентов:

```sql
id                - PRIMARY KEY
sbis_id          - ID сделки в СБИС (UNIQUE)
contractor_id    - FK -> sbis_contractors(id)
theme_id         - ID темы
theme_name       - Название темы
amount           - Сумма
status           - Статус
created_at       - Дата создания
updated_at       - Дата обновления
```

---

## 🔧 API сервиса

### 1. `saveContractor(contractorData)`

Сохраняет или обновляет контрагента в БД.

**Параметры:**
```javascript
{
  id: '123973',              // SBIS ID
  inn: '253812528630',
  kpp: '253601001',
  ogrn: '1234567890123',
  name: 'ООО "Компания"',
  shortName: 'Компания',
  fullName: 'ООО "Компания"',
  address: 'г. Москва...',
  phone: '+7 (999) 123-45-67',
  email: 'info@company.ru',
  director: 'Иванов И.И.',
  dealsCount: 5,
  documentsCount: 12,
  totalAmount: 150000
}
```

**Возвращает:** Объект контрагента из БД

**Пример использования:**
```javascript
const contractorService = require('./services/contractorService');

const savedContractor = await contractorService.saveContractor({
  id: '123973',
  inn: '253812528630',
  name: 'ООО "Компания"',
  // ... другие поля
});

console.log('Saved contractor ID:', savedContractor.id);
```

---

### 2. `findContractorByInn(inn)`

Ищет контрагента в БД по ИНН.

**Параметры:**
- `inn` (string) - ИНН контрагента

**Возвращает:** Объект контрагента или `null`

**Пример:**
```javascript
const contractor = await contractorService.findContractorByInn('253812528630');

if (contractor) {
  console.log('Найден в кэше:', contractor.name);
} else {
  console.log('Нужно запросить из СБИС');
}
```

---

### 3. `findContractorBySbisId(sbisId)`

Ищет контрагента в БД по SBIS ID.

**Параметры:**
- `sbisId` (string) - ID контрагента в СБИС

**Возвращает:** Объект контрагента или `null`

---

### 4. `saveDeal(dealData, contractorDbId)`

Сохраняет сделку в БД.

**Параметры:**
```javascript
dealData = {
  id: '201654',              // SBIS ID сделки
  themeId: '24517561',
  themeName: 'Продажи',
  amount: 50000,
  status: 'active'
}
contractorDbId = 1  // ID контрагента в нашей БД
```

**Возвращает:** Объект сделки из БД

---

### 5. `getDealsByContractorId(contractorDbId)`

Получает все сделки контрагента.

**Параметры:**
- `contractorDbId` (number) - ID контрагента в БД

**Возвращает:** Массив сделок

**Пример:**
```javascript
const deals = await contractorService.getDealsByContractorId(1);
console.log(`Найдено сделок: ${deals.length}`);
```

---

### 6. `shouldUpdateCache(lastSyncAt)`

Проверяет, нужно ли обновить кэш (прошло более 1 часа).

**Параметры:**
- `lastSyncAt` (Date) - Дата последней синхронизации

**Возвращает:** `boolean`

**Пример:**
```javascript
if (contractorService.shouldUpdateCache(contractor.last_sync_at)) {
  // Обновить из СБИС
  const fresh = await sbisGetClientFromCRM(contractor.inn);
  await contractorService.saveContractor(fresh.data.contractor);
}
```

---

## 💡 Типичные паттерны использования

### Паттерн 1: Поиск с кэшированием

```javascript
const contractorService = require('./services/contractorService');
const { sbisGetClientFromCRM, sbisAuth } = require('./api');

async function getContractor(inn) {
  // 1. Ищем в кэше
  let contractor = await contractorService.findContractorByInn(inn);
  
  // 2. Если нашли и кэш свежий - возвращаем
  if (contractor && !contractorService.shouldUpdateCache(contractor.last_sync_at)) {
    console.log('✅ Используем кэш');
    return contractor;
  }
  
  // 3. Если не нашли или кэш устарел - запрашиваем из СБИС
  console.log('🔄 Обновляем из СБИС');
  await sbisAuth('login', 'password');
  const crmResult = await sbisGetClientFromCRM(inn);
  
  if (crmResult.success && crmResult.data?.found) {
    // 4. Сохраняем в кэш
    contractor = await contractorService.saveContractor({
      id: crmResult.data.contractor.id,
      inn: crmResult.data.contractor.inn,
      name: crmResult.data.contractor.name,
      // ... остальные поля
      dealsCount: crmResult.data.deals?.length || 0,
      documentsCount: crmResult.data.documents?.length || 0,
    });
  }
  
  return contractor;
}
```

---

### Паттерн 2: Сохранение при регистрации

```javascript
// В RegisterScreen после успешного поиска в CRM
router.post('/register', async (req, res) => {
  const { inn, phone, email, password } = req.body;
  
  // 1. Поиск в CRM
  const crmResult = await sbisGetClientFromCRM(inn);
  
  if (crmResult.success && crmResult.data?.found) {
    // 2. Сохраняем контрагента в кэш
    const contractor = await contractorService.saveContractor({
      id: crmResult.data.contractor.id,
      inn: crmResult.data.contractor.inn,
      name: crmResult.data.contractor.name,
      // ...
    });
    
    // 3. Создаем пользователя со ссылкой на контрагента
    const client = await pool.query(
      `INSERT INTO clients (email, phone, password_hash, inn, sbis_contract_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [email, phone, hashedPassword, inn, contractor.sbis_id]
    );
  }
  
  res.json({ success: true });
});
```

---

### Паттерн 3: Фоновая синхронизация

```javascript
const cron = require('node-cron');

// Каждый час синхронизируем устаревшие записи
cron.schedule('0 * * * *', async () => {
  console.log('🔄 Запуск синхронизации контрагентов...');
  
  const outdated = await pool.query(`
    SELECT * FROM sbis_contractors
    WHERE last_sync_at < NOW() - INTERVAL '1 hour'
    LIMIT 10
  `);
  
  for (const contractor of outdated.rows) {
    try {
      const fresh = await sbisGetClientFromCRM(contractor.inn);
      if (fresh.success) {
        await contractorService.saveContractor(fresh.data.contractor);
        console.log(`✅ Обновлен: ${contractor.name}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка обновления ${contractor.inn}:`, error.message);
    }
  }
  
  console.log('✅ Синхронизация завершена');
});
```

---

## 🚀 Преимущества кэширования

1. **Скорость** ⚡
   - Запросы из БД в 10-100 раз быстрее чем из СБИС API
   - Нет задержек на авторизацию

2. **Надежность** 🛡️
   - Работает даже если СБИС недоступен
   - Снижает вероятность ошибок сети

3. **Экономия** 💰
   - Меньше запросов к СБИС API
   - Снижение нагрузки на серверы

4. **История** 📊
   - Храним историю изменений
   - Можем анализировать динамику

---

## ⚙️ Настройка

### 1. Миграция БД

Таблицы создаются автоматически при запуске `initDatabase()`:

```javascript
const { initDatabase } = require('./database/init');
await initDatabase();
```

### 2. Использование в коде

```javascript
const contractorService = require('./services/contractorService');

// Везде где работаем с контрагентами
const contractor = await contractorService.findContractorByInn(inn);
```

---

## 📈 Мониторинг

### SQL запросы для проверки

```sql
-- Общее количество контрагентов
SELECT COUNT(*) FROM sbis_contractors;

-- Контрагенты с устаревшим кэшем
SELECT COUNT(*) FROM sbis_contractors
WHERE last_sync_at < NOW() - INTERVAL '1 hour';

-- Топ-10 контрагентов по сумме сделок
SELECT name, total_amount, deals_count
FROM sbis_contractors
ORDER BY total_amount DESC
LIMIT 10;

-- Статистика по сделкам
SELECT 
  COUNT(*) as total_deals,
  SUM(amount) as total_amount,
  AVG(amount) as avg_amount
FROM sbis_deals;
```

---

## ✅ Готово!

Теперь у вас есть полноценное кэширование контрагентов из СБИС CRM в PostgreSQL! 🎉

**Создано:** 2 декабря 2025  
**Версия:** 1.0

