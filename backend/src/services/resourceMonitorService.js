const { pool, dbQuery, isMySQL } = require('../database/init');
const { sendNotification } = require('./notificationService');
const axios = require('axios');

/**
 * Сервис для мониторинга и автоматического продления ресурсов клиентов
 * (ФН, лицензии Эвотор, Атол, ОФД и т.д.)
 */

// Пороги для уведомлений (в днях до окончания срока)
const NOTIFICATION_THRESHOLDS = {
  urgent: 7,    // Срочно - 7 дней
  warning: 30,  // Предупреждение - 30 дней
  info: 60      // Информация - 60 дней
};

/**
 * Проверка ресурсов с приближающимся сроком действия
 */
async function checkExpiringResources() {
  try {
    const today = new Date();
    const urgentDate = new Date(today);
    urgentDate.setDate(urgentDate.getDate() + NOTIFICATION_THRESHOLDS.urgent);
    
    const warningDate = new Date(today);
    warningDate.setDate(warningDate.getDate() + NOTIFICATION_THRESHOLDS.warning);
    
    const infoDate = new Date(today);
    infoDate.setDate(infoDate.getDate() + NOTIFICATION_THRESHOLDS.info);

    // Находим ресурсы, которые скоро истекают
    const result = await dbQuery(`
      SELECT 
        cr.*,
        c.id as client_id,
        c.name as client_name,
        c.email,
        c.balance,
        c.inn
      FROM client_resources cr
      JOIN clients c ON cr.client_id = c.id
      WHERE cr.status IN ('active', 'expiring_soon')
        AND cr.expiry_date BETWEEN $1 AND $2
        AND (cr.last_notified_at IS NULL 
             OR cr.last_notified_at < ${isMySQL ? "DATE_SUB(NOW(), INTERVAL 7 DAY)" : "NOW() - INTERVAL '7 days'"})
        AND cr.renewal_notification_sent = false
      ORDER BY cr.expiry_date ASC
    `, [today.toISOString().split('T')[0], urgentDate.toISOString().split('T')[0]]);

    console.log(`🔍 Found ${result.rows.length} resources expiring soon`);

    for (const resource of result.rows) {
      const daysUntilExpiry = Math.ceil(
        (new Date(resource.expiry_date) - today) / (1000 * 60 * 60 * 24)
      );

      let priority = 'normal';
      let title = '';
      let message = '';

      if (daysUntilExpiry <= NOTIFICATION_THRESHOLDS.urgent) {
        priority = 'urgent';
        title = `⚠️ СРОЧНО: ${resource.resource_name} истекает через ${daysUntilExpiry} ${getDayWord(daysUntilExpiry)}`;
        message = `Ваш ${getResourceTypeName(resource.resource_type)} "${resource.resource_name}" истекает ${formatDate(resource.expiry_date)}.\n\n`;
        
        if (resource.auto_renewal && resource.renewal_price > 0) {
          message += `Автоматическое продление: ${resource.renewal_price.toLocaleString('ru-RU')} ₽\n`;
          message += `Текущий баланс: ${parseFloat(resource.balance).toLocaleString('ru-RU')} ₽\n\n`;
          
          if (parseFloat(resource.balance) >= resource.renewal_price) {
            message += `✅ На балансе достаточно средств. Продление произойдет автоматически.`;
          } else {
            message += `❌ Недостаточно средств для автоматического продления. Пополните баланс.`;
          }
        } else {
          message += `Стоимость продления: ${resource.renewal_price.toLocaleString('ru-RU')} ₽\n`;
          message += `Пожалуйста, продлите ${getResourceTypeName(resource.resource_type)} в ближайшее время.`;
        }
      } else if (daysUntilExpiry <= NOTIFICATION_THRESHOLDS.warning) {
        priority = 'high';
        title = `📅 ${resource.resource_name} истекает через ${daysUntilExpiry} ${getDayWord(daysUntilExpiry)}`;
        message = `Ваш ${getResourceTypeName(resource.resource_type)} "${resource.resource_name}" истекает ${formatDate(resource.expiry_date)}.\n\n`;
        message += `Стоимость продления: ${resource.renewal_price.toLocaleString('ru-RU')} ₽`;
      } else {
        priority = 'normal';
        title = `ℹ️ ${resource.resource_name} истекает через ${daysUntilExpiry} ${getDayWord(daysUntilExpiry)}`;
        message = `Ваш ${getResourceTypeName(resource.resource_type)} "${resource.resource_name}" истекает ${formatDate(resource.expiry_date)}.\n\n`;
        message += `Стоимость продления: ${resource.renewal_price.toLocaleString('ru-RU')} ₽`;
      }

      // Отправляем уведомление
      await sendNotification(
        resource.client_id,
        'resource_expiring',
        title,
        message,
        {
          sendEmail: true
        }
      );

      // Создаем уведомление в БД с related_id
      await dbQuery(
        `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          resource.client_id,
          'resource_expiring',
          title,
          message,
          resource.id,
          'resource'
        ]
      );

      // Обновляем статус ресурса
      await dbQuery(`
        UPDATE client_resources
        SET 
          status = CASE 
            WHEN expiry_date <= $1 THEN 'expiring_soon'
            ELSE status
          END,
          last_notified_at = NOW(),
          renewal_notification_sent = CASE 
            WHEN expiry_date <= $2 THEN true
            ELSE renewal_notification_sent
          END,
          updated_at = NOW()
        WHERE id = $3
      `, [
        urgentDate.toISOString().split('T')[0],
        urgentDate.toISOString().split('T')[0],
        resource.id
      ]);

      console.log(`✅ Sent notification for resource ${resource.id} (${resource.resource_name})`);
    }

    return result.rows.length;
  } catch (error) {
    console.error('Error checking expiring resources:', error);
    throw error;
  }
}

/**
 * Автоматическое продление ресурсов при наличии средств
 */
async function autoRenewResources() {
  try {
    const today = new Date();
    const renewalDate = new Date(today);
    renewalDate.setDate(renewalDate.getDate() + 3); // Продлеваем за 3 дня до окончания

    // Находим ресурсы с включенным автопродлением и достаточным балансом
    const result = await dbQuery(`
      SELECT 
        cr.*,
        c.id as client_id,
        c.name as client_name,
        c.email,
        c.balance,
        c.inn,
        c.kpp
      FROM client_resources cr
      JOIN clients c ON cr.client_id = c.id
      WHERE cr.auto_renewal = true
        AND cr.status IN ('active', 'expiring_soon')
        AND cr.expiry_date BETWEEN $1 AND $2
        AND cr.renewal_price > 0
        AND c.balance >= cr.renewal_price
        AND cr.status != 'renewed'
      ORDER BY cr.expiry_date ASC
    `, [today.toISOString().split('T')[0], renewalDate.toISOString().split('T')[0]]);

    console.log(`🔄 Found ${result.rows.length} resources ready for auto-renewal`);

    for (const resource of result.rows) {
      try {
        await renewResource(resource);
        console.log(`✅ Auto-renewed resource ${resource.id} (${resource.resource_name})`);
      } catch (error) {
        console.error(`❌ Failed to auto-renew resource ${resource.id}:`, error.message);
        
        // Отправляем уведомление об ошибке
        await sendNotification(
          resource.client_id,
          'resource_renewal_failed',
          'Ошибка автоматического продления',
          `Не удалось автоматически продлить ${getResourceTypeName(resource.resource_type)} "${resource.resource_name}". Пожалуйста, свяжитесь с поддержкой.`,
          {
            sendEmail: true
          }
        );

        await dbQuery(
          `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            resource.client_id,
            'resource_renewal_failed',
            'Ошибка автоматического продления',
            `Не удалось автоматически продлить ${getResourceTypeName(resource.resource_type)} "${resource.resource_name}". Пожалуйста, свяжитесь с поддержкой.`,
            resource.id,
            'resource'
          ]
        );
      }
    }

    return result.rows.length;
  } catch (error) {
    console.error('Error auto-renewing resources:', error);
    throw error;
  }
}

