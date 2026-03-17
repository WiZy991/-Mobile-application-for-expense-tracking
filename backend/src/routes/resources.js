const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../database/init');
const { syncResourcesFromSBIS } = require('../services/resourceMonitorService');

const router = express.Router();

router.use(authenticateToken);

/**
 * GET /api/resources
 * Получить все ресурсы клиента (ФН, лицензии и т.д.)
 */
router.get('/', async (req, res) => {
  try {
    const { status, resource_type } = req.query;

    let query = `
      SELECT 
        cr.*,
        CASE 
          WHEN cr.expiry_date <= CURRENT_DATE THEN 'expired'
          WHEN cr.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'
          WHEN cr.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
          ELSE 'active'
        END as calculated_status
      FROM client_resources cr
      WHERE cr.client_id = $1
    `;

    const params = [req.user.id];
    let paramCount = 2;

    if (status) {
      query += ` AND cr.status = $${paramCount++}`;
      params.push(status);
    }

    if (resource_type) {
      query += ` AND cr.resource_type = $${paramCount++}`;
      params.push(resource_type);
    }

    query += ` ORDER BY cr.expiry_date ASC`;

    const result = await pool.query(query, params);

    res.json({
      resources: result.rows.map(row => ({
        ...row,
        days_until_expiry: Math.ceil(
          (new Date(row.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
        )
      }))
    });
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/resources/:id
 * Получить детальную информацию о ресурсе
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM client_resources 
       WHERE id = $1 AND client_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const resource = result.rows[0];
    const daysUntilExpiry = Math.ceil(
      (new Date(resource.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
    );

    res.json({
      ...resource,
      days_until_expiry: daysUntilExpiry
    });
  } catch (error) {
    console.error('Get resource error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/resources
 * Добавить новый ресурс (вручную или из СБИС)
 */
router.post('/', async (req, res) => {
  try {
    const {
      resource_type,
      resource_name,
      serial_number,
      model,
      start_date,
      expiry_date,
      renewal_price,
      auto_renewal,
      sbis_resource_id,
      metadata
    } = req.body;

    if (!resource_type || !resource_name || !expiry_date) {
      return res.status(400).json({ 
        error: 'resource_type, resource_name and expiry_date are required' 
      });
    }

    const result = await pool.query(
      `INSERT INTO client_resources 
       (client_id, resource_type, resource_name, serial_number, model, 
        start_date, expiry_date, renewal_price, auto_renewal, 
        sbis_resource_id, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
       RETURNING *`,
      [
        req.user.id,
        resource_type,
        resource_name,
        serial_number || null,
        model || null,
        start_date || new Date().toISOString().split('T')[0],
        expiry_date,
        renewal_price || 0,
        auto_renewal || false,
        sbis_resource_id || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    res.status(201).json({
      success: true,
      resource: result.rows[0]
    });
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/resources/:id
 * Обновить ресурс
 */
router.put('/:id', async (req, res) => {
  try {
    const {
      resource_name,
      serial_number,
      model,
      start_date,
      expiry_date,
      renewal_price,
      auto_renewal,
      metadata
    } = req.body;

    // Проверяем, что ресурс принадлежит клиенту
    const checkResult = await pool.query(
      'SELECT id FROM client_resources WHERE id = $1 AND client_id = $2',
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const updateFields = [];
    const params = [];
    let paramCount = 1;

    if (resource_name !== undefined) {
      updateFields.push(`resource_name = $${paramCount++}`);
      params.push(resource_name);
    }
    if (serial_number !== undefined) {
      updateFields.push(`serial_number = $${paramCount++}`);
      params.push(serial_number);
    }
    if (model !== undefined) {
      updateFields.push(`model = $${paramCount++}`);
      params.push(model);
    }
    if (start_date !== undefined) {
      updateFields.push(`start_date = $${paramCount++}`);
      params.push(start_date);
    }
    if (expiry_date !== undefined) {
      updateFields.push(`expiry_date = $${paramCount++}`);
      params.push(expiry_date);
    }
    if (renewal_price !== undefined) {
      updateFields.push(`renewal_price = $${paramCount++}`);
      params.push(renewal_price);
    }
    if (auto_renewal !== undefined) {
      updateFields.push(`auto_renewal = $${paramCount++}`);
      params.push(auto_renewal);
    }
    if (metadata !== undefined) {
      updateFields.push(`metadata = $${paramCount++}`);
      params.push(JSON.stringify(metadata));
    }

    updateFields.push(`updated_at = NOW()`);

    if (updateFields.length === 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE client_resources 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    res.json({
      success: true,
      resource: result.rows[0]
    });
  } catch (error) {
    console.error('Update resource error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/resources/sync
 * Синхронизировать ресурсы из СБИС
 */
router.post('/sync', async (req, res) => {
  try {
    // Получаем данные клиента (ИНН и contract_id если есть)
    const clientResult = await pool.query(
      'SELECT inn, sbis_contract_id FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Client not found' 
      });
    }

    const clientData = clientResult.rows[0];
    
    // Используем contract_id если есть, иначе используем ИНН
    const contractId = clientData.sbis_contract_id || null;
    
    // Если нет ни contract_id, ни ИНН, возвращаем ошибку
    if (!contractId && !clientData.inn) {
      return res.status(400).json({ 
        error: 'SBIS contract ID or INN not found. Please sync your client data first.' 
      });
    }

    const resources = await syncResourcesFromSBIS(
      req.user.id,
      contractId
    );

    res.json({
      success: true,
      synced: resources.length,
      resources
    });
  } catch (error) {
    console.error('Sync resources error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * DELETE /api/resources/:id
 * Удалить ресурс
 */
router.delete('/:id', async (req, res) => {
  try {
    // Проверяем, что ресурс принадлежит клиенту
    const checkResult = await pool.query(
      'SELECT id FROM client_resources WHERE id = $1 AND client_id = $2',
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    await pool.query(
      'UPDATE client_resources SET status = $1 WHERE id = $2',
      ['cancelled', req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
