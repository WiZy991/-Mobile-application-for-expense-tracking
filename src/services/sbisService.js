const axios = require('axios');
const { pool } = require('../database/init');

const SBIS_API_URL = process.env.SBIS_API_URL || 'https://api.sbis.ru';
const SBIS_ACCESS_TOKEN = process.env.SBIS_ACCESS_TOKEN;

// Маппинг услуг СБИС на внутренние коды
const SBIS_SERVICE_MAPPING = {
  'sbis_online': 'sbis',
  'sbis_cloud': 'sbis',
  'evotor': 'evotor',
  'atol': 'atol',
  // Добавьте свои маппинги
};

/**
 * Получить список услуг клиента из СБИС
 */
async function getSbisServices(contractId) {
  try {
    const response = await axios.get(`${SBIS_API_URL}/contract/${contractId}/services`, {
      headers: {
        'Authorization': `Bearer ${SBIS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.services || [];
  } catch (error) {
    console.error('Error fetching SBIS services:', error);
    throw new Error(`Failed to fetch SBIS services: ${error.message}`);
  }
}

/**
 * Получить счета клиента из СБИС
 */
async function getSbisInvoices(contractId) {
  try {
    const response = await axios.get(`${SBIS_API_URL}/contract/${contractId}/invoices`, {
      headers: {
        'Authorization': `Bearer ${SBIS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        status: 'all',
        limit: 100
      }
    });

    return response.data.invoices || [];
  } catch (error) {
    console.error('Error fetching SBIS invoices:', error);
    throw new Error(`Failed to fetch SBIS invoices: ${error.message}`);
  }
}

/**
 * Маппинг услуги СБИС на внутренний сервис
 */
function mapSbisService(sbisService) {
  const serviceCode = sbisService.code?.toLowerCase() || '';
  
  // Ищем точное совпадение
  for (const [sbisKey, internalCode] of Object.entries(SBIS_SERVICE_MAPPING)) {
    if (serviceCode.includes(sbisKey)) {
      return internalCode;
    }
  }

  // Если не нашли, возвращаем 'other'
  return 'other';
}

/**
 * Синхронизация услуг клиента
 */
async function syncClientData(clientId, contractId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const sbisServices = await getSbisServices(contractId);

    for (const sbisService of sbisServices) {
      const internalCode = mapSbisService(sbisService);

      // Находим или создаём сервис
      let serviceResult = await client.query(
        'SELECT id FROM services WHERE code = $1',
        [internalCode]
      );

      let serviceId;
      if (serviceResult.rows.length === 0) {
        // Создаём новый сервис
        const newServiceResult = await client.query(
          `INSERT INTO services (name, code, description, price, billing_period)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            sbisService.name || 'Неизвестная услуга',
            internalCode,
            sbisService.description || '',
            sbisService.price || 0,
            sbisService.billing_period || 'monthly'
          ]
        );
        serviceId = newServiceResult.rows[0].id;
      } else {
        serviceId = serviceResult.rows[0].id;
      }

      // Проверяем, есть ли уже связь клиент-услуга
      const existingLink = await client.query(
        'SELECT id FROM client_services WHERE client_id = $1 AND sbis_service_id = $2',
        [clientId, sbisService.id]
      );

      if (existingLink.rows.length === 0) {
        // Создаём связь
        await client.query(
          `INSERT INTO client_services (client_id, service_id, sbis_service_id, start_date, is_active)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            clientId,
            serviceId,
            sbisService.id,
            sbisService.start_date || new Date(),
            sbisService.is_active !== false
          ]
        );
      } else {
        // Обновляем существующую связь
        await client.query(
          `UPDATE client_services 
           SET is_active = $1, end_date = $2
           WHERE id = $3`,
          [
            sbisService.is_active !== false,
            sbisService.end_date || null,
            existingLink.rows[0].id
          ]
        );
      }
    }

    // Логируем синхронизацию
    await client.query(
      `INSERT INTO sbis_sync_log (client_id, sync_type, status, data)
       VALUES ($1, $2, $3, $4)`,
      [
        clientId,
        'services',
        'completed',
        JSON.stringify({ services_count: sbisServices.length })
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    
    // Логируем ошибку
    await pool.query(
      `INSERT INTO sbis_sync_log (client_id, sync_type, status, error_message)
       VALUES ($1, $2, $3, $4)`,
      [clientId, 'services', 'failed', error.message]
    );

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Синхронизация счетов
 */
async function syncInvoices(clientId, contractId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const invoices = await getSbisInvoices(contractId);

    for (const invoice of invoices) {
      // Проверяем, есть ли уже такая транзакция
      const existing = await client.query(
        'SELECT id FROM transactions WHERE sbis_invoice_id = $1',
        [invoice.id]
      );

      if (existing.rows.length > 0) {
        continue; // Уже синхронизировано
      }

      // Находим сервис по sbis_service_id
      let serviceId = null;
      if (invoice.service_id) {
        const serviceResult = await client.query(
          `SELECT service_id FROM client_services 
           WHERE client_id = $1 AND sbis_service_id = $2`,
          [clientId, invoice.service_id]
        );
        if (serviceResult.rows.length > 0) {
          serviceId = serviceResult.rows[0].service_id;
        }
      }

      // Создаём транзакцию
      await client.query(
        `INSERT INTO transactions 
         (client_id, service_id, type, amount, description, period_start, period_end, sbis_invoice_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          clientId,
          serviceId,
          'charge',
          invoice.amount,
          invoice.description || `Счёт №${invoice.number}`,
          invoice.period_start || null,
          invoice.period_end || null,
          invoice.id,
          invoice.status === 'paid' ? 'completed' : 'pending'
        ]
      );

      // Если счёт оплачен, обновляем баланс
      if (invoice.status === 'paid') {
        await client.query(
          'UPDATE clients SET balance = balance - $1 WHERE id = $2',
          [invoice.amount, clientId]
        );
      }
    }

    // Логируем синхронизацию
    await client.query(
      `INSERT INTO sbis_sync_log (client_id, sync_type, status, data)
       VALUES ($1, $2, $3, $4)`,
      [
        clientId,
        'invoices',
        'completed',
        JSON.stringify({ invoices_count: invoices.length })
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    
    // Логируем ошибку
    await pool.query(
      `INSERT INTO sbis_sync_log (client_id, sync_type, status, error_message)
       VALUES ($1, $2, $3, $4)`,
      [clientId, 'invoices', 'failed', error.message]
    );

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getSbisServices,
  getSbisInvoices,
  mapSbisService,
  syncClientData,
  syncInvoices
};

