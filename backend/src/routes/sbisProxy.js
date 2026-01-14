/**
 * СБИС Proxy Router
 * Проксирует запросы к СБИС API для обхода CORS ограничений
 *
 * Документация: https://saby.ru/help/integration/api
 */

const express = require('express')
const axios = require('axios')
const router = express.Router()

// ========================================
// URL-адреса СБИС API
// ========================================

// Авторизация для online.sbis.ru (ЭДО, бухгалтерия и т.д.)
const SBIS_AUTH_URL = 'https://online.sbis.ru/auth/service/'

// OAuth/Сервисная авторизация для API
const SBIS_OAUTH_URL = 'https://online.sbis.ru/oauth/service/'

// Авторизация для API "Все о компаниях" (api.sbis.ru)
const SPP_AUTH_URL = 'https://api.sbis.ru/auth/service/'

// ========================================
// API Credentials (сервисная авторизация)
// ВАЖНО: Скопируйте точные значения из веб-интерфейса СБИС
// Настройки → Интеграция → Подключение к SABY → Ваше приложение
// ========================================
const SBIS_APP_CLIENT_ID = '8336661846175209' // ID подключения
const SBIS_APP_SECRET = '20T6ZTYTSDYILEJWGIYCLWPE' // Защищенный ключ

// Сервисы СБИС API
const SBIS_SERVICES = {
	// Основной сервис online.sbis.ru (без параметров)
	main: 'https://online.sbis.ru/service/',
	// API ЭДО - для работы с контрагентами и документами
	edo: 'https://online.sbis.ru/service/',
	// С параметром srv=1
	mainSrv: 'https://online.sbis.ru/service/?srv=1',
	// Бизнес-сервис
	business: 'https://online.sbis.ru/service/',
	// CRM сервис
	crm: 'https://online.sbis.ru/service/',

	// ========================================
	// API "Все о компаниях" (SPP API)
	// Документация: из api_about_company.md
	// ========================================
	spp: 'https://api.sbis.ru/spp-rest-api/service/',
	sppAuth: 'https://api.sbis.ru/auth/service/',
}

// Текущий активный сервис (можно переключать)
let SBIS_API_URL = SBIS_SERVICES.main

// Хранение сессий пользователей (для online.sbis.ru)
const userSessions = new Map()

// Хранение сессий для SPP API (api.sbis.ru) - отдельно!
const sppSessions = new Map()

// Хранение OAuth токенов (сервисная авторизация)
const oauthTokens = new Map()

/**
 * POST /api/sbis-proxy/proxy
 * Проксирует JSON-RPC запросы к СБИС
 */
router.post('/proxy', async (req, res) => {
	try {
		const { method, params, userId } = req.body

		if (!method) {
			return res.status(400).json({ error: 'Method is required' })
		}

		// Получаем сессию
		const sessionId = userSessions.get(userId || 'default')

		// Формируем параметры с сессией
		const requestParams = sessionId ? { ...params, Сессия: sessionId } : params

		// Определяем URL в зависимости от метода
		const url =
			method === 'СБИС.Аутентифицировать' ? SBIS_AUTH_URL : SBIS_API_URL

		const headers = {
			'Content-Type': 'application/json-rpc; charset=utf-8',
		}

		// Добавляем X-SBISSessionID в заголовки если есть сессия
		if (sessionId) {
			headers['X-SBISSessionID'] = sessionId
		}

		console.log(`SBIS Proxy [${method}]:`, { url, hasSession: !!sessionId })

		const response = await axios.post(
			url,
			{
				jsonrpc: '2.0',
				method,
				params: requestParams,
				id: Date.now(),
			},
			{
				headers,
				timeout: 30000,
			}
		)

		console.log(
			`SBIS Proxy Response [${method}]:`,
			JSON.stringify(response.data).substring(0, 200)
		)

		// Если это авторизация - сохраняем сессию
		if (method === 'СБИС.Аутентифицировать' && response.data.result) {
			userSessions.set(userId || 'default', response.data.result)
		}

		res.json(response.data)
	} catch (error) {
		console.error('SBIS Proxy Error:', error.response?.data || error.message)
		res.status(error.response?.status || 500).json({
			error: {
				message:
					error.response?.data?.error?.message ||
					error.response?.data?.error ||
					error.message ||
					'SBIS API Error',
				code: error.response?.status || 500,
			},
		})
	}
})

/**
 * POST /api/sbis-proxy/auth-service
 * Сервисная авторизация в СБИС через OAuth (app_client_id + app_secret)
 * Это даёт доступ к полному API CRM, контрагентов, документов
 *
 * ВАЖНО: Используем JSON-RPC формат для авторизации!
 */
router.post('/auth-service', async (req, res) => {
	try {
		const { userId } = req.body
		const userKey = userId || 'default'

		console.log('=== SBIS Service Auth (OAuth JSON-RPC) ===')
		console.log('app_client_id:', SBIS_APP_CLIENT_ID)

		// Генерируем уникальный secret_key для связи пользователя
		// Для "открытого" типа приложения это обязательно
		const secretKey = `user_${userKey}_${Date.now()}`

		// JSON-RPC запрос на авторизацию - пробуем разные методы
		const authMethods = [
			// Метод 1: OAuth с secret_key (для открытых приложений)
			{
				url: 'https://online.sbis.ru/oauth/service/',
				method: 'OAuth.Authorize',
				params: {
					app_client_id: SBIS_APP_CLIENT_ID,
					app_secret: SBIS_APP_SECRET,
					secret_key: secretKey,
				},
			},
			// Метод 2: САП.Авторизоваться
			{
				url: 'https://online.sbis.ru/auth/service/',
				method: 'САП.Авторизоваться',
				params: {
					Приложение: SBIS_APP_CLIENT_ID,
					Секрет: SBIS_APP_SECRET,
					СекретныйКлюч: secretKey,
				},
			},
			// Метод 3: Простая OAuth авторизация
			{
				url: 'https://online.sbis.ru/oauth/service/',
				method: 'СБИС.Аутентифицировать',
				params: {
					Приложение: SBIS_APP_CLIENT_ID,
					Секрет: SBIS_APP_SECRET,
				},
			},
			// Метод 4: REST-style OAuth
			{
				url: 'https://online.sbis.ru/oauth/service/',
				isRest: true,
				body: {
					app_client_id: SBIS_APP_CLIENT_ID,
					app_secret: SBIS_APP_SECRET,
					secret_key: secretKey,
				},
			},
		]

		let successResult = null

		for (const authMethod of authMethods) {
			try {
				const methodName = authMethod.method || 'REST'
				console.log(`Trying: ${methodName} -> ${authMethod.url}`)

				let requestBody
				let contentType

				if (authMethod.isRest) {
					// REST-style запрос
					requestBody = authMethod.body
					contentType = 'application/json; charset=utf-8'
				} else {
					// JSON-RPC запрос
					requestBody = {
						jsonrpc: '2.0',
						method: authMethod.method,
						params: authMethod.params,
						id: Date.now(),
					}
					contentType = 'application/json-rpc; charset=utf-8'
				}

				console.log('Request body:', JSON.stringify(requestBody))

				const response = await axios.post(authMethod.url, requestBody, {
					headers: {
						'Content-Type': contentType,
					},
					timeout: 30000,
				})

				console.log('Response:', JSON.stringify(response.data))

				// Проверяем разные форматы ответа
				const result =
					response.data.result ||
					response.data.access_token ||
					response.data.sid ||
					response.data.token

				if (result) {
					successResult = result
					console.log('✅ Auth method worked:', methodName)
					break
				}

				if (response.data.error) {
					console.log(
						`❌ ${methodName}: ${
							response.data.error.message || JSON.stringify(response.data.error)
						}`
					)
				}
			} catch (err) {
				const methodName = authMethod.method || 'REST'
				console.log(
					`❌ ${methodName}: ${err.response?.data?.error || err.message}`
				)
				if (err.response?.data) {
					console.log('   Error details:', JSON.stringify(err.response.data))
				}
			}
		}

		if (successResult) {
			// Сохраняем токен (может быть строкой или объектом с sid)
			const token =
				typeof successResult === 'string'
					? successResult
					: successResult.sid || successResult.token
			if (token) {
				oauthTokens.set(userKey, token)
				userSessions.set(userKey, token) // Также сохраняем как сессию
				console.log('✅ Token saved:', token.substring(0, 20) + '...')

				return res.json({
					success: true,
					tokenType: 'service',
					message: 'Сервисная авторизация успешна',
				})
			}
		}

		// Попробуем обычную авторизацию с логином/паролем как fallback
		console.log('Trying login/password auth as fallback...')

		res.json({
			success: false,
			error:
				'Сервисная авторизация не удалась. Попробуйте использовать /auth с логином и паролем.',
			hint: 'Проверьте настройки приложения в СБИС: Настройки → Интеграция → API',
		})
	} catch (error) {
		console.error('OAuth Error:', error.response?.data || error.message)
		res.status(401).json({
			success: false,
			error: error.response?.data?.error || error.message,
			details: error.response?.data,
		})
	}
})

/**
 * POST /api/sbis-proxy/auth
 * Авторизация в СБИС
 *
 * ВАЖНО: Авторизация идет на отдельный URL: https://online.sbis.ru/auth/service/
 */
router.post('/auth', async (req, res) => {
	try {
		const { login, password, userId } = req.body

		console.log('SBIS Auth attempt for:', login)

		if (!login || !password) {
			return res.status(400).json({ error: 'Login and password are required' })
		}

		let onlineSessionId = null
		let sppSessionId = null

		// 1. Авторизация в online.sbis.ru (ЭДО)
		try {
			const onlineResponse = await axios.post(
				SBIS_AUTH_URL,
				{
					jsonrpc: '2.0',
					method: 'СБИС.Аутентифицировать',
					params: {
						Параметр: {
							Логин: login,
							Пароль: password,
						},
					},
					id: Date.now(),
				},
				{
					headers: {
						'Content-Type': 'application/json-rpc; charset=utf-8',
					},
					timeout: 30000,
				}
			)

			if (onlineResponse.data.result) {
				onlineSessionId = onlineResponse.data.result
				userSessions.set(userId || 'default', onlineSessionId)
				console.log('✅ SBIS Online Auth success, session:', onlineSessionId)
			}
		} catch (e) {
			console.log('⚠️ SBIS Online Auth failed:', e.message)
		}

		// 2. Авторизация в api.sbis.ru (API "Все о компаниях")
		try {
			console.log('Trying SPP API auth at:', SPP_AUTH_URL)
			const sppResponse = await axios.post(
				SPP_AUTH_URL,
				{
					jsonrpc: '2.0',
					method: 'САП.Аутентифицировать',
					protocol: 3,
					params: {
						login: login,
						password: password,
					},
					id: Date.now(),
				},
				{
					headers: {
						'Content-Type': 'application/json; charset=UTF-8',
					},
					timeout: 30000,
				}
			)

			console.log('SPP Auth response:', JSON.stringify(sppResponse.data))

			if (sppResponse.data.result) {
				sppSessionId = sppResponse.data.result
				sppSessions.set(userId || 'default', sppSessionId)
				console.log('✅ SPP API Auth success, session:', sppSessionId)
			}
		} catch (e) {
			console.log('⚠️ SPP API Auth failed:', e.response?.data || e.message)
		}

		// Проверяем что хотя бы одна авторизация прошла
		if (!onlineSessionId && !sppSessionId) {
			return res
				.status(401)
				.json({ error: 'Не удалось авторизоваться ни в одном сервисе СБИС' })
		}

		res.json({
			success: true,
			sessionId: onlineSessionId,
			sppSessionId: sppSessionId,
			services: {
				online: !!onlineSessionId,
				spp: !!sppSessionId,
			},
			message: 'Авторизация успешна',
		})
	} catch (error) {
		console.error('SBIS Auth Error:', error.response?.data || error.message)
		res.status(401).json({
			error:
				error.response?.data?.error?.message ||
				error.response?.data?.error ||
				error.message ||
				'Ошибка авторизации в СБИС',
		})
	}
})

