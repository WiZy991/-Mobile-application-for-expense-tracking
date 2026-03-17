const cron = require('node-cron');
const { checkExpiringResources, autoRenewResources } = require('../services/resourceMonitorService');

/**
 * Job для мониторинга ресурсов клиентов
 * Проверяет сроки действия ФН, лицензий и других ресурсов
 * Отправляет уведомления и выполняет автоматическое продление
 */

/**
 * Проверка ресурсов с приближающимся сроком действия
 * Запускается каждый день в 9:00
 */
async function monitorExpiringResources() {
  try {
    console.log('🔍 Starting resource expiration check...');
    const count = await checkExpiringResources();
    console.log(`✅ Checked ${count} expiring resources`);
  } catch (error) {
    console.error('❌ Error in resource expiration check:', error);
  }
}

/**
 * Автоматическое продление ресурсов
 * Запускается каждый день в 10:00
 */
async function performAutoRenewal() {
  try {
    console.log('🔄 Starting auto-renewal process...');
    const count = await autoRenewResources();
    console.log(`✅ Auto-renewed ${count} resources`);
  } catch (error) {
    console.error('❌ Error in auto-renewal process:', error);
  }
}

// Планировщик задач
// Проверка ресурсов каждый день в 9:00
cron.schedule('0 9 * * *', monitorExpiringResources);

// Автоматическое продление каждый день в 10:00
cron.schedule('0 10 * * *', performAutoRenewal);

console.log('✅ Resource monitor jobs scheduled');
console.log('   - Expiration check: daily at 9:00');
console.log('   - Auto-renewal: daily at 10:00');

module.exports = {
  monitorExpiringResources,
  performAutoRenewal
};