/**
 * Продление ресурса
 */
async function renewResource(resource) {
  const client = isMySQL ? await pool.getConnection() : await pool.connect();
  
  try {
    if (isMySQL) {
      await client.beginTransaction();
    } else {
      await client.query('BEGIN');
    }

    // Проверяем баланс еще раз
    const clientResult = await dbQuery(
      'SELECT balance FROM clients WHERE id = $1 FOR UPDATE',
      [resource.client_id],
      client
    );

    if (clientResult.rows.length === 0) {
      throw new Error('Client not found');
    }

    const currentBalance = parseFloat(clientResult.rows[0].balance);

    if (currentBalance < resource.renewal_price) {
      throw new Error('Insufficient balance');
    }

    // Вычисляем новую дату окончания (обычно +1 год для лицензий)
    const newExpiryDate = new Date(resource.expiry_date);
    newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);

    // Списываем с баланса
    await dbQuery(
      'UPDATE clients SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [resource.renewal_price, resource.client_id],
      client
    );

    // Создаем транзакцию
    await dbQuery(`
      INSERT INTO transactions 
      (client_id, type, amount, description, status, sbis_invoice_id)
      VALUES ($1, 'charge', $2, $3, 'completed', $4)
    `, [
      resource.client_id,
      resource.renewal_price,
      `Автоматическое продление: ${resource.resource_name}`,
      null // sbis_invoice_id будет добавлен при создании счета
    ], client);

    // Обновляем ресурс
    await dbQuery(`
      UPDATE client_resources
      SET 
        expiry_date = $1,
        start_date = $2,
        status = 'renewed',
        renewal_notification_sent = false,
        last_notified_at = NULL,
        updated_at = NOW()
      WHERE id = $3
    `, [
      newExpiryDate.toISOString().split('T')[0],
      new Date().toISOString().split('T')[0],
      resource.id
    ], client);

    // Создаем счет в СБИС (если есть ИНН)
    if (resource.inn) {
      try {
        const invoiceData = {
          buyerINN: resource.inn,
          buyerName: resource.client_name,
          buyerKPP: resource.kpp || null,
          sellerINN: process.env.SBIS_SELLER_INN || '2543082240',
          amount: resource.renewal_price,
          description: `Продление: ${resource.resource_name}`,
          items: [{
            name: `Продление ${getResourceTypeName(resource.resource_type)}: ${resource.resource_name}`,
            quantity: 1,
            price: resource.renewal_price,
            total: resource.renewal_price,
            unit: 'шт',
          }],
          comment: `Автоматическое продление ${getResourceTypeName(resource.resource_type)} "${resource.resource_name}" через приложение WorldCashBox`,
        };

        // Вызываем внутренний API для создания счета
        // Используем localhost для внутренних вызовов
        const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const invoiceResponse = await axios.post(
          `${apiBaseUrl}/api/sbis-proxy/create-invoice`,
          {
            invoiceData,
            userId: 'default',
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        if (invoiceResponse.data && invoiceResponse.data.id) {
          // Обновляем транзакцию с ID счета
          await dbQuery(
            'UPDATE transactions SET sbis_invoice_id = $1 WHERE client_id = $2 AND description LIKE $3 ORDER BY created_at DESC LIMIT 1',
            [invoiceResponse.data.id, resource.client_id, `%${resource.resource_name}%`],
            client
          );
        }
      } catch (sbisError) {
        console.warn('⚠️ Не удалось создать счет в СБИС:', sbisError.message);
        // Не блокируем продление, если не удалось создать счет
      }
    }

    // Отправляем уведомление об успешном продлении
    const renewalMessage = `${getResourceTypeName(resource.resource_type)} "${resource.resource_name}" успешно продлен до ${formatDate(newExpiryDate)}.\n\nСписано: ${resource.renewal_price.toLocaleString('ru-RU')} ₽`;
    
    await sendNotification(
      resource.client_id,
      'resource_renewed',
      '✅ Ресурс успешно продлен',
      renewalMessage,
      {
        sendEmail: true
      }
    );

    await pool.query(
      `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        resource.client_id,
        'resource_renewed',
        '✅ Ресурс успешно продлен',
        renewalMessage,
        resource.id,
        'resource'
      ]
    );

    if (isMySQL) {
      await client.commit();
    } else {
      await client.query('COMMIT');
    }
  } catch (error) {
    try {
      if (isMySQL) {
        await client.rollback();
      } else {
        await client.query('ROLLBACK');
      }
    } catch (_) {}
    throw error;
  } finally {
    if (isMySQL) {
      client.release();
    } else {
      client.release();
    }
  }
}

/**
 * Синхронизация ресурсов из СБИС
 */
async function syncResourcesFromSBIS(clientId, sbisContractId) {
  const client = await pool.connect();
  const syncedResources = [];
  
  try {
    await client.query('BEGIN');
    
    console.log(`🔄 Syncing resources from SBIS for client ${clientId}, contract ${sbisContractId || 'N/A'}`);
    
    // Получаем данные клиента
    const clientResult = await client.query(
      'SELECT inn, kpp, name FROM clients WHERE id = $1',
      [clientId]
    );
    
    if (clientResult.rows.length === 0) {
      throw new Error('Client not found');
    }
    
    const clientData = clientResult.rows[0];
    
    // Если нет ИНН, не можем синхронизировать
    if (!clientData.inn) {
      console.warn('⚠️ Client has no INN, cannot sync resources');
      await client.query('COMMIT');
      return [];
    }
    
    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    
    // 1. Синхронизация фискальных накопителей (ФН)
    try {
      const fnResponse = await axios.post(
        `${apiBaseUrl}/api/sbis-resources/get-fn-list`,
        {
          userId: 'default',
          contractorINN: clientData.inn,
        },
        { timeout: 10000 }
      );
      
      if (fnResponse.data?.success && fnResponse.data?.data) {
        for (const fn of fnResponse.data.data) {
          const existing = await client.query(
            'SELECT id FROM client_resources WHERE client_id = $1 AND sbis_resource_id = $2',
            [clientId, fn.id]
          );
          
          if (existing.rows.length === 0 && fn.expiry_date) {
            const insertResult = await client.query(
              `INSERT INTO client_resources 
               (client_id, resource_type, resource_name, serial_number, model,
                expiry_date, renewal_price, auto_renewal, sbis_resource_id, status, metadata)
               VALUES ($1, 'fn', $2, $3, $4, $5, $6, false, $7, 'active', $8)
               RETURNING *`,
              [
                clientId,
                `ФН ${fn.serial_number || fn.id}`,
                fn.serial_number,
                fn.model,
                fn.expiry_date,
                0, // Цена будет установлена позже
                fn.id,
                JSON.stringify(fn.metadata || {})
              ]
            );
            syncedResources.push(insertResult.rows[0]);
            console.log(`✅ Synced FN: ${fn.serial_number}`);
          }
        }
      }
    } catch (fnError) {
      console.warn('⚠️ Could not sync FN from SBIS:', fnError.message);
    }
    
    // 2. Синхронизация лицензий (Эвотор, Атол)
    try {
      const licensesResponse = await axios.post(
        `${apiBaseUrl}/api/sbis-resources/get-licenses`,
        {
          userId: 'default',
          contractorINN: clientData.inn,
        },
        { timeout: 10000 }
      );
      
      if (licensesResponse.data?.success && licensesResponse.data?.data) {
        for (const license of licensesResponse.data.data) {
          const existing = await client.query(
            'SELECT id FROM client_resources WHERE client_id = $1 AND sbis_resource_id = $2',
            [clientId, license.id]
          );
          
          if (existing.rows.length === 0) {
            const expiryDate = license.expiry_date 
              ? new Date(license.expiry_date)
              : new Date();
            if (!license.expiry_date) {
              expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            }
            
            const insertResult = await client.query(
              `INSERT INTO client_resources 
               (client_id, resource_type, resource_name, expiry_date, renewal_price,
                auto_renewal, sbis_resource_id, status, metadata)
               VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8)
               RETURNING *`,
              [
                clientId,
                license.type,
                license.name,
                expiryDate.toISOString().split('T')[0],
                license.price || 0,
                license.id,
                license.status || 'active',
                JSON.stringify(license.metadata || {})
              ]
            );
            syncedResources.push(insertResult.rows[0]);
            console.log(`✅ Synced license: ${license.name} (${license.type})`);
          }
        }
      }
    } catch (licenseError) {
      console.warn('⚠️ Could not sync licenses from SBIS:', licenseError.message);
    }
    
    // 3. Синхронизация подписок ОФД
    try {
      const ofdResponse = await axios.post(
        `${apiBaseUrl}/api/sbis-resources/get-ofd-subscriptions`,
        {
          userId: 'default',
          contractorINN: clientData.inn,
        },
        { timeout: 10000 }
      );
      
      if (ofdResponse.data?.success && ofdResponse.data?.data) {
        for (const subscription of ofdResponse.data.data) {
          const existing = await client.query(
            'SELECT id FROM client_resources WHERE client_id = $1 AND sbis_resource_id = $2',
            [clientId, subscription.id]
          );
          
          if (existing.rows.length === 0 && subscription.expiry_date) {
            const insertResult = await client.query(
              `INSERT INTO client_resources 
               (client_id, resource_type, resource_name, expiry_date, renewal_price,
                auto_renewal, sbis_resource_id, status, metadata)
               VALUES ($1, 'ofd', $2, $3, $4, false, $5, $6, $7)
               RETURNING *`,
              [
                clientId,
                subscription.name,
                subscription.expiry_date,
                subscription.price || 0,
                subscription.id,
                subscription.status || 'active',
                JSON.stringify(subscription.metadata || {})
              ]
            );
            syncedResources.push(insertResult.rows[0]);
            console.log(`✅ Synced OFD subscription: ${subscription.name}`);
          }
        }
      }
    } catch (ofdError) {
      console.warn('⚠️ Could not sync OFD subscriptions from SBIS:', ofdError.message);
    }
    
    // 4. Синхронизация через номенклатуру (общие услуги)
    try {
      const nomenclatureResponse = await axios.post(
        `${apiBaseUrl}/api/sbis-proxy/proxy`,
        {
          method: 'СБИС.СписокНоменклатуры',
          params: {
            Фильтр: {
              Тип: 'Услуга',
            },
            Навигация: {
              Количество: 100,
            },
          },
          userId: 'default',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
      
      if (nomenclatureResponse.data?.result?.Номенклатура) {
        const items = nomenclatureResponse.data.result.Номенклатура;
        
        for (const item of items) {
          // Определяем тип ресурса по названию
          let resourceType = 'other';
          const name = item.Наименование || '';
          
          if (name.toLowerCase().includes('фискальный') || name.toLowerCase().includes('фн')) {
            resourceType = 'fn';
          } else if (name.toLowerCase().includes('эвотор')) {
            resourceType = 'evotor';
          } else if (name.toLowerCase().includes('атол')) {
            resourceType = 'atol';
          } else if (name.toLowerCase().includes('офд')) {
            resourceType = 'ofd';
          } else if (name.toLowerCase().includes('лицензия') || name.toLowerCase().includes('подписка')) {
            resourceType = name.toLowerCase().includes('подписка') ? 'subscription' : 'license';
          }
          
          // Пропускаем, если уже синхронизировали через специализированные API
          if (resourceType === 'fn' || resourceType === 'evotor' || resourceType === 'atol' || resourceType === 'ofd') {
            continue;
          }
          
          // Проверяем, есть ли уже такой ресурс
          const existing = await client.query(
            'SELECT id FROM client_resources WHERE client_id = $1 AND sbis_resource_id = $2',
            [clientId, item.Идентификатор]
          );
          
          if (existing.rows.length === 0) {
            // Вычисляем дату окончания (если есть информация о периоде)
            const expiryDate = new Date();
            expiryDate.setFullYear(expiryDate.getFullYear() + 1); // По умолчанию +1 год
            
            const price = parseFloat(item.Цена) || 0;
            
            const insertResult = await client.query(
              `INSERT INTO client_resources 
               (client_id, resource_type, resource_name, expiry_date, renewal_price, 
                auto_renewal, sbis_resource_id, status, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
               RETURNING *`,
              [
                clientId,
                resourceType,
                name,
                expiryDate.toISOString().split('T')[0],
                price,
                false, // По умолчанию автопродление выключено
                item.Идентификатор,
                JSON.stringify({
                  sbis_nomenclature_id: item.Идентификатор,
                  unit: item.ЕдиницаИзмерения,
                  description: item.Описание,
                })
              ]
            );
            
            syncedResources.push(insertResult.rows[0]);
            console.log(`✅ Synced resource: ${name} (${resourceType})`);
          }
        }
      }
    } catch (nomenclatureError) {
      console.warn('⚠️ Could not sync nomenclature from SBIS:', nomenclatureError.message);
    }
    
    // 2. Пытаемся получить данные через CRM API (сделки с услугами)
    try {
      const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      
      // Ищем контрагента по ИНН
      const contractorResponse = await axios.post(
        `${apiBaseUrl}/api/sbis-proxy/crm-client-oauth`,
        {
          inn: clientData.inn,
          userId: 'default',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
      
      if (contractorResponse.data?.success && contractorResponse.data?.data?.contractor) {
        const contractorId = contractorResponse.data.data.contractor.id;
        
        // Здесь можно получить сделки контрагента и извлечь информацию о ресурсах
        // Пока пропускаем, так как это требует дополнительной настройки
      }
    } catch (crmError) {
      console.warn('⚠️ Could not sync from CRM:', crmError.message);
    }
    
    // 3. Если есть данные о подписках в метаданных клиента
    // Можно добавить синхронизацию из других источников
    
    await client.query('COMMIT');
    
    console.log(`✅ Synced ${syncedResources.length} resources from SBIS`);
    return syncedResources;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error syncing resources from SBIS:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Вспомогательные функции
function getResourceTypeName(type) {
  const names = {
    'fn': 'Фискальный накопитель',
    'evotor': 'Лицензия Эвотор',
    'atol': 'Лицензия Атол',
    'ofd': 'ОФД',
    'license': 'Лицензия',
    'subscription': 'Подписка',
    'other': 'Ресурс'
  };
  return names[type] || 'Ресурс';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getDayWord(days) {
  if (days === 1) return 'день';
  if (days >= 2 && days <= 4) return 'дня';
  return 'дней';
}

module.exports = {
  checkExpiringResources,
  autoRenewResources,
  renewResource,
  syncResourcesFromSBIS
};