/**
 * POST /api/sbis-proxy/spp-requisites
 * Получение реквизитов через API "Все о компаниях"
 *
 * Метод: SppAPI.Requisites
 * URL: https://api.sbis.ru/spp-rest-api/service/
 */
router.post('/spp-requisites', async (req, res) => {
	try {
		const { inn, ogrn, userId } = req.body
		const sppSession = sppSessions.get(userId || 'default')

		console.log('=== SPP API Requisites for INN:', inn, '===')

		if (!sppSession) {
			return res.status(401).json({
				success: false,
				error: 'Требуется авторизация в API "Все о компаниях"',
			})
		}

		if (!inn && !ogrn) {
			return res.status(400).json({
				success: false,
				error: 'Необходим ИНН или ОГРН',
			})
		}

		const response = await axios.post(
			SBIS_SERVICES.spp,
			{
				jsonrpc: '2.0',
				method: 'SppAPI.Requisites',
				params: {
					inn: inn || null,
					ogrn: ogrn || null,
				},
				protocol: 4,
				id: Date.now(),
			},
			{
				headers: {
					'Content-Type': 'application/json; charset=UTF-8',
					Cookie: `sid=${sppSession}`,
					'User-Agent': 'WorldCashBox/1.0',
				},
				timeout: 30000,
			}
		)

		console.log(
			'SPP Requisites response:',
			JSON.stringify(response.data).substring(0, 500)
		)

		if (response.data.error) {
			return res.status(400).json({
				success: false,
				error: response.data.error.message || response.data.error,
			})
		}

		if (response.data.result) {
			const data = response.data.result

			// Извлекаем данные из ответа SPP API
			const result = {
				inn: data.INN || data.inn || inn,
				kpp: data.KPP || data.kpp,
				ogrn: data.OGRN || data.ogrn,
				name: data.Name || data.ShortName || data.FullName,
				fullName: data.FullName || data.Name,
				address: data.Address || data.LegalAddress,
				director: data.Director || data.HeadName,
				okved: data.OKVED || data.MainOKVED,
				status: data.State,
				registrationDate: data.RegistrationDate,
				source: 'spp-api',
			}

			return res.json({
				success: true,
				source: 'spp',
				data: result,
				raw: data, // Полные данные для отладки
			})
		}

		res.json({
			success: false,
			error: 'Данные не найдены',
		})
	} catch (error) {
		console.error(
			'SPP Requisites error:',
			error.response?.data || error.message
		)
		res.status(500).json({
			success: false,
			error: error.response?.data?.error?.message || error.message,
		})
	}
})

/**
 * POST /api/sbis-proxy/spp-find
 * Поиск контрагентов через API "Все о компаниях"
 *
 * Метод: Contractor.Find
 * URL: https://api.sbis.ru/spp-rest-api/service/
 */
router.post('/spp-find', async (req, res) => {
	try {
		const { query, page = 0, size = 20, userId } = req.body
		const sppSession = sppSessions.get(userId || 'default')

		console.log('=== SPP API Find:', query, '===')

		if (!sppSession) {
			return res.status(401).json({
				success: false,
				error: 'Требуется авторизация в API "Все о компаниях"',
			})
		}

		const response = await axios.post(
			SBIS_SERVICES.spp,
			{
				jsonrpc: '2.0',
				method: 'Contractor.Find',
				params: {
					requisites: query,
					page: page,
					size: size,
				},
				protocol: 5,
				id: Date.now(),
			},
			{
				headers: {
					'Content-Type': 'application/json; charset=UTF-8',
					Cookie: `sid=${sppSession}`,
					'User-Agent': 'WorldCashBox/1.0',
				},
				timeout: 30000,
			}
		)

		console.log(
			'SPP Find response:',
			JSON.stringify(response.data).substring(0, 500)
		)

		if (response.data.error) {
			return res.status(400).json({
				success: false,
				error: response.data.error.message || response.data.error,
			})
		}

		res.json({
			success: true,
			source: 'spp',
			data: response.data.result || [],
		})
	} catch (error) {
		console.error('SPP Find error:', error.response?.data || error.message)
		res.status(500).json({
			success: false,
			error: error.response?.data?.error?.message || error.message,
		})
	}
})

/**
 * POST /api/sbis-proxy/crm-client
 * Поиск клиента в ВАШЕЙ базе СБИС CRM по ИНН
 * Возвращает: реквизиты, сделки, документы
 *
 * ВАЖНО: Используются правильные методы CRM API:
 * - CRMLead.getList - список сделок
 * - CRMLead.read - чтение сделки
 * - Навигация.Контрагент.Список - список контрагентов
 */
router.post('/crm-client', async (req, res) => {
	try {
		const { inn, userId } = req.body
		const sessionId = userSessions.get(userId || 'default')

		console.log('=== CRM Client Search by INN:', inn, '===')

		if (!sessionId) {
			return res.status(401).json({
				success: false,
				error: 'Требуется авторизация в СБИС',
			})
		}

		const result = {
			found: false,
			contractor: null,
			deals: [],
			documents: [],
			balance: null,
			errors: [],
		}

		// Список методов для поиска контрагента в CRM
		// Основано на официальной документации Saby
		const contractorMethods = [
			// Официальные методы CRM API для работы с контрагентами
			{
				method: 'Навигация.Контрагент.Список',
				params: {
					Фильтр: { ИНН: inn },
					Навигация: {
						Страница: 0,
						РазмерСтраницы: 10,
					},
				},
			},
			{
				method: 'Навигация.Контрагент.Прочитать',
				params: { ИНН: inn },
			},
			// Реестр контрагентов (может работать в зависимости от прав)
			{
				method: 'Контрагент.Список',
				params: { Фильтр: { ИНН: inn }, Навигация: { Количество: 10 } },
			},
			{
				method: 'Контрагент.Прочитать',
				params: { ИНН: inn },
			},
			// Справочник (старый метод)
			{
				method: 'Справочник.Контрагенты',
				params: { Фильтр: { ИНН: inn } },
			},
			// Реестр (универсальный метод)
			{
				method: 'Реестр.СписокЗаписей',
				params: { ИмяРеестра: 'Контрагент', Фильтр: { ИНН: inn } },
			},
		]

		// Пробуем разные методы для поиска контрагента
		for (const m of contractorMethods) {
			try {
				console.log(`CRM: Trying ${m.method}...`)

				const response = await axios.post(
					SBIS_SERVICES.main,
					{
						jsonrpc: '2.0',
						method: m.method,
						params: m.params,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
						},
						timeout: 15000,
					}
				)

				if (response.data.result && !response.data.error) {
					console.log(`✅ CRM: Found via ${m.method}`)
					console.log(
						'Response:',
						JSON.stringify(response.data.result).substring(0, 300)
					)

					const data = response.data.result
					const contractor = Array.isArray(data) ? data[0] : data

					if (contractor) {
						result.found = true
						result.contractor = {
							id: contractor.Идентификатор || contractor.id || contractor.Id,
							inn: contractor.ИНН || contractor.inn || inn,
							kpp: contractor.КПП || contractor.kpp,
							ogrn: contractor.ОГРН || contractor.ogrn,
							name:
								contractor.Название ||
								contractor.НазваниеПолное ||
								contractor.name,
							address:
								contractor.Адрес || contractor.ЮрАдрес || contractor.address,
							phone: contractor.Телефон || contractor.phone,
							email: contractor.Email || contractor.email,
							source: 'crm',
							method: m.method,
						}
						break
					}
				} else if (response.data.error) {
					const errMsg =
						response.data.error.message || response.data.error.details
					console.log(`CRM: ${m.method} error:`, errMsg)
					result.errors.push({ method: m.method, error: errMsg })
				}
			} catch (error) {
				console.log(
					`CRM: ${m.method} exception:`,
					error.response?.status || error.message
				)
				result.errors.push({ method: m.method, error: error.message })
			}
		}

		// Если нашли контрагента - ищем сделки
		if (result.found) {
			const contractorId = result.contractor?.id
			const contractorInn = inn

			// Официальные методы CRM API для работы со сделками
			// Документация: https://saby.ru/help/integration/api/app_crm/load_lead
			const dealMethods = [
				// Официальный метод CRM для получения списка сделок
				{
					method: 'CRMLead.getList',
					params: {
						Фильтр: {
							Контрагент: { ИНН: contractorInn },
						},
						Навигация: {
							Страница: 0,
							РазмерСтраницы: 50,
						},
					},
				},
				// Альтернативный метод поиска по ID контрагента
				...(contractorId
					? [
							{
								method: 'CRMLead.getList',
								params: {
									Фильтр: {
										IDКонтрагента: contractorId,
									},
								},
							},
					  ]
					: []),
				// Старые методы (на случай, если новые не работают)
				{
					method: 'Сделка.Список',
					params: { Фильтр: { Контрагент: contractorInn } },
				},
				{
					method: 'Реестр.СписокЗаписей',
					params: {
						ИмяРеестра: 'Сделка',
						Фильтр: { ИНН: contractorInn },
					},
				},
			]

			for (const m of dealMethods) {
				try {
					console.log(`CRM Deals: Trying ${m.method}...`)

					const response = await axios.post(
						SBIS_SERVICES.main,
						{
							jsonrpc: '2.0',
							method: m.method,
							params: m.params,
							id: Date.now(),
						},
						{
							headers: {
								'Content-Type': 'application/json-rpc; charset=utf-8',
								'X-SBISSessionID': sessionId,
							},
							timeout: 15000,
						}
					)

					if (response.data.result && !response.data.error) {
						console.log(`✅ CRM Deals: Found via ${m.method}`)
						const deals = Array.isArray(response.data.result)
							? response.data.result
							: response.data.result?.Записи || []
						result.deals = deals.map(d => ({
							id: d.Идентификатор || d.id,
							name: d.Название || d.name,
							amount: d.Сумма || d.amount,
							status: d.Статус || d.status,
							date: d.Дата || d.date,
						}))
						break
					}
				} catch (error) {
					console.log(`CRM Deals: ${m.method} exception`)
				}
			}
		}

		// Если нашли контрагента - ищем документы
		if (result.found) {
			const docMethods = [
				{
					method: 'Документ.СписокДокументов',
					params: { Фильтр: { Контрагент: { ИНН: inn } } },
				},
				{
					method: 'Реестр.СписокЗаписей',
					params: {
						ИмяРеестра: 'ДокументНаОплату',
						Фильтр: { Контрагент: inn },
					},
				},
			]

			for (const m of docMethods) {
				try {
					console.log(`CRM Docs: Trying ${m.method}...`)

					const response = await axios.post(
						SBIS_SERVICES.main,
						{
							jsonrpc: '2.0',
							method: m.method,
							params: m.params,
							id: Date.now(),
						},
						{
							headers: {
								'Content-Type': 'application/json-rpc; charset=utf-8',
								'X-SBISSessionID': sessionId,
							},
							timeout: 15000,
						}
					)

					if (response.data.result && !response.data.error) {
						console.log(`✅ CRM Docs: Found via ${m.method}`)
						const docs = Array.isArray(response.data.result)
							? response.data.result
							: response.data.result?.Документы || []
						result.documents = docs.map(d => ({
							id: d.Идентификатор || d.id,
							type: d.Тип || d.type,
							number: d.Номер || d.number,
							date: d.Дата || d.date,
							amount: d.Сумма || d.amount,
							status: d.Состояние || d.status,
						}))
						break
					}
				} catch (error) {
					console.log(`CRM Docs: ${m.method} exception`)
				}
			}
		}

		console.log('=== CRM Client Result ===')
		console.log('Found:', result.found)
		console.log('Contractor:', result.contractor?.name)
		console.log('Deals:', result.deals.length)
		console.log('Documents:', result.documents.length)
		console.log('Errors:', result.errors.length)

		res.json({
			success: result.found,
			data: result,
		})
	} catch (error) {
		console.error('CRM Client error:', error.message)
		res.status(500).json({
			success: false,
			error: error.message,
		})
	}
})

