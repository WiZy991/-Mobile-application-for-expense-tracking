/**
 * Сервис для работы с контрагентами из СБИС CRM
 * Кэширует данные в PostgreSQL для быстрого доступа
 */

const { pool } = require('../database/init')

/**
 * Сохранить или обновить контрагента в БД
 * @param {Object} contractorData - Данные контрагента из СБИС
 * @returns {Promise<Object>} Сохраненный контрагент
 */
async function saveContractor(contractorData) {
	const {
		id: sbisId,
		inn,
		kpp,
		ogrn,
		name,
		shortName,
		fullName,
		address,
		legalAddress,
		phone,
		email,
		director,
		dealsCount = 0,
		documentsCount = 0,
		totalAmount = 0,
	} = contractorData

	try {
		const result = await pool.query(
			`
      INSERT INTO sbis_contractors (
        sbis_id, inn, kpp, ogrn, name, short_name, full_name,
        address, legal_address, phone, email, director,
        deals_count, documents_count, total_amount,
        last_sync_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
      )
      ON CONFLICT (sbis_id) DO UPDATE SET
        inn = EXCLUDED.inn,
        kpp = EXCLUDED.kpp,
        ogrn = EXCLUDED.ogrn,
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        full_name = EXCLUDED.full_name,
        address = EXCLUDED.address,
        legal_address = EXCLUDED.legal_address,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        director = EXCLUDED.director,
        deals_count = EXCLUDED.deals_count,
        documents_count = EXCLUDED.documents_count,
        total_amount = EXCLUDED.total_amount,
        last_sync_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `,
			[
				sbisId,
				inn,
				kpp,
				ogrn,
				name,
				shortName,
				fullName,
				address,
				legalAddress,
				phone,
				email,
				director,
				dealsCount,
				documentsCount,
				totalAmount,
			]
		)

		console.log('✅ Контрагент сохранен в БД:', {
			sbisId,
			inn,
			name,
		})

		return result.rows[0]
	} catch (error) {
		console.error('❌ Ошибка сохранения контрагента:', error.message)
		throw error
	}
}

/**
 * Найти контрагента в БД по ИНН
 * @param {string} inn - ИНН контрагента
 * @returns {Promise<Object|null>} Контрагент из БД или null
 */
async function findContractorByInn(inn) {
	try {
		const result = await pool.query(
			`
      SELECT * FROM sbis_contractors 
      WHERE inn = $1 
      ORDER BY last_sync_at DESC 
      LIMIT 1
    `,
			[inn]
		)

		if (result.rows.length > 0) {
			const contractor = result.rows[0]
			console.log('✅ Контрагент найден в кэше:', {
				inn,
				name: contractor.name,
				lastSync: contractor.last_sync_at,
			})
			return contractor
		}

		console.log('⚠️  Контрагент не найден в кэше:', inn)
		return null
	} catch (error) {
		console.error('❌ Ошибка поиска контрагента в БД:', error.message)
		return null
	}
}

/**
 * Найти контрагента в БД по SBIS ID
 * @param {string} sbisId - ID контрагента в СБИС
 * @returns {Promise<Object|null>} Контрагент из БД или null
 */
async function findContractorBySbisId(sbisId) {
	try {
		const result = await pool.query(
			`
      SELECT * FROM sbis_contractors 
      WHERE sbis_id = $1 
      LIMIT 1
    `,
			[sbisId]
		)

		return result.rows.length > 0 ? result.rows[0] : null
	} catch (error) {
		console.error(
			'❌ Ошибка поиска контрагента по SBIS ID:',
			error.message
		)
		return null
	}
}

/**
 * Сохранить сделку в БД
 * @param {Object} dealData - Данные сделки из СБИС
 * @param {number} contractorDbId - ID контрагента в нашей БД
 * @returns {Promise<Object>} Сохраненная сделка
 */
async function saveDeal(dealData, contractorDbId) {
	const {
		id: sbisId,
		themeId,
		themeName,
		amount,
		status,
	} = dealData

	try {
		const result = await pool.query(
			`
      INSERT INTO sbis_deals (
        sbis_id, contractor_id, theme_id, theme_name, amount, status, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW()
      )
      ON CONFLICT (sbis_id) DO UPDATE SET
        contractor_id = EXCLUDED.contractor_id,
        theme_id = EXCLUDED.theme_id,
        theme_name = EXCLUDED.theme_name,
        amount = EXCLUDED.amount,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *
    `,
			[sbisId, contractorDbId, themeId, themeName, amount, status]
		)

		console.log('✅ Сделка сохранена в БД:', {
			sbisId,
			contractorDbId,
			amount,
		})

		return result.rows[0]
	} catch (error) {
		console.error('❌ Ошибка сохранения сделки:', error.message)
		throw error
	}
}

/**
 * Получить все сделки контрагента
 * @param {number} contractorDbId - ID контрагента в нашей БД
 * @returns {Promise<Array>} Список сделок
 */
async function getDealsByContractorId(contractorDbId) {
	try {
		const result = await pool.query(
			`
      SELECT * FROM sbis_deals 
      WHERE contractor_id = $1 
      ORDER BY created_at DESC
    `,
			[contractorDbId]
		)

		return result.rows
	} catch (error) {
		console.error('❌ Ошибка получения сделок:', error.message)
		return []
	}
}

/**
 * Проверить, нужно ли обновить кэш (прошло более 1 часа)
 * @param {Date} lastSyncAt - Дата последней синхронизации
 * @returns {boolean} true если нужно обновить
 */
function shouldUpdateCache(lastSyncAt) {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
	return !lastSyncAt || new Date(lastSyncAt) < oneHourAgo
}

module.exports = {
	saveContractor,
	findContractorByInn,
	findContractorBySbisId,
	saveDeal,
	getDealsByContractorId,
	shouldUpdateCache,
}

