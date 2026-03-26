# 📎 Настройка загрузки файлов в тикеты поддержки

## Установка зависимостей

Для загрузки медиа-файлов (фото, видео) в мобильном приложении нужно установить:

```bash
cd mobile
npx expo install expo-image-picker
```

## Что реализовано

### Backend:
1. ✅ Таблица `support_ticket_files` для хранения файлов
2. ✅ Middleware `multer` для обработки загрузки файлов
3. ✅ API endpoint `/api/support/tickets` с поддержкой файлов
4. ✅ API endpoint `/api/staff/support/tickets/:id/messages` с поддержкой файлов
5. ✅ API endpoint `/api/staff/support/tickets/:id` для получения детальной информации о тикете

### Frontend:
1. ✅ `TicketDetailScreen` - детальный просмотр тикета для инженеров
2. ✅ Полная информация о клиенте (ИНН, КПП, ОГРН, адрес, баланс)
3. ✅ Чат в тикете с возможностью отправки сообщений
4. ✅ Управление статусами тикета (как в Jira)
5. ✅ Просмотр прикрепленных файлов

### Осталось:
- ⏳ Обновить `SupportScreen` для загрузки файлов при создании тикета

## Как использовать

### Для клиентов:
1. Откройте раздел "Помощь"
2. Заполните тему и сообщение
3. (Скоро) Прикрепите фото/видео из галереи
4. Отправьте тикет

### Для инженеров:
1. Откройте кабинет поддержки
2. Выберите тикет из списка
3. Просмотрите полную информацию о клиенте
4. Просмотрите прикрепленные файлы
5. Отправьте ответ в чат
6. Измените статус тикета (Открыт → В работе → Решен → Закрыт)

## API Endpoints

### Создание тикета с файлами:
```
POST /api/support/tickets
Content-Type: multipart/form-data

{
  subject: string,
  message: string,
  priority: 'low' | 'normal' | 'high' | 'urgent',
  files: File[] (до 10 файлов, максимум 50MB каждый)
}
```

### Получение детальной информации о тикете:
```
GET /api/staff/support/tickets/:id
Authorization: Bearer <staff_token>

Response: {
  ticket: {...},
  messages: [...],
  client: {...}
}
```

### Отправка сообщения с файлами:
```
POST /api/staff/support/tickets/:id/messages
Content-Type: multipart/form-data
Authorization: Bearer <staff_token>

{
  message: string,
  files: File[] (опционально)
}
```

### Изменение статуса тикета:
```
PUT /api/staff/support/tickets/:id/status
Authorization: Bearer <staff_token>

{
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
}
```

## Структура базы данных

### Таблица `support_ticket_files`:
- `id` - ID файла
- `ticket_id` - ID тикета
- `message_id` - ID сообщения (если файл прикреплен к сообщению)
- `file_name` - Оригинальное имя файла
- `file_path` - Путь к файлу на сервере
- `file_type` - Расширение файла
- `file_size` - Размер файла в байтах
- `mime_type` - MIME тип файла
- `uploaded_by` - ID пользователя, загрузившего файл
- `uploaded_at` - Дата загрузки

## Разрешенные типы файлов

- Изображения: JPEG, JPG, PNG, GIF, WEBP
- Видео: MP4, MOV, AVI, WEBM

Максимальный размер файла: 50MB