/**
 * POST /api/sbis-proxy/crm-client-oauth
 * Поиск клиента в CRM СБИС (упрощенная версия без OAuth)
 * Использует обычную авторизацию по логину/паролю
 *
 * Параметры:
 * - inn: ИНН клиента для поиска
 * - includeDeals: включить сделки (по умолчанию true)
 * - includeDocuments: включить документы (по умолчанию true)
 *
 * Возвращает полную информацию о клиенте из вашей CRM
 */
router.post('/crm-client-oauth', async (req, res) => {
	try {
		const {
			inn,
			userId,
			includeDeals = true,
			includeDocuments = true,
		} = req.body
		const userKey = userId || 'default'

		console.log('=== CRM Client Search by INN:', inn, '===')

		// Получаем обычную сессию (авторизация по логину/паролю)
		let sessionId = userSessions.get(userKey)

		// Если сессии нет - возвращаем ошибку
		if (!sessionId) {
			return res.status(401).json({
				success: false,
				error: 'Требуется авторизация в СБИС',
				hint: 'Сначала вызовите /auth с логином и паролем',
			})
		}

		console.log('✅ Используем обычную сессию СБИС')

		const result = {
			found: false,
			contractor: null,
			deals: [],
			documents: [],
			balance: null,
			errors: [],
		}

		// ========================================
		// Шаг 1: Поиск контрагента по ИНН
		// ========================================
		// ВАЖНО: Используем SPP API (Все о компаниях), т.к. методы CRM недоступны

		// Сначала пробуем SPP API (api.sbis.ru)
		const sppSession = sppSessions.get(userKey)

		if (sppSession) {
			try {
				console.log('CRM: Trying SppAPI.Requisites (Все о компаниях)...')

				const sppResponse = await axios.post(
					SBIS_SERVICES.spp,
					{
						jsonrpc: '2.0',
						method: 'SppAPI.Requisites',
						params: {
							inn: inn,
							ogrn: null,
						},
						protocol: 4,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json; charset=UTF-8',
							Cookie: `sid=${sppSession}`,
							'User-Agent': 'WorldCashBox/1.0',
						},
						timeout: 15000,
					}
				)

				console.log(
					'CRM: SppAPI.Requisites response:',
					JSON.stringify(sppResponse.data).substring(0, 300)
				)

				if (sppResponse.data.result && !sppResponse.data.error) {
					console.log('✅ CRM: Found via SppAPI.Requisites')
					const data = sppResponse.data.result

					result.found = true
					result.contractor = {
						id: inn,
						inn: data.BaseRequisites?.INN || inn,
						kpp: data.BaseRequisites?.KPP,
						ogrn: data.BaseRequisites?.OGRN,
						name: data.BaseRequisites?.ShortName || data.BaseRequisites?.Name,
						shortName: data.BaseRequisites?.ShortName,
						address:
							data.BaseRequisites?.Address ||
							data.BaseRequisites?.ActualAddress,
						phone: data.ContactsOfficial?.Phone,
						email: data.ContactsOfficial?.Email,
						director: data.BaseRequisites?.Head,
					}
				} else {
					console.log('⚠️  CRM: SppAPI.Requisites returned error or no result')
					if (sppResponse.data.error) {
						console.log('CRM: SppAPI.Requisites error:', sppResponse.data.error)
						result.errors.push(
							`SppAPI.Requisites: ${sppResponse.data.error.message}`
						)
					}
				}
			} catch (error) {
				console.log('CRM: SppAPI.Requisites exception -', error.message)
				console.log(
					'CRM: SppAPI.Requisites error details:',
					error.response?.data || error
				)
				result.errors.push(`SppAPI.Requisites: ${error.message}`)
			}
		}

		// Если не нашли через SPP API - пробуем CRM методы
		if (!result.found) {
			// ПРАВИЛЬНЫЙ МЕТОД из документации СБИС CRM!
			// Контрагент.ПоИННКППКФ - находит или создает контрагента
			try {
				console.log(
					'CRM: Trying Контрагент.ПоИННКППКФ (официальный метод CRM)...'
				)

				const crmResponse = await axios.post(
					'https://online.sbis.ru/service/',
					{
						jsonrpc: '2.0',
						method: 'Контрагент.ПоИННКППКФ',
						params: {
							params: {
								// ВАЖНО: двойная обертка из документации!
								d: {
									ИНН: inn,
									КПП: '',
									Название: '',
								},
								s: {
									ИНН: 'Строка',
									КПП: 'Строка',
									Название: 'Строка',
								},
							},
						},
						protocol: 2, // ВАЖНО: версия протокола из документации!
						id: 0,
					},
					{
						headers: {
							Host: 'online.sbis.ru',
							'Content-Type': 'application/json-rpc; charset=utf-8',
							Accept: 'application/json-rpc',
							'X-SBISSessionID': sessionId,
						},
						timeout: 15000,
					}
				)

				console.log(
					'CRM: Контрагент.ПоИННКППКФ response:',
					JSON.stringify(crmResponse.data).substring(0, 500)
				)

				if (crmResponse.data.result && !crmResponse.data.error) {
					console.log('✅ CRM: Found via Контрагент.ПоИННКППКФ')
					const data = crmResponse.data.result

					// Контрагент.ПоИННКППКФ возвращает ID контрагента (число)
					const contractorId =
						typeof data === 'number' ? data : data['@Контрагент'] || data.id

					if (contractorId) {
						console.log(
							'📖 Получаем полную информацию о контрагенте ID:',
							contractorId
						)

						// Получаем полную информацию о контрагенте
						try {
							const detailsResponse = await axios.post(
								'https://online.sbis.ru/service/',
								{
									jsonrpc: '2.0',
									method: 'Контрагент.Прочитать',
									params: {
										params: {
											d: { '@Контрагент': contractorId },
											s: { '@Контрагент': 'Число целое' },
											_type: 'record',
											f: 0,
										},
									},
									protocol: 2,
									id: 0,
								},
								{
									headers: {
										Host: 'online.sbis.ru',
										'Content-Type': 'application/json-rpc; charset=utf-8',
										Accept: 'application/json-rpc',
										'X-SBISSessionID': sessionId,
									},
									timeout: 15000,
								}
							)

							console.log(
								'Контрагент.Прочитать response:',
								JSON.stringify(detailsResponse.data).substring(0, 800)
							)

							if (detailsResponse.data.result) {
								const details = detailsResponse.data.result

								// Парсим recordset формат
								let contractorData = {}
								if (details.d && details.s) {
									details.s.forEach((field, index) => {
										contractorData[field.n] = details.d[index]
									})
								} else if (typeof details === 'object') {
									contractorData = details
								}

								console.log(
									'✅ Полная информация получена:',
									Object.keys(contractorData)
								)

								result.found = true
								result.contractor = {
									id: contractorId,
									inn: contractorData.ИНН || contractorData.INN || inn,
									kpp: contractorData.КПП || contractorData.KPP || '',
									ogrn: contractorData.ОГРН || contractorData.OGRN || '',
									name:
										contractorData.Название ||
										contractorData.Name ||
										contractorData.НазваниеПолное ||
										`Контрагент ${inn}`,
									shortName:
										contractorData.НазваниеСокращенное ||
										contractorData.ShortName ||
										'',
									fullName:
										contractorData.НазваниеПолное ||
										contractorData.FullName ||
										'',
									address:
										contractorData.АдресЮридический ||
										contractorData.Address ||
										contractorData.АдресФактический ||
										'',
									legalAddress:
										contractorData.АдресЮридический ||
										contractorData.LegalAddress ||
										'',
									phone: contractorData.Телефон || contractorData.Phone || '',
									email: contractorData.Email || contractorData.Email || '',
									director:
										contractorData.Руководитель ||
										contractorData.Director ||
										'',
									source: 'sbis_crm',
								}
							} else {
								// Если не удалось получить детали - используем базовую информацию
								console.log(
									'⚠️  Не удалось получить полную информацию, используем базовую'
								)
								result.found = true
								result.contractor = {
									id: contractorId,
									inn: inn,
									kpp: '',
									name: `Контрагент ${inn}`,
									source: 'sbis_crm',
								}
							}
						} catch (detailsError) {
							console.log(
								'⚠️  Ошибка получения деталей контрагента:',
								detailsError.message
							)
							// Используем базовую информацию
							result.found = true
							result.contractor = {
								id: contractorId,
								inn: inn,
								kpp: '',
								name: `Контрагент ${inn}`,
								source: 'sbis_crm',
							}
						}
					}
				} else if (crmResponse.data.error) {
					console.log(
						'⚠️  CRM: Контрагент.ПоИННКППКФ error:',
						crmResponse.data.error.message
					)
					result.errors.push(
						`Контрагент.ПоИННКППКФ: ${crmResponse.data.error.message}`
					)
				}
			} catch (error) {
				console.log('CRM: Контрагент.ПоИННКППКФ exception -', error.message)
				result.errors.push(`Контрагент.ПоИННКППКФ: ${error.message}`)
			}

			// Если все еще не нашли - пробуем старые методы для совместимости
			const contractorMethods = [
				{
					method: 'Навигация.Контрагент.Список',
					params: {
						Фильтр: { ИНН: inn },
						Навигация: { Страница: 0, РазмерСтраницы: 10 },
					},
				},
				{
					method: 'Навигация.Контрагент.Прочитать',
					params: { ИНН: inn },
				},
				{
					method: 'Контрагент.Список',
					params: {
						Фильтр: { ИНН: inn },
						Навигация: { Количество: 10 },
					},
				},
			]

			for (const m of contractorMethods) {
				if (result.found) break

				try {
					console.log(`CRM: Trying ${m.method}...`)

					const response = await axios.post(
						SBIS_SERVICES.main,
						{
							jsonrpc: '2.0',
							method: m.method,
							params: m.params,
							id: Date.now(),
						},
						{
							headers: {
								'Content-Type': 'application/json-rpc; charset=utf-8',
								'X-SBISSessionID': sessionId,
							},
							timeout: 15000,
						}
					)

					if (response.data.result && !response.data.error) {
						console.log(`✅ CRM: Found via ${m.method}`)
						const data = response.data.result

						// Парсим результат (может быть массив или объект)
						let contractor = null
						if (Array.isArray(data) && data.length > 0) {
							contractor = data[0]
						} else if (data.Записи && data.Записи.length > 0) {
							contractor = data.Записи[0]
						} else if (data.ИНН || data.inn) {
							contractor = data
						}

						if (contractor) {
							result.found = true
							result.contractor = {
								id:
									contractor.Идентификатор ||
									contractor.id ||
									contractor['@Контрагент'],
								inn: contractor.ИНН || contractor.inn || inn,
								kpp: contractor.КПП || contractor.kpp,
								ogrn: contractor.ОГРН || contractor.ogrn,
								name:
									contractor.Название ||
									contractor.name ||
									contractor.НаименованиеПолное,
								shortName:
									contractor.НаименованиеСокращенное || contractor.shortName,
								address:
									contractor.Адрес ||
									contractor.address ||
									contractor.ЮридическийАдрес,
								phone: contractor.Телефон || contractor.phone,
								email: contractor.Email || contractor.email,
								director: contractor.Руководитель || contractor.director,
							}
							break
						}
					}
				} catch (error) {
					console.log(`OAuth CRM: ${m.method} exception -`, error.message)
					result.errors.push(`${m.method}: ${error.message}`)
				}
			}
		}

		// ========================================
		// Шаг 2: Если нашли - ищем сделки
		// ========================================
		if (result.found && includeDeals) {
			const dealMethods = [
				{
					method: 'CRMLead.getList',
					params: {
						Фильтр: { Контрагент: { ИНН: inn } },
						Навигация: { Страница: 0, РазмерСтраницы: 50 },
					},
				},
				{
					method: 'Сделка.Список',
					params: { Фильтр: { ИНН: inn } },
				},
			]

			for (const m of dealMethods) {
				try {
					console.log(`CRM Deals: Trying ${m.method}...`)

					const response = await axios.post(
						SBIS_SERVICES.main,
						{
							jsonrpc: '2.0',
							method: m.method,
							params: m.params,
							id: Date.now(),
						},
						{
							headers: {
								'Content-Type': 'application/json-rpc; charset=utf-8',
								'X-SBISSessionID': sessionId,
							},
							timeout: 15000,
						}
					)

					if (response.data.result && !response.data.error) {
						console.log(`✅ CRM Deals: Found via ${m.method}`)
						const deals = Array.isArray(response.data.result)
							? response.data.result
							: response.data.result?.Записи || []

						result.deals = deals.map(d => ({
							id: d.Идентификатор || d.id || d['@Документ'],
							name: d.Название || d.name || d.Наименование,
							amount: d.Сумма || d.amount,
							status: d.Статус || d.status || d.Состояние,
							date: d.Дата || d.date || d.ДатаСоздания,
							stage: d.Этап || d.stage,
							responsible: d.Ответственный || d.responsible,
						}))
						break
					}
				} catch (error) {
					console.log(`CRM Deals: ${m.method} exception`)
				}
			}
		}

		// ========================================
		// Шаг 3: Если нашли - ищем документы
		// ========================================
		if (result.found && includeDocuments) {
			const docMethods = [
				{
					method: 'Документ.СписокДокументов',
					params: { Фильтр: { Контрагент: { ИНН: inn } } },
				},
				{
					method: 'Реестр.СписокЗаписей',
					params: {
						ИмяРеестра: 'ДокументНаОплату',
						Фильтр: { Контрагент: inn },
					},
				},
			]

			for (const m of docMethods) {
				try {
					console.log(`CRM Docs: Trying ${m.method}...`)

					const response = await axios.post(
						SBIS_SERVICES.main,
						{
							jsonrpc: '2.0',
							method: m.method,
							params: m.params,
							id: Date.now(),
						},
						{
							headers: {
								'Content-Type': 'application/json-rpc; charset=utf-8',
								'X-SBISSessionID': sessionId,
							},
							timeout: 15000,
						}
					)

					if (response.data.result && !response.data.error) {
						console.log(`✅ CRM Docs: Found via ${m.method}`)
						const docs = Array.isArray(response.data.result)
							? response.data.result
							: response.data.result?.Документы || []

						result.documents = docs.map(d => ({
							id: d.Идентификатор || d.id,
							type: d.Тип || d.type,
							number: d.Номер || d.number,
							date: d.Дата || d.date,
							amount: d.Сумма || d.amount,
							status: d.Состояние || d.status,
						}))
						break
					}
				} catch (error) {
					console.log(`CRM Docs: ${m.method} exception`)
				}
			}
		}

		console.log('=== CRM Result ===')
		console.log('Found:', result.found)
		console.log('Contractor:', result.contractor?.name)
		console.log('Deals:', result.deals.length)
		console.log('Documents:', result.documents.length)
		console.log('Errors:', result.errors.length)

		res.json({
			success: result.found,
			data: result,
		})
	} catch (error) {
		console.error('CRM Client error:', error.message)
		res.status(500).json({
			success: false,
			error: error.message,
		})
	}
})

