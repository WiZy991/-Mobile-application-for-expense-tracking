const cron = require('node-cron');
const { pool } = require('../database/init');
const { syncClientData, syncInvoices } = require('../services/sbisService');

/**
 * Автоматическая синхронизация данных со СБИС
 */
async function syncAllClients() {
  try {
    // Получаем всех клиентов с настроенным contract_id
    const result = await pool.query(
      'SELECT id, sbis_contract_id FROM clients WHERE sbis_contract_id IS NOT NULL'
    );

    for (const client of result.rows) {
      try {
        await syncClientData(client.id, client.sbis_contract_id);
        await syncInvoices(client.id, client.sbis_contract_id);
        console.log(`✅ Synced client ${client.id}`);
      } catch (error) {
        console.error(`❌ Failed to sync client ${client.id}:`, error.message);
      }
    }

    console.log(`Synced ${result.rows.length} clients`);
  } catch (error) {
    console.error('SBIS sync job error:', error);
  }
}

// Синхронизация каждый день в 2:00 ночи
cron.schedule('0 2 * * *', syncAllClients);

console.log('✅ SBIS sync job scheduled');

module.exports = {
  syncAllClients
};

