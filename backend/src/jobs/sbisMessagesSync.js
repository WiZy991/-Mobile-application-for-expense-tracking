const cron = require('node-cron');
const { pool, dbQuery } = require('../database/init');
const { getSBISMessages } = require('../routes/sbisProxy');

/**
 * Синхронизация сообщений из SBIS для всех тикетов
 */
async function syncSBISMessages() {
  try {
    // Получаем все тикеты с sbis_task_id
    const result = await dbQuery(
      'SELECT id, sbis_task_id, sbis_dialog_id FROM support_tickets WHERE sbis_task_id IS NOT NULL'
    );

    let syncedCount = 0;
    let errorCount = 0;

    for (const ticket of result.rows) {
      try {
        // Получаем сообщения из SBIS
        const sbisMessages = await getSBISMessages(ticket.sbis_task_id, 'default');
        
        // Получаем существующие сообщения с их типами для проверки
        const existingMessagesWithTypes = await dbQuery(
          'SELECT id, sbis_message_id, user_type, user_id FROM support_messages WHERE ticket_id = $1 AND sbis_message_id IS NOT NULL',
          [ticket.id]
        );
        const existingIds = new Set(existingMessagesWithTypes.rows.map(m => m.sbis_message_id));
        const existingMessagesMap = new Map(existingMessagesWithTypes.rows.map(m => [m.sbis_message_id, m]));
        
        // Получаем client_id для проверки
        const ticketInfo = await dbQuery(
          'SELECT client_id FROM support_tickets WHERE id = $1',
          [ticket.id]
        );
        const clientId = ticketInfo.rows[0]?.client_id;
        
        // Добавляем новые сообщения из SBIS в БД и обновляем существующие с неправильным типом.
        // Логика такая же, как в /support/tickets/:id:
        //  - сообщения с isFromMobileClient=true считаем клиентскими;
        //  - остальные — сообщениями поддержки.
        let newMessagesCount = 0;
        let updatedMessagesCount = 0;
        for (const sbisMsg of sbisMessages) {
          if (!sbisMsg.messageId) {
            continue;
          }
          
          const existingMsg = existingMessagesMap.get(sbisMsg.messageId);
          if (existingMsg) {
            // Сообщение уже есть в БД – ничего не меняем, чтобы не портить тип
            continue;
          }
          
          // Новое сообщение - определяем тип и добавляем
          const isFromMobileClient = !!sbisMsg.isFromMobileClient;
          const userType = isFromMobileClient ? 'client' : 'support';
          const userId = isFromMobileClient ? clientId : null;

          try {
            await dbQuery(
              `INSERT INTO support_messages (ticket_id, user_id, user_type, message, sbis_message_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                ticket.id,
                userId,
                userType,
                sbisMsg.text || '',
                sbisMsg.messageId,
                sbisMsg.dateSend ? new Date(sbisMsg.dateSend) : new Date()
              ]
            );
            newMessagesCount++;
          } catch (insertError) {
            // Игнорируем ошибки добавления
          }
        }
        
        // Обновляем sbis_dialog_id, если он был получен из первого сообщения
        if (sbisMessages.length > 0 && sbisMessages[0].dialogId && !ticket.sbis_dialog_id) {
          try {
            await dbQuery(
              'UPDATE support_tickets SET sbis_dialog_id = $1 WHERE id = $2',
              [sbisMessages[0].dialogId, ticket.id]
            );
          } catch (updateError) {
            // Игнорируем ошибки обновления
          }
        }
        
        if (newMessagesCount > 0 || updatedMessagesCount > 0) {
          syncedCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }
  } catch (error) {
    // Игнорируем критические ошибки
  }
}

// Синхронизация каждые 5 минут
cron.schedule('*/5 * * * *', syncSBISMessages);

console.log('✅ SBIS messages sync job scheduled (every 5 minutes)');

module.exports = {
  syncSBISMessages
};