/**
 * POST /api/sbis-proxy/discover-methods
 * Автоматическое обнаружение доступных методов СБИС API
 * Помогает понять какие методы работают с вашей лицензией
 * Использует OAuth токен если доступен, иначе обычную сессию
 */
router.post('/discover-methods', async (req, res) => {
	try {
		const { userId } = req.body
		const userKey = userId || 'default'

		const oauthToken = oauthTokens.get(userKey)
		const sessionId = userSessions.get(userKey)

		// Определяем какой токен использовать
		const authToken = oauthToken || sessionId
		const authType = oauthToken ? 'OAuth' : 'Session'

		if (!authToken) {
			return res.status(401).json({
				error:
					'Требуется авторизация в СБИС (используйте /auth или /auth-service)',
			})
		}

		console.log('=== DISCOVERING AVAILABLE SBIS METHODS ===')
		console.log('Auth type:', authType)

		const results = {
			working: [],
			notWorking: [],
		}

		// Тестовые методы для разных сервисов СБИС
		// Включаем методы CRM, контрагентов, документов
		const methodsToTest = [
			// Базовые методы - для проверки формата
			{ method: 'Пользователь.Текущий', params: {} },
			{ method: 'Организация.Текущая', params: {} },
			{ method: 'Организация.Список', params: {} },

			// ===== ОФИЦИАЛЬНЫЕ CRM Методы (из документации Saby) =====
			{
				method: 'CRMLead.getList',
				params: {
					Навигация: { Страница: 0, РазмерСтраницы: 5 },
				},
			},
			{
				method: 'CRMLead.read',
				params: { ID: 1 },
			},
			{
				method: 'Навигация.Контрагент.Список',
				params: {
					Навигация: { Страница: 0, РазмерСтраницы: 5 },
				},
			},
			{
				method: 'Навигация.Контрагент.Прочитать',
				params: { ИНН: '7707083893' },
			},

			// ===== Старые методы (для совместимости) =====
			{ method: 'CRM.СписокКлиентов', params: {} },
			{ method: 'CRM.ПоискКлиента', params: { ИНН: '7707083893' } },
			{ method: 'Клиент.Список', params: {} },
			{ method: 'Клиент.Поиск', params: { ИНН: '7707083893' } },

			// ===== Контрагенты =====
			{ method: 'Контрагент.Список', params: {} },
			{ method: 'Контрагент.Найти', params: { ИНН: '7707083893' } },
			{ method: 'Контрагент.Прочитать', params: { ИНН: '7707083893' } },
			{ method: 'Контрагенты.Список', params: {} },

			// ===== Сделки =====
			{ method: 'Сделка.Список', params: {} },
			{ method: 'Сделка.СписокПоКлиенту', params: { ИНН: '7707083893' } },
			{ method: 'Сделки.Список', params: {} },

			// ===== Документы =====
			{ method: 'Документ.Список', params: {} },
			{ method: 'Документ.СписокДокументов', params: {} },
			{ method: 'Документы.Список', params: {} },

			// ===== Реестры =====
			{ method: 'Реестр.СписокРеестров', params: {} },
			{ method: 'Реестр.Список', params: {} },

			// ===== Справочники =====
			{ method: 'Справочник.Контрагенты', params: {} },
			{ method: 'Справочник.Организации', params: {} },
			{ method: 'Справочник.Список', params: {} },

			// ===== Методы с префиксом СБИС. =====
			{ method: 'СБИС.СписокКонтрагентов', params: {} },
			{ method: 'СБИС.НайтиКонтрагента', params: { ИНН: '7707083893' } },
			{ method: 'СБИС.СписокСделок', params: {} },
			{ method: 'СБИС.ТекущаяОрганизация', params: {} },

			// ===== Методы поиска =====
			{ method: 'Поиск.Контрагент', params: { Запрос: 'сбербанк' } },
			{ method: 'Поиск.Клиент', params: { Запрос: 'сбербанк' } },
		]

		// Формируем заголовки в зависимости от типа авторизации
		const getHeaders = () => {
			if (oauthToken) {
				return {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISAccessToken': oauthToken,
				}
			}
			return {
				'Content-Type': 'application/json-rpc; charset=utf-8',
				'X-SBISSessionID': sessionId,
			}
		}

		for (const test of methodsToTest) {
			try {
				console.log(`Testing: ${test.method}...`)

				const response = await axios.post(
					SBIS_SERVICES.main,
					{
						jsonrpc: '2.0',
						method: test.method,
						params: test.params,
						id: Date.now(),
					},
					{
						headers: getHeaders(),
						timeout: 10000,
					}
				)

				if (response.data.error) {
					const errCode = response.data.error.code
					const errMsg =
						response.data.error.message || response.data.error.details
					console.log(`❌ ${test.method}: [${errCode}] ${errMsg}`)
					results.notWorking.push({
						method: test.method,
						error: errMsg,
						code: errCode,
					})
				} else {
					console.log(`✅ ${test.method}: WORKS!`)
					// Выводим полный результат для работающих методов
					console.log(
						`   Result: ${JSON.stringify(response.data.result).substring(
							0,
							500
						)}`
					)
					results.working.push({
						method: test.method,
						sample: JSON.stringify(response.data.result).substring(0, 500),
					})
				}
			} catch (error) {
				// Для HTTP ошибок выводим больше деталей
				const status = error.response?.status
				const errData = error.response?.data
				console.log(
					`❌ ${test.method}: HTTP ${status || 'ERR'} - ${error.message}`
				)
				if (errData) {
					console.log(
						`   Response: ${JSON.stringify(errData).substring(0, 200)}`
					)
				}
				results.notWorking.push({
					method: test.method,
					error: error.message,
					status: status,
					response: errData ? JSON.stringify(errData).substring(0, 200) : null,
				})
			}
		}

		console.log('=== DISCOVERY COMPLETE ===')
		console.log('Working methods:', results.working.length)
		console.log('Not working:', results.notWorking.length)

		res.json({
			success: true,
			summary: {
				working: results.working.length,
				notWorking: results.notWorking.length,
			},
			results,
		})
	} catch (error) {
		console.error('Discover error:', error.message)
		res.status(500).json({ error: error.message })
	}
})

