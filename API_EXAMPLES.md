# Примеры использования API

## Аутентификация

### Регистрация
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Иван Иванов",
    "email": "ivan@example.com",
    "phone": "+79991234567",
    "password": "securepassword123"
  }'
```

Ответ:
```json
{
  "message": "Client registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "client": {
    "id": 1,
    "email": "ivan@example.com",
    "name": "Иван Иванов",
    "balance": "0.00"
  }
}
```

### Вход
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ivan@example.com",
    "password": "securepassword123"
  }'
```

## Получение информации о клиенте

```bash
curl -X GET http://localhost:3000/api/clients/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Получение баланса

```bash
curl -X GET http://localhost:3000/api/clients/balance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## История транзакций

### Все транзакции
```bash
curl -X GET "http://localhost:3000/api/payments/history?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Только начисления
```bash
curl -X GET "http://localhost:3000/api/payments/history?type=charge" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Только платежи
```bash
curl -X GET "http://localhost:3000/api/payments/history?type=payment" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### За период
```bash
curl -X GET "http://localhost:3000/api/payments/history?start_date=2024-01-01&end_date=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Аналитика

### За текущий год
```bash
curl -X GET http://localhost:3000/api/analytics/current-year \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Ответ:
```json
{
  "year": 2024,
  "total": 18940.00,
  "transaction_count": 24,
  "by_service": [
    {
      "service_name": "СБИС",
      "service_code": "sbis",
      "total_amount": 9100.00,
      "transaction_count": 12
    },
    {
      "service_name": "Эвотор",
      "service_code": "evotor",
      "total_amount": 4200.00,
      "transaction_count": 6
    }
  ],
  "by_month": [
    {
      "month": "2024-01",
      "total_amount": 1500.00,
      "transaction_count": 2
    }
  ]
}
```

### За конкретный год
```bash
curl -X GET http://localhost:3000/api/analytics/yearly/2023 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Услуги

### Мои услуги
```bash
curl -X GET http://localhost:3000/api/services/my-services \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Доступные услуги
```bash
curl -X GET http://localhost:3000/api/services/available \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## СБИС интеграция

### Синхронизация данных
```bash
curl -X POST http://localhost:3000/api/sbis/sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Логи синхронизации
```bash
curl -X GET "http://localhost:3000/api/sbis/sync-logs?limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Уведомления

### Получить все уведомления
```bash
curl -X GET "http://localhost:3000/api/notifications?limit=100" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Только непрочитанные
```bash
curl -X GET "http://localhost:3000/api/notifications?is_read=false" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Отметить как прочитанное
```bash
curl -X PUT http://localhost:3000/api/notifications/1/read \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Отметить все как прочитанные
```bash
curl -X PUT http://localhost:3000/api/notifications/read-all \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## JavaScript/TypeScript примеры

### Использование с fetch
```javascript
const API_URL = 'http://localhost:3000/api';
const token = 'YOUR_TOKEN';

// Получить баланс
async function getBalance() {
  const response = await fetch(`${API_URL}/clients/balance`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  console.log('Balance:', data.balance);
}

// Получить аналитику
async function getAnalytics(year) {
  const response = await fetch(`${API_URL}/analytics/yearly/${year}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  console.log(`Total for ${year}:`, data.total);
  console.log('By service:', data.by_service);
}
```

### Использование с axios
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Получить историю транзакций
async function getHistory(page = 1) {
  const response = await api.get('/payments/history', {
    params: { page, limit: 20 }
  });
  return response.data;
}

// Синхронизация со СБИС
async function syncSBIS() {
  const response = await api.post('/sbis/sync');
  return response.data;
}
```

