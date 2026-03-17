const cron = require('node-cron');
const { checkSubscriptionsForRenewal, checkExpiringSubscriptions } = require('../services/subscriptionService');

/**
 * Job для мониторинга подписок
 * Проверяет сроки действия подписок и выполняет автоматическое продление
 */

/**
 * Проверка подписок с приближающимся сроком окончания
 * Запускается каждый день в 8:00
 */
async function monitorExpiringSubscriptions() {
  try {
    console.log('🔍 Starting subscription expiration check...');
    const count = await checkExpiringSubscriptions();
    console.log(`✅ Checked ${count} expiring subscriptions`);
  } catch (error) {
    console.error('❌ Error in subscription expiration check:', error);
  }
}

/**
 * Автоматическое продление подписок
 * Запускается каждый день в 9:30
 */
async function performSubscriptionRenewal() {
  try {
    console.log('🔄 Starting subscription auto-renewal process...');
    const count = await checkSubscriptionsForRenewal();
    console.log(`✅ Auto-renewed ${count} subscriptions`);
  } catch (error) {
    console.error('❌ Error in subscription auto-renewal process:', error);
  }
}

// Планировщик задач
// Проверка подписок каждый день в 8:00
cron.schedule('0 8 * * *', monitorExpiringSubscriptions);

// Автоматическое продление каждый день в 9:30
cron.schedule('30 9 * * *', performSubscriptionRenewal);

console.log('✅ Subscription monitor jobs scheduled');
console.log('   - Expiration check: daily at 8:00');
console.log('   - Auto-renewal: daily at 9:30');

module.exports = {
  monitorExpiringSubscriptions,
  performSubscriptionRenewal
};