/**
 * POST /api/sbis-proxy/test-method
 * Тест любого метода СБИС API (для отладки)
 */
router.post('/test-method', async (req, res) => {
	try {
		const { method, params, userId, service } = req.body
		const sessionId = userSessions.get(userId || 'default')

		// Выбираем сервис
		const serviceUrl = SBIS_SERVICES[service] || SBIS_API_URL

		console.log('=== SBIS TEST METHOD ===')
		console.log('Method:', method)
		console.log('Service:', service, '->', serviceUrl)
		console.log('Params:', JSON.stringify(params, null, 2))
		console.log('Session:', sessionId)

		if (!sessionId) {
			return res.status(401).json({ error: 'Требуется авторизация в СБИС' })
		}

		const response = await axios.post(
			serviceUrl,
			{
				jsonrpc: '2.0',
				method,
				params: params || {},
				id: Date.now(),
			},
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISSessionID': sessionId,
				},
				timeout: 30000,
			}
		)

		console.log('=== SBIS RESPONSE ===')
		console.log(JSON.stringify(response.data, null, 2))

		res.json(response.data)
	} catch (error) {
		console.error('Test method error:', error.response?.data || error.message)
		res.status(500).json({
			error: error.response?.data || error.message,
		})
	}
})

/**
 * POST /api/sbis-proxy/discover
 * Автоматическое определение доступных методов
 */
router.post('/discover', async (req, res) => {
	try {
		const { userId } = req.body
		const sessionId = userSessions.get(userId || 'default')

		if (!sessionId) {
			return res.status(401).json({ error: 'Требуется авторизация в СБИС' })
		}

		console.log('=== SBIS DISCOVER AVAILABLE METHODS ===')

		const results = {}

		// Тестируем разные сервисы и методы
		const testCases = [
			// Основной сервис
			{ service: 'main', method: 'СБИС.ПолучитьСписокМетодов', params: {} },
			{ service: 'main', method: 'СБИС.ИнформацияОПользователе', params: {} },
			{ service: 'main', method: 'СБИС.ТекущаяОрганизация', params: {} },

			// ЭДО сервис
			{
				service: 'edo',
				method: 'СБИС.СписокДокументов',
				params: { Фильтр: {} },
			},
			{ service: 'edo', method: 'СБИС.СписокКонтрагентов', params: {} },

			// Контрагенты сервис
			{ service: 'contractors', method: 'Контрагент.Список', params: {} },
			{
				service: 'contractors',
				method: 'Контрагент.НайтиПоИНН',
				params: { ИНН: '7707083893' },
			},
		]

		for (const test of testCases) {
			const serviceUrl = SBIS_SERVICES[test.service]
			const key = `${test.service}:${test.method}`

			try {
				console.log(`Testing: ${key}`)

				const response = await axios.post(
					serviceUrl,
					{
						jsonrpc: '2.0',
						method: test.method,
						params: test.params,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
						},
						timeout: 10000,
					}
				)

				if (response.data.error) {
					results[key] = {
						status: 'error',
						error: response.data.error.message || response.data.error.details,
					}
				} else {
					results[key] = {
						status: 'success',
						result: JSON.stringify(response.data.result).substring(0, 200),
					}
					console.log(`✅ ${key} - WORKS!`)
				}
			} catch (error) {
				results[key] = {
					status: 'failed',
					error: error.response?.data?.error?.message || error.message,
				}
			}
		}

		console.log('=== DISCOVER RESULTS ===')
		console.log(JSON.stringify(results, null, 2))

		res.json({
			success: true,
			availableServices: Object.keys(SBIS_SERVICES),
			testResults: results,
		})
	} catch (error) {
		console.error('Discover error:', error.message)
		res.status(500).json({ error: error.message })
	}
})

/**
 * POST /api/sbis-proxy/search-contractor
 * Поиск контрагента по ИНН
 *
 * Использует публичные API (ФНС, DaData) + СБИС если доступен
 */
router.post('/search-contractor', async (req, res) => {
	try {
		const { inn, userId } = req.body
		const userKey = userId || 'default'

		console.log('=== Search contractor by INN:', inn, '===')

		// Получаем сессии
		const sessionId = userSessions.get(userKey)
		const sppSession = sppSessions.get(userKey)

		// 1. ПРИОРИТЕТ: СБИС API (SPP + ЭДО)
		if (sessionId || sppSession) {
			console.log(
				'Trying SBIS API (SPP:',
				!!sppSession,
				', EDO:',
				!!sessionId,
				')...'
			)
			const sbisResult = await searchContractorSBIS(inn, sessionId, userKey)
			if (sbisResult && sbisResult.name && !sbisResult.name.includes('(ИНН:')) {
				console.log(
					'✅ Found via SBIS:',
					sbisResult.name,
					'(source:',
					sbisResult.source,
					')'
				)
				return res.json({
					success: true,
					source: sbisResult.source || 'sbis',
					data: sbisResult,
				})
			}
		} else {
			console.log('No SBIS sessions (neither SPP nor EDO)')
		}

		// 2. FALLBACK: ЕГРЮЛ (официальные данные ФНС)
		try {
			console.log('Trying EGRUL API...')
			const egrulResult = await searchContractorItsoft(inn)
			if (
				egrulResult &&
				egrulResult.name &&
				!egrulResult.name.includes('(ИНН:')
			) {
				console.log('✅ Found via EGRUL:', egrulResult.name)
				return res.json({
					success: true,
					source: 'egrul',
					data: egrulResult,
				})
			}
		} catch (egrulError) {
			console.log('EGRUL API failed:', egrulError.message)
		}

		// Ничего не найдено - возвращаем базовую информацию с ИНН
		console.log('No API returned data, using basic info for INN:', inn)
		const isIP = inn.length === 12
		res.json({
			success: true,
			source: 'basic',
			data: {
				inn: inn,
				name: isIP ? `ИП (ИНН: ${inn})` : `Организация (ИНН: ${inn})`,
				type: isIP ? 'INDIVIDUAL' : 'LEGAL',
				isVerified: false,
				message:
					'Данные организации будут загружены после настройки интеграции',
			},
		})
	} catch (error) {
		console.error('Search contractor error:', error.message)
		res.status(500).json({
			success: false,
			error: error.message,
		})
	}
})

/**
 * Поиск через ЕГРЮЛ API (egrul.itsoft.ru)
 * Официальные данные из реестра ФНС
 */
async function searchContractorItsoft(inn) {
	try {
		console.log('Trying itsoft API for INN:', inn)
		const response = await axios.get(`https://egrul.itsoft.ru/${inn}.json`, {
			timeout: 15000,
			headers: {
				'User-Agent': 'WorldCashBox/1.0',
				Accept: 'application/json',
			},
		})

		const data = response.data
		console.log('Itsoft API: got response')

		if (data) {
			const isIP = inn.length === 12
			let name = ''
			let fullName = ''
			let ogrn = ''
			let address = ''
			let email = ''

			if (isIP && data.СвИП) {
				// ИП - данные в структуре СвИП
				const svIP = data.СвИП
				const svFL = svIP.СвФЛ || {}
				const fioRus = svFL.ФИОРус?.['@attributes'] || svFL.ФИОРус || {}

				const surname = fioRus.Фамилия || ''
				const firstName = fioRus.Имя || ''
				const patronymic = fioRus.Отчество || ''

				// Форматируем ФИО с заглавной буквы
				const formatName = str => {
					if (!str) return ''
					return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
				}

				const fio = `${formatName(surname)} ${formatName(
					firstName
				)} ${formatName(patronymic)}`.trim()

				if (fio && fio.length > 3) {
					name = `ИП ${fio}`
					fullName = `Индивидуальный предприниматель ${fio}`
				}

				// ОГРНИП из атрибутов
				ogrn = svIP['@attributes']?.ОГРНИП || svIP.ОГРНИП || ''

				// Email если есть
				email = svIP.СвАдрЭлПочты?.['@attributes']?.['E-mail'] || ''

				console.log('Parsed IP:', { name, ogrn, email })
			} else if (!isIP && data.СвЮЛ) {
				// Юрлицо - данные в структуре СвЮЛ
				const svUL = data.СвЮЛ
				const svNaim = svUL.СвНаимЮЛ?.['@attributes'] || svUL.СвНаимЮЛ || {}

				name =
					svNaim.НаимЮЛСокр ||
					svNaim.НаимЮЛПолн ||
					svUL.НаимСокр ||
					svUL.НаимПолн ||
					''
				fullName = svNaim.НаимЮЛПолн || name
				ogrn = svUL['@attributes']?.ОГРН || svUL.ОГРН || ''

				// Адрес
				const svAdr = svUL.СвАдресЮЛ?.АдресРФ?.['@attributes'] || {}
				address = [
					svAdr.Индекс,
					svAdr.Регион,
					svAdr.Город,
					svAdr.Улица,
					svAdr.Дом,
				]
					.filter(Boolean)
					.join(', ')

				console.log('Parsed UL:', { name, ogrn })
			}

			// Проверяем что имя найдено
			if (name && name.length > 5) {
				return {
					inn: inn,
					kpp: '',
					ogrn: ogrn,
					name: name,
					fullName: fullName || name,
					address: address,
					email: email,
					director: isIP ? name : '',
					status: 'active',
					type: isIP ? 'INDIVIDUAL' : 'LEGAL',
				}
			}
		}
	} catch (error) {
		console.log('Itsoft API error:', error.message)
	}
	return null
}

/**
 * Поиск через DaData API (бесплатный)
 */
async function searchContractorDaData(inn) {
	try {
		const response = await axios.post(
			'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party',
			{ query: inn },
			{
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					// Публичный токен для suggestions (бесплатно)
					Authorization: 'Token ' + (process.env.DADATA_TOKEN || ''),
				},
				timeout: 10000,
			}
		)

		const suggestion = response.data?.suggestions?.[0]
		if (suggestion) {
			return {
				inn: suggestion.data.inn,
				kpp: suggestion.data.kpp,
				ogrn: suggestion.data.ogrn,
				name: suggestion.value,
				fullName: suggestion.data.name?.full_with_opf || suggestion.value,
				address: suggestion.data.address?.value,
				director: suggestion.data.management?.name,
				status: suggestion.data.state?.status,
				type: suggestion.data.type, // LEGAL или INDIVIDUAL
			}
		}
	} catch (error) {
		console.log('DaData error:', error.message)
	}
	return null
}

/**
 * Поиск через ФНС API
 */
async function searchContractorFNS(inn) {
	try {
		// Шаг 1: Запрос поиска
		const searchResponse = await axios.post(
			'https://egrul.nalog.ru/',
			`vyession=&query=${inn}`,
			{
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				timeout: 10000,
			}
		)

		const token = searchResponse.data?.t
		if (!token) {
			console.log('FNS: no token received')
			return null
		}

		// Ждём немного
		await new Promise(resolve => setTimeout(resolve, 1000))

		// Шаг 2: Получаем результат
		const resultResponse = await axios.get(
			`https://egrul.nalog.ru/search-result/${token}`,
			{
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				timeout: 10000,
			}
		)

		if (resultResponse.data?.rows?.[0]) {
			const row = resultResponse.data.rows[0]
			return {
				inn: row.i || inn,
				name: row.n,
				ogrn: row.o,
				address: row.a,
				kpp: row.p,
				type: row.k === 'fl' ? 'INDIVIDUAL' : 'LEGAL',
			}
		}
	} catch (error) {
		console.log('FNS error:', error.message)
	}
	return null
}

/**
 * Поиск контрагента через SPP API (Все о компаниях)
 *
 * Метод: SppAPI.Requisites
 * URL: https://api.sbis.ru/spp-rest-api/service/
 * Документация: api_about_company.md
 */
async function searchContractorSPP(inn, userId = 'default') {
	const sppSession = sppSessions.get(userId)

	if (!sppSession) {
		console.log('SPP: No session available')
		return null
	}

	try {
		console.log(`SPP API: Searching for INN ${inn}...`)

		const response = await axios.post(
			SBIS_SERVICES.spp,
			{
				jsonrpc: '2.0',
				method: 'SppAPI.Requisites',
				params: {
					inn: inn,
					ogrn: null,
				},
				protocol: 4,
				id: Date.now(),
			},
			{
				headers: {
					'Content-Type': 'application/json; charset=UTF-8',
					Cookie: `sid=${sppSession}`,
					'User-Agent': 'WorldCashBox/1.0',
				},
				timeout: 15000,
			}
		)

		if (response.data.error) {
			console.log(
				'SPP API error:',
				response.data.error.message || response.data.error
			)
			return null
		}

		if (response.data.result) {
			const data = response.data.result
			console.log('✅ SPP API: Found company data')
			console.log('SPP data:', JSON.stringify(data).substring(0, 300))

			// Извлекаем данные из ответа SPP API
			const name = data.Name || data.ShortName || data.FullName

			if (name) {
				return {
					inn: data.INN || inn,
					kpp: data.KPP,
					ogrn: data.OGRN,
					name: name,
					fullName: data.FullName || name,
					address: data.Address || data.LegalAddress,
					director: data.Director || data.HeadName,
					okved: data.OKVED || data.MainOKVED,
					status: data.State,
					registrationDate: data.RegistrationDate,
					source: 'spp-api',
				}
			}
		}
	} catch (error) {
		console.log('SPP API exception:', error.response?.status, error.message)
	}

	return null
}

/**
 * Поиск контрагента через СБИС API
 *
 * Порядок поиска:
 * 1. SPP API (Все о компаниях) - api.sbis.ru
 * 2. ЭДО API - online.sbis.ru (если подключен)
 *
 * Документация: https://saby.ru/help/integration/api
 */
async function searchContractorSBIS(inn, sessionId, userId = 'default') {
	// 1. Сначала пробуем SPP API (Все о компаниях)
	const sppResult = await searchContractorSPP(inn, userId)
	if (sppResult) {
		return sppResult
	}

	// 2. Пробуем методы ЭДО на online.sbis.ru
	if (!sessionId) {
		console.log('SBIS: No online session, skipping EDO methods')
		return null
	}

	const methods = [
		// API ЭДО - список контрагентов с фильтром
		{
			method: 'СБИС.СписокКонтрагентов',
			params: { Фильтр: { ИНН: inn } },
			service: 'ЭДО',
		},
		// API ЭДО - карточка контрагента
		{
			method: 'СБИС.КарточкаКонтрагента',
			params: { ИНН: inn },
			service: 'ЭДО',
		},
	]

	for (const m of methods) {
		try {
			console.log(`SBIS EDO: Trying ${m.method}...`)
			const response = await axios.post(
				SBIS_SERVICES.edo,
				{
					jsonrpc: '2.0',
					method: m.method,
					params: m.params,
					id: Date.now(),
				},
				{
					headers: {
						'Content-Type': 'application/json-rpc; charset=utf-8',
						'X-SBISSessionID': sessionId,
					},
					timeout: 10000,
				}
			)

			// Проверяем на ошибку "метод не найден"
			if (response.data.error) {
				const code = response.data.error.code
				if (code === -32601) {
					console.log(`SBIS EDO: ${m.method} not available`)
					continue
				}
				console.log(`SBIS EDO: ${m.method} error:`, response.data.error.message)
				continue
			}

			if (response.data.result) {
				const result = response.data.result
				const contractor = Array.isArray(result) ? result[0] : result

				if (contractor) {
					console.log(`✅ SBIS EDO: Found via ${m.method}`)

					const name =
						contractor.Название || contractor.НазваниеПолное || contractor.name

					if (name) {
						return {
							id: contractor.Идентификатор || contractor.id,
							inn: contractor.ИНН || contractor.inn || inn,
							kpp: contractor.КПП || contractor.kpp,
							ogrn: contractor.ОГРН || contractor.ogrn,
							name: name,
							fullName: contractor.НазваниеПолное || name,
							address: contractor.ЮрАдрес || contractor.Адрес,
							director: contractor.Руководитель,
							source: 'sbis-edo',
							method: m.method,
						}
					}
				}
			}
		} catch (error) {
			console.log(`SBIS EDO: ${m.method} exception:`, error.message)
		}
	}

	console.log('SBIS: No contractor API methods available')
	return null
}

/**
 * POST /api/sbis-proxy/create-invoice
 * Создание счета
 */
router.post('/create-invoice', async (req, res) => {
	try {
		const { invoiceData, userId } = req.body
		const sessionId = userSessions.get(userId || 'default')

		console.log('Create invoice:', invoiceData?.amount, 'Session:', !!sessionId)

		if (!sessionId) {
			return res.status(401).json({ error: 'Требуется авторизация в СБИС' })
		}

		const document = {
			Тип: 'СчетНаОплату',
			Дата: new Date().toISOString().split('T')[0],
			Номер: invoiceData.number || `WCB-${Date.now()}`,
			НашаОрганизация: {
				ИНН: invoiceData.sellerINN,
			},
			Контрагент: {
				ИНН: invoiceData.buyerINN,
				КПП: invoiceData.buyerKPP,
				Название: invoiceData.buyerName,
			},
			Сумма: invoiceData.amount,
			Позиции: [
				{
					НомерСтроки: 1,
					Наименование: invoiceData.description || 'Пополнение баланса',
					Количество: 1,
					Цена: invoiceData.amount,
					Сумма: invoiceData.amount,
					ЕдиницаИзмерения: 'шт',
				},
			],
			Примечание: invoiceData.comment || 'Счет создан через WorldCashBox',
		}

		const response = await axios.post(
			SBIS_API_URL,
			{
				jsonrpc: '2.0',
				method: 'СБИС.ЗаписатьДокумент',
				params: {
					Документ: document,
				},
				id: Date.now(),
			},
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISSessionID': sessionId,
				},
				timeout: 30000,
			}
		)

		console.log(
			'Create invoice response:',
			JSON.stringify(response.data).substring(0, 300)
		)

		if (response.data.error) {
			return res
				.status(400)
				.json({ error: response.data.error.message || response.data.error })
		}

		const result = response.data.result
		res.json({
			success: true,
			data: {
				id: result?.Идентификатор,
				number: result?.Номер,
				date: result?.Дата,
				amount: result?.Сумма,
				status: result?.Состояние || 'created',
			},
		})
	} catch (error) {
		console.error(
			'Create invoice error:',
			error.response?.data || error.message
		)
		res.status(500).json({
			success: false,
			error:
				error.response?.data?.error?.message ||
				error.response?.data?.error ||
				error.message,
		})
	}
})

/**
 * POST /api/sbis-proxy/get-documents
 * Получение документов/платежей контрагента
 */
router.post('/get-documents', async (req, res) => {
	try {
		const { contractorINN, limit, userId } = req.body
		const sessionId = userSessions.get(userId || 'default')

		console.log('Get documents for:', contractorINN, 'Session:', !!sessionId)

		if (!sessionId) {
			return res.status(401).json({ error: 'Требуется авторизация в СБИС' })
		}

		// Расширенный список методов для получения документов
		// Пробуем разные варианты в зависимости от доступных прав
		const methods = [
			// Метод для получения реестра документов (Бизнес API)
			{
				name: 'СБИС.СписокРеестра',
				params: {
					ИмяРеестра: 'СчетНаОплату',
					Фильтр: { Контрагент: { ИНН: contractorINN } },
					Навигация: { Количество: limit || 50 },
				},
			},
			// Метод для получения списка документов (ЭДО)
			{
				name: 'СБИС.СписокДокументов',
				params: {
					Фильтр: {
						Контрагент: { ИНН: contractorINN },
						ТипДокумента: 'СчётНаОплату',
					},
					Навигация: { Количество: limit || 50 },
				},
			},
			// Метод для поиска документов
			{
				name: 'СБИС.ПоискДокументов',
				params: {
					Фильтр: { КонтрагентИНН: contractorINN },
				},
			},
			// Универсальный метод списка
			{
				name: 'СБИС.СписокДокументовПоСобытиям',
				params: {
					Фильтр: {
						Контрагент: { ИНН: contractorINN },
					},
					Навигация: { Количество: limit || 50 },
				},
			},
			// Альтернативный метод
			{
				name: 'Документ.СписокДокументов',
				params: {
					Фильтр: {
						Контрагент: contractorINN,
					},
				},
			},
			// Реестр счетов
			{
				name: 'Реестр.СчетаНаОплату',
				params: {
					Фильтр: { КонтрагентИНН: contractorINN },
				},
			},
		]

		for (const method of methods) {
			try {
				console.log(`Trying documents method: ${method.name}`)

				const response = await axios.post(
					SBIS_API_URL,
					{
						jsonrpc: '2.0',
						method: method.name,
						params: method.params,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
						},
						timeout: 30000,
					}
				)

				// Если метод не найден - пропускаем
				if (response.data.error) {
					const errorCode = response.data.error.code
					if (errorCode === -32601) {
						console.log(`Method ${method.name} not available (code: -32601)`)
						continue
					}
					console.log(`Method ${method.name} failed:`, response.data.error)
					continue
				}

				console.log(
					`✅ Response for ${method.name}:`,
					JSON.stringify(response.data).substring(0, 300)
				)

				if (response.data.result) {
					const result = response.data.result
					const documents = Array.isArray(result)
						? result
						: result?.Документы || result?.Записи || []

					let totalSpent = 0
					const payments = documents.map(doc => {
						const amount = parseFloat(doc.Сумма) || 0
						if (doc.Состояние === 'Оплачен') totalSpent += amount
						return {
							id: doc.Идентификатор,
							date: doc.Дата,
							amount,
							description: doc.Примечание || doc.Наименование,
							status: doc.Состояние,
						}
					})

					return res.json({
						success: true,
						method: method.name,
						data: { totalSpent, payments },
					})
				}
			} catch (methodError) {
				console.log(
					`Method ${method.name} failed:`,
					methodError.response?.data?.error || methodError.message
				)
			}
		}

		// Если ни один метод не сработал
		console.log('⚠️ No document methods available for this SBIS account')
		res.json({
			success: true,
			data: {
				totalSpent: 0,
				payments: [],
				message: 'API методы документов недоступны для данного тарифа СБИС',
				hint: 'Проверьте права доступа в настройках СБИС или обратитесь в поддержку',
			},
		})
	} catch (error) {
		console.error('Get documents error:', error.response?.data || error.message)
		res.json({
			success: true,
			data: {
				totalSpent: 0,
				payments: [],
			},
		})
	}
})

/**
 * POST /api/sbis-proxy/logout
 * Выход из СБИС
 */
router.post('/logout', async (req, res) => {
	try {
		const { userId } = req.body
		const sessionId = userSessions.get(userId || 'default')

		if (sessionId) {
			try {
				await axios.post(
					SBIS_API_URL,
					{
						jsonrpc: '2.0',
						method: 'СБИС.Выход',
						params: {},
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
						},
					}
				)
			} catch (e) {
				console.log('Logout request failed:', e.message)
			}
			userSessions.delete(userId || 'default')
		}

		res.json({ success: true, message: 'Logged out' })
	} catch (error) {
		// Игнорируем ошибки при выходе
		userSessions.delete(req.body.userId || 'default')
		res.json({ success: true, message: 'Logged out' })
	}
})

/**
 * GET /api/sbis-proxy/status
 * Проверка статуса подключения
 */
router.get('/status', (req, res) => {
	const userId = req.query.userId || 'default'
	const hasSession = userSessions.has(userId)
	res.json({
		connected: hasSession,
		sessionsCount: userSessions.size,
	})
})

/**
 * POST /api/sbis-proxy/list-methods
 * Получить список доступных методов СБИС
 */
router.post('/list-methods', async (req, res) => {
	try {
		const { userId } = req.body
		const sessionId = userSessions.get(userId || 'default')

		if (!sessionId) {
			return res.status(401).json({ error: 'Требуется авторизация в СБИС' })
		}

		// Пробуем получить информацию о доступных сервисах
		const response = await axios.post(
			SBIS_API_URL,
			{
				jsonrpc: '2.0',
				method: 'СБИС.ПолучитьСписокМетодов',
				params: {},
				id: Date.now(),
			},
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISSessionID': sessionId,
				},
				timeout: 30000,
			}
		)

		console.log(
			'List methods response:',
			JSON.stringify(response.data, null, 2)
		)
		res.json(response.data)
	} catch (error) {
		console.error('List methods error:', error.response?.data || error.message)
		res.status(500).json({
			error: error.response?.data || error.message,
		})
	}
})

/**
 * POST /api/sbis-proxy/diagnose
 * Диагностика доступных API методов для данного аккаунта СБИС
 * Помогает понять, какие методы доступны на текущем тарифе
 *
 * Документация: https://saby.ru/help/integration/api
 */
router.post('/diagnose', async (req, res) => {
	try {
		const { userId } = req.body
		const userKey = userId || 'default'
		const sessionId = userSessions.get(userKey)
		const sppSession = sppSessions.get(userKey)

		// Нужна хотя бы одна сессия
		if (!sessionId && !sppSession) {
			return res.status(401).json({ error: 'Требуется авторизация в СБИС' })
		}

		console.log('=== SBIS API DIAGNOSTICS ===')
		console.log('Online session:', !!sessionId)
		console.log('SPP session:', !!sppSession)

		const results = {
			userInfo: null,
			organization: null,
			officialMethodsList: null,
			availableMethods: [],
			unavailableMethods: [],
			recommendations: [],
			tariffInfo: null,
			sppAvailable: false,
		}

		// ========================================
		// 0. ТЕСТИРУЕМ SPP API (Все о компаниях)
		// ========================================
		if (sppSession) {
			try {
				console.log('📋 Тестируем SPP API (SppAPI.Requisites)...')
				const sppResponse = await axios.post(
					SBIS_SERVICES.spp,
					{
						jsonrpc: '2.0',
						method: 'SppAPI.Requisites',
						params: {
							inn: '7712040126', // Демо ИНН (Аэрофлот)
							ogrn: null,
						},
						protocol: 4,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json; charset=UTF-8',
							Cookie: `sid=${sppSession}`,
							'User-Agent': 'WorldCashBox/1.0',
						},
						timeout: 15000,
					}
				)

				if (sppResponse.data.result) {
					results.sppAvailable = true
					results.availableMethods.push('SppAPI.Requisites (Все о компаниях)')
					console.log('✅ SPP API работает!')
					console.log(
						'SPP response:',
						JSON.stringify(sppResponse.data.result).substring(0, 200)
					)
				} else if (sppResponse.data.error) {
					console.log('❌ SPP API ошибка:', sppResponse.data.error.message)
					results.unavailableMethods.push(
						'SppAPI.Requisites (Все о компаниях): ' +
							sppResponse.data.error.message
					)
				}
			} catch (e) {
				console.log('❌ SPP API исключение:', e.response?.status, e.message)
				results.unavailableMethods.push(
					'SppAPI.Requisites (Все о компаниях): ' + e.message
				)
			}

			// Тестируем Contractor.Find
			try {
				console.log('📋 Тестируем SPP API (Contractor.Find)...')
				const findResponse = await axios.post(
					SBIS_SERVICES.spp,
					{
						jsonrpc: '2.0',
						method: 'Contractor.Find',
						params: {
							requisites: 'Аэрофлот',
							page: 0,
							size: 5,
						},
						protocol: 5,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json; charset=UTF-8',
							Cookie: `sid=${sppSession}`,
							'User-Agent': 'WorldCashBox/1.0',
						},
						timeout: 15000,
					}
				)

				if (findResponse.data.result) {
					results.availableMethods.push('Contractor.Find (Все о компаниях)')
					console.log('✅ Contractor.Find работает!')
				} else if (findResponse.data.error) {
					results.unavailableMethods.push(
						'Contractor.Find: ' + findResponse.data.error.message
					)
				}
			} catch (e) {
				console.log('❌ Contractor.Find исключение:', e.message)
			}
		} else {
			results.recommendations.push(
				'⚠️ SPP API (Все о компаниях) не авторизован'
			)
		}

		// ========================================
		// 1. ТЕСТИРУЕМ Online SBIS (ЭДО)
		// ========================================
		if (!sessionId) {
			results.recommendations.push('⚠️ Online SBIS (ЭДО) не авторизован')
		} else {
			// Получаем официальный список доступных методов через СБИС.СписокМетодов
			try {
				console.log('📋 Запрашиваем СБИС.СписокМетодов...')
				const methodsListResponse = await axios.post(
					SBIS_API_URL,
					{
						jsonrpc: '2.0',
						method: 'СБИС.СписокМетодов',
						params: {},
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
						},
						timeout: 15000,
					}
				)

				if (methodsListResponse.data.result) {
					results.officialMethodsList = methodsListResponse.data.result
					console.log('✅ СБИС.СписокМетодов - получен список!')
					results.availableMethods.push('СБИС.СписокМетодов (ЭДО)')
				} else if (methodsListResponse.data.error) {
					console.log(
						'❌ СБИС.СписокМетодов - ошибка:',
						methodsListResponse.data.error.message
					)
					results.unavailableMethods.push('СБИС.СписокМетодов (ЭДО)')
				}
			} catch (e) {
				console.log('❌ СБИС.СписокМетодов - исключение:', e.message)
				results.unavailableMethods.push('СБИС.СписокМетодов (ЭДО)')
			}
		}

		// 1. Получаем информацию о пользователе
		try {
			const userInfoResponse = await axios.post(
				SBIS_API_URL,
				{
					jsonrpc: '2.0',
					method: 'СБИС.ИнформацияОПользователе',
					params: {},
					id: Date.now(),
				},
				{
					headers: {
						'Content-Type': 'application/json-rpc; charset=utf-8',
						'X-SBISSessionID': sessionId,
					},
					timeout: 10000,
				}
			)

			if (userInfoResponse.data.result && !userInfoResponse.data.error) {
				results.userInfo = userInfoResponse.data.result
				console.log('✅ СБИС.ИнформацияОПользователе - работает')
				console.log(
					'User info:',
					JSON.stringify(results.userInfo).substring(0, 300)
				)
				results.availableMethods.push('СБИС.ИнформацияОПользователе')
			} else {
				console.log('❌ СБИС.ИнформацияОПользователе - недоступен')
				results.unavailableMethods.push('СБИС.ИнформацияОПользователе')
			}
		} catch (e) {
			console.log('❌ СБИС.ИнформацияОПользователе - недоступен')
			results.unavailableMethods.push('СБИС.ИнформацияОПользователе')
		}

		// 2. Получаем текущую организацию
		try {
			const orgResponse = await axios.post(
				SBIS_API_URL,
				{
					jsonrpc: '2.0',
					method: 'СБИС.ТекущаяОрганизация',
					params: {},
					id: Date.now(),
				},
				{
					headers: {
						'Content-Type': 'application/json-rpc; charset=utf-8',
						'X-SBISSessionID': sessionId,
					},
					timeout: 10000,
				}
			)

			if (orgResponse.data.result && !orgResponse.data.error) {
				results.organization = orgResponse.data.result
				console.log('✅ СБИС.ТекущаяОрганизация - работает')
				console.log(
					'Organization:',
					JSON.stringify(results.organization).substring(0, 300)
				)
				results.availableMethods.push('СБИС.ТекущаяОрганизация')
			} else {
				console.log('❌ СБИС.ТекущаяОрганизация - недоступен')
				results.unavailableMethods.push('СБИС.ТекущаяОрганизация')
			}
		} catch (e) {
			console.log('❌ СБИС.ТекущаяОрганизация - недоступен')
			results.unavailableMethods.push('СБИС.ТекущаяОрганизация')
		}

		// 3. Тестируем основные API методы для разных сервисов
		const methodsToTest = [
			// API ЭДО (электронный документооборот)
			{
				method: 'СБИС.СписокКонтрагентов',
				params: { Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументов',
				params: { Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументовПоСобытиям',
				params: { Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},

			// API Все о компаниях
			{
				method: 'СБИС.ПоискКонтрагента',
				params: { ИНН: '7707083893' },
				service: 'Все о компаниях',
			},
			{
				method: 'СБИС.РеквизитыКонтрагента',
				params: { ИНН: '7707083893' },
				service: 'Все о компаниях',
			},

			// API Бухгалтерия
			{
				method: 'СБИС.СписокСчетов',
				params: { Навигация: { Количество: 1 } },
				service: 'Бухгалтерия',
			},
			{
				method: 'СБИС.СписокРеестра',
				params: { ИмяРеестра: 'Контрагенты', Навигация: { Количество: 1 } },
				service: 'Бухгалтерия',
			},

			// Альтернативные методы
			{ method: 'Контрагент.Список', params: {}, service: 'Альтернативный' },
			{ method: 'Документ.Список', params: {}, service: 'Альтернативный' },
		]

		for (const test of methodsToTest) {
			try {
				const response = await axios.post(
					SBIS_API_URL,
					{
						jsonrpc: '2.0',
						method: test.method,
						params: test.params,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
						},
						timeout: 10000,
					}
				)

				if (response.data.error) {
					const code = response.data.error.code
					console.log(`❌ ${test.method} [${test.service}] - ошибка ${code}`)
					results.unavailableMethods.push(`${test.method} (${test.service})`)
				} else {
					console.log(`✅ ${test.method} [${test.service}] - работает!`)
					results.availableMethods.push(`${test.method} (${test.service})`)
				}
			} catch (error) {
				console.log(`❌ ${test.method} [${test.service}] - исключение`)
				results.unavailableMethods.push(`${test.method} (${test.service})`)
			}
		}

		// 4. Формируем рекомендации на основе результатов
		const hasEDO = results.availableMethods.some(m => m.includes('ЭДО'))
		const hasCompanyInfo =
			results.sppAvailable ||
			results.availableMethods.some(m => m.includes('Все о компаниях'))
		const hasAccounting = results.availableMethods.some(m =>
			m.includes('Бухгалтерия')
		)

		// SPP API работает - это главное для поиска контрагентов
		if (results.sppAvailable) {
			results.recommendations.push(
				'✅ API "Все о компаниях" (SPP) работает! Данные контрагентов будут загружаться из СБИС.'
			)
		}

		if (!hasEDO && !hasCompanyInfo && !hasAccounting) {
			results.recommendations.push(
				'⚠️ API методы для работы с данными недоступны'
			)
			results.recommendations.push(
				'🔗 Подробнее: https://saby.ru/help/integration/api'
			)
		}

		if (!hasEDO) {
			results.recommendations.push(
				'📄 API ЭДО недоступен - документы и счета не будут загружаться из СБИС'
			)
		}

		if (!hasCompanyInfo) {
			results.recommendations.push(
				'🏢 API "Все о компаниях" недоступен - данные контрагентов загружаются из ЕГРЮЛ (бесплатно)'
			)
		}

		if (results.organization) {
			const orgName =
				results.organization.Название ||
				results.organization.НазваниеПолное ||
				results.organization.name
			if (orgName) {
				results.recommendations.push(`✅ Ваша организация: ${orgName}`)
			}
		}

		// Подсчёт
		results.summary = {
			totalTested:
				(sessionId ? methodsToTest.length + 3 : 0) + (sppSession ? 2 : 0),
			available: results.availableMethods.length,
			unavailable: results.unavailableMethods.length,
			sppAvailable: results.sppAvailable,
			hasEDO,
			hasCompanyInfo,
			hasAccounting,
		}

		console.log('=== DIAGNOSTICS COMPLETE ===')
		console.log('Available:', results.availableMethods.length)
		console.log('Unavailable:', results.unavailableMethods.length)

		res.json({
			success: true,
			diagnostics: results,
		})
	} catch (error) {
		console.error('Diagnose error:', error.message)
		res.status(500).json({ error: error.message })
	}
})

/**
 * POST /api/sbis-proxy/get-my-organization
 * Получение информации о текущей организации пользователя
 */
router.post('/get-my-organization', async (req, res) => {
	try {
		const { userId } = req.body
		const sessionId = userSessions.get(userId || 'default')

		if (!sessionId) {
			return res.status(401).json({ error: 'Требуется авторизация в СБИС' })
		}

		console.log('=== Getting organization info ===')

		// Пробуем разные методы получения информации об организации
		const methods = [
			{ method: 'СБИС.ТекущаяОрганизация', params: {} },
			{ method: 'СБИС.ИнформацияОПользователе', params: {} },
			{ method: 'СБИС.СписокОрганизаций', params: {} },
		]

		for (const m of methods) {
			try {
				const response = await axios.post(
					SBIS_API_URL,
					{
						jsonrpc: '2.0',
						method: m.method,
						params: m.params,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
						},
						timeout: 10000,
					}
				)

				if (response.data.result && !response.data.error) {
					console.log(
						`✅ ${m.method} worked:`,
						JSON.stringify(response.data.result).substring(0, 200)
					)

					const result = response.data.result

					// Извлекаем данные организации
					const org = {
						inn: result.ИНН || result.Организация?.ИНН,
						kpp: result.КПП || result.Организация?.КПП,
						name:
							result.Название ||
							result.НазваниеПолное ||
							result.Организация?.Название,
						ogrn: result.ОГРН || result.Организация?.ОГРН,
					}

					if (org.inn || org.name) {
						return res.json({
							success: true,
							method: m.method,
							data: org,
							raw: result,
						})
					}
				}
			} catch (e) {
				console.log(`Method ${m.method} failed:`, e.message)
			}
		}

		res.json({
			success: false,
			message: 'Не удалось получить информацию об организации',
		})
	} catch (error) {
		console.error('Get organization error:', error.message)
		res.status(500).json({ error: error.message })
	}
})

/**
 * POST /api/sbis-proxy/crm-create-customer
 * Создание клиента (физическое лицо) в CRM
 */
router.post('/crm-create-customer', async (req, res) => {
	try {
		const { userId, surname, name, patronymic, gender, address, phone, email } =
			req.body

		const sessionId = userSessions.get(userId || 'default')
		if (!sessionId) {
			return res.status(401).json({ error: 'Не авторизован в СБИС' })
		}

		console.log('=== CRM: Create Customer ===')

		const response = await axios.post(
			'https://online.sbis.ru/service/',
			{
				jsonrpc: '2.0',
				method: 'CRMClients.SaveCustomer',
				params: {
					CustomerData: {
						d: {
							Surname: surname || '',
							Name: name || '',
							Patronymic: patronymic || '',
							Gender: gender || 0,
							Address: address || '',
							Phone: phone || '',
							Email: email || '',
						},
						s: {
							Surname: 'Строка',
							Name: 'Строка',
							Patronymic: 'Строка',
							Gender: 'Число целое',
							Address: 'Строка',
							Phone: 'Строка',
							Email: 'Строка',
						},
					},
				},
				protocol: 2,
				id: 0,
			},
			{
				headers: {
					Host: 'online.sbis.ru',
					'Content-Type': 'application/json-rpc; charset=utf-8',
					Accept: 'application/json-rpc',
					'X-SBISSessionID': sessionId,
				},
				timeout: 15000,
			}
		)

		if (response.data.result) {
			console.log('✅ Customer created, ID:', response.data.result)
			res.json({
				success: true,
				customerId: response.data.result,
			})
		} else if (response.data.error) {
			console.log('❌ Create customer error:', response.data.error.message)
			res.status(400).json({
				success: false,
				error: response.data.error.message,
			})
		}
	} catch (error) {
		console.error('Create customer exception:', error.message)
		res.status(500).json({ error: error.message })
	}
})

/**
 * POST /api/sbis-proxy/crm-get-themes
 * Получение тем отношений CRM (для создания сделок)
 */
router.post('/crm-get-themes', async (req, res) => {
	try {
		const { userId, themeName } = req.body

		const sessionId = userSessions.get(userId || 'default')
		if (!sessionId) {
			return res.status(401).json({ error: 'Не авторизован в СБИС' })
		}

		console.log('=== CRM: Get Theme ===')

		const response = await axios.post(
			'https://online.sbis.ru/service/',
			{
				jsonrpc: '2.0',
				method: 'CRMLead.getCRMThemeByName',
				params: {
					НаименованиеТемы: themeName || 'Продажи',
				},
				protocol: 2,
				id: 0,
			},
			{
				headers: {
					Host: 'online.sbis.ru',
					'Content-Type': 'application/json-rpc; charset=utf-8',
					Accept: 'application/json-rpc',
					'X-SBISSessionID': sessionId,
				},
				timeout: 15000,
			}
		)

		if (response.data.result) {
			console.log('✅ Theme found:', response.data.result)
			res.json({
				success: true,
				theme: response.data.result,
			})
		} else if (response.data.error) {
			console.log('❌ Get theme error:', response.data.error.message)
			res.status(400).json({
				success: false,
				error: response.data.error.message,
			})
		}
	} catch (error) {
		console.error('Get theme exception:', error.message)
		res.status(500).json({ error: error.message })
	}
})

/**
 * POST /api/sbis-proxy/crm-create-lead
 * Создание сделки в CRM
 */
router.post('/crm-create-lead', async (req, res) => {
	try {
		const { userId, clientId, themeId, userConds, nomenclatures } = req.body

		const sessionId = userSessions.get(userId || 'default')
		if (!sessionId) {
			return res.status(401).json({ error: 'Не авторизован в СБИС' })
		}

		if (!clientId || !themeId) {
			return res.status(400).json({ error: 'clientId и themeId обязательны' })
		}

		console.log('=== CRM: Create Lead ===')

		const response = await axios.post(
			'https://online.sbis.ru/service/',
			{
				jsonrpc: '2.0',
				method: 'CRMLead.insertRecord',
				params: {
					Лид: {
						d: {
							Регламент: themeId,
							Клиент: {
								d: {
									'@Лицо': String(clientId),
									Type: [0, 2],
								},
								s: {
									'@Лицо': 'Строка',
									Type: { Массив: 'Число целое' },
								},
							},
							UserConds: userConds || {},
							Nomenclatures: nomenclatures || [],
						},
						s: {
							Регламент: 'Число целое',
							Клиент: 'Запись',
							UserConds: 'JSON-объект',
							Nomenclatures: 'JSON-объект',
						},
					},
				},
				protocol: 2,
				id: 0,
			},
			{
				headers: {
					Host: 'online.sbis.ru',
					'Content-Type': 'application/json-rpc; charset=utf-8',
					Accept: 'application/json-rpc',
					'X-SBISSessionID': sessionId,
				},
				timeout: 15000,
			}
		)

		if (response.data.result) {
			console.log('✅ Lead created:', response.data.result)
			res.json({
				success: true,
				lead: response.data.result,
			})
		} else if (response.data.error) {
			console.log('❌ Create lead error:', response.data.error.message)
			res.status(400).json({
				success: false,
				error: response.data.error.message,
			})
		}
	} catch (error) {
		console.error('Create lead exception:', error.message)
		res.status(500).json({ error: error.message })
	}
})

module.exports = router
