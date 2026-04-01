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
const SPP_AUTH_URL = 'https://api.saby.ru/auth/service/' // Для api.saby.ru API

// ========================================
// API Credentials (сервисная авторизация)
// ВАЖНО: Скопируйте точные значения из веб-интерфейса СБИС
// Настройки → Интеграция → Подключение к SABY → Ваше приложение
// ========================================
const SBIS_APP_CLIENT_ID = process.env.SBIS_APP_CLIENT_ID || '2651426000822745' // ID подключения
const SBIS_APP_SECRET = process.env.SBIS_APP_SECRET || 'G6TMMMZWMAZ55YIP6EAV3S3D' // Защищенный ключ
const SBIS_SECRET_KEY = process.env.SBIS_SECRET_KEY || '7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg' // Секретный ключ

// Настройки ответственного для задач в SBIS (из переменных окружения)
// Формат: "Фамилия Имя Отчество" (например: "Тендитник Антон Алексеевич")
const SBIS_RESPONSIBLE_FULL_NAME = process.env.SBIS_RESPONSIBLE_FULL_NAME || ''

// Настройки подразделения для задач в SBIS (из переменных окружения)
// Название подразделения (например: "Техотдел", "Техническая поддержка")
const SBIS_DEPARTMENT_NAME = process.env.SBIS_DEPARTMENT_NAME || ''
// Идентификатор подразделения (код подразделения в SBIS, если известен)
const SBIS_DEPARTMENT_ID = process.env.SBIS_DEPARTMENT_ID || ''

// Список сотрудников техотдела для ротации задач (из переменных окружения)
// Формат: "Фамилия1 Имя1 Отчество1,Фамилия2 Имя2 Отчество2" (через запятую)
const SBIS_TECH_DEPARTMENT_STAFF = process.env.SBIS_TECH_DEPARTMENT_STAFF || ''

// УДАЛЕНО: Интеграция с SBIS для сообщений больше не используется
// Теперь используется внутренний чат между клиентом и инженером в приложении
// ID сотрудника-передатчика в SBIS (для маршрутизации сообщений между инженером и клиентом)
// Это ID специального сотрудника в SBIS, который используется как "передатчик" сообщений
// Когда инженер пишет сообщение в задаче SBIS, он выбирает этого сотрудника
// Система определяет, что сообщение от этого сотрудника = сообщение от инженера
// Формат: числовой ID, строка с ID, или ФИО сотрудника (например: "Иванов Иван Передатчев")
// Если указано ФИО, система автоматически получит ID из SBIS при первом использовании
// const SBIS_MESSENGER_STAFF_ID_RAW = process.env.SBIS_MESSENGER_STAFF_ID || ''
// let SBIS_MESSENGER_STAFF_ID = SBIS_MESSENGER_STAFF_ID_RAW // Будет заменен на ID, если указано ФИО
// let SBIS_MESSENGER_STAFF_ID_RESOLVED = false // Флаг, что ID был получен

// Хранилище для ротации задач (в памяти, можно перенести в БД)
const taskRotationState = new Map() // key: departmentName, value: { lastIndex: number, staff: array }

// Кэш соответствия ФИО -> Идентификатор сотрудника из SBIS
const staffIdCache = new Map() // key: "Фамилия Имя Отчество", value: { Идентификатор, Фамилия, Имя, Отчество }

// Кэш соответствия числового ID -> UUID сотрудника
const staffUuidCache = new Map() // key: числовой ID, value: UUID

// Кэш для ID директора-наблюдателя
let directorSBISInfo = null // { Идентификатор, Фамилия, Имя, Отчество }
let directorSBISInfoResolved = false

/**
 * Найти ID директора в СБИС по ФИО из SBIS_DIRECTOR_FULL_NAME
 */
async function findDirectorSBISInfo(oauthToken) {
	if (directorSBISInfoResolved) return directorSBISInfo

	const directorFullName = (process.env.SBIS_DIRECTOR_FULL_NAME || '').trim()
	if (!directorFullName) {
		directorSBISInfoResolved = true
		return null
	}

	const parts = directorFullName.split(/\s+/).filter(s => s.length > 0)
	if (parts.length < 2) {
		console.warn('[SBIS Observer] Некорректное ФИО директора:', directorFullName)
		directorSBISInfoResolved = true
		return null
	}

	const targetFamilia = parts[0]
	const targetImya = parts[1]
	const targetOtchestvo = parts[2] || ''

	try {
		const employees = await getStaffListFromSBIS(oauthToken)
		const match = employees.find(emp => {
			return emp.Фамилия === targetFamilia
				&& emp.Имя === targetImya
				&& (!targetOtchestvo || emp.Отчество === targetOtchestvo)
		})

		if (match && match.Идентификатор) {
			directorSBISInfo = {
				Идентификатор: String(match.Идентификатор),
				Фамилия: match.Фамилия,
				Имя: match.Имя,
				Отчество: match.Отчество || ''
			}
			console.log(`[SBIS Observer] Директор найден: ${directorFullName}, ID: ${match.Идентификатор}`)
		} else {
			directorSBISInfo = {
				Фамилия: targetFamilia,
				Имя: targetImya,
				Отчество: targetOtchestvo
			}
			console.warn(`[SBIS Observer] Директор "${directorFullName}" не найден в списке сотрудников, используем только ФИО`)
		}
	} catch (err) {
		console.error('[SBIS Observer] Ошибка поиска директора:', err.message)
		directorSBISInfo = { Фамилия: targetFamilia, Имя: targetImya, Отчество: targetOtchestvo }
	}

	directorSBISInfoResolved = true
	return directorSBISInfo
}

/**
 * Получить список сотрудников из SBIS по подразделению
 * @param {string} oauthToken - OAuth токен для доступа к SBIS API
 * @param {string} departmentName - Название подразделения (опционально)
 * @returns {Promise<Array>} - Массив сотрудников с идентификаторами
 */
async function getStaffListFromSBIS(oauthToken, departmentName = null) {
	try {
		const params = {
			Параметр: {
				Навигация: {
					РазмерСтраницы: '500', // Максимальный размер страницы
					Страница: '0'
				}
			}
		}
		
		// Согласно документации (строка 459-468), можно использовать фильтр "Подразделение"
		// Но для этого нужно знать идентификатор подразделения, поэтому фильтруем локально
		
		const response = await axios.post(
			SBIS_SERVICES.edo,
			{
				jsonrpc: '2.0',
				method: 'СБИС.СписокСотрудников',
				params: params,
				id: Date.now()
			},
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISAccessToken': oauthToken,
				},
				timeout: 30000,
			}
		)
		
		if (response.data.error) {
			console.error('[SBIS Staff] Ошибка получения списка сотрудников:', response.data.error.message)
			return []
		}
		
		const employees = response.data.result?.Сотрудник || []
		
		// Фильтруем по подразделению, если указано
		let filteredEmployees = employees
		if (departmentName) {
			filteredEmployees = employees.filter(emp => 
				emp.Подразделение?.Название === departmentName
			)
		}
		
		// Обновляем кэш соответствия ФИО -> Идентификатор
		// Также обновляем кэш числового ID -> UUID (если есть UUID в ответе)
		filteredEmployees.forEach(emp => {
			const fullName = `${emp.Фамилия} ${emp.Имя} ${emp.Отчество}`.trim()
			if (fullName && emp.Идентификатор) {
				const staffInfo = {
					Идентификатор: emp.Идентификатор,
					Фамилия: emp.Фамилия,
					Имя: emp.Имя,
					Отчество: emp.Отчество
				}
				staffIdCache.set(fullName, staffInfo)
				
				// Если Идентификатор - это число, а есть UUID в других полях, сохраняем соответствие
				const id = emp.Идентификатор
				const idStr = id.toString()
				if (/^\d+$/.test(idStr)) {
					// Это числовой ID, ищем UUID в других полях
					// В SBIS UUID может быть в поле personModel или других полях
					// Пока сохраняем числовой ID, UUID будет получен при сравнении с senderID
					if (emp.UUID || emp.uuid || emp.ИдентификаторUUID) {
						const uuid = emp.UUID || emp.uuid || emp.ИдентификаторUUID
						staffUuidCache.set(idStr, uuid.toString())
						console.log(`[SBIS Staff] Сохранено соответствие: числовой ID ${idStr} -> UUID ${uuid}`)
					}
				} else if (idStr.includes('-')) {
					// Это уже UUID, сохраняем его
					staffUuidCache.set(idStr, idStr)
				}
			}
		})
		
		console.log(`[SBIS Staff] Получено ${filteredEmployees.length} сотрудников из подразделения "${departmentName || 'все'}"`)
		
		return filteredEmployees
	} catch (error) {
		console.error('[SBIS Staff] Ошибка при получении списка сотрудников:', error.response?.data?.error?.message || error.message)
		return []
	}
}

/**
 * Получить идентификатор сотрудника по ФИО (из кэша или из SBIS)
 * @param {Object} staff - Объект с ФИО {Фамилия, Имя, Отчество}
 * @param {string} oauthToken - OAuth токен для доступа к SBIS API
 * @param {string} departmentName - Название подразделения
 * @returns {Promise<Object|null>} - Объект с идентификатором или null
 */
async function getStaffIdByFullName(staff, oauthToken, departmentName) {
	if (!staff || !staff.Фамилия || !staff.Имя) {
		return null
	}
	
	const fullName = `${staff.Фамилия} ${staff.Имя} ${staff.Отчество || ''}`.trim()
	
	// Проверяем кэш
	if (staffIdCache.has(fullName)) {
		const cached = staffIdCache.get(fullName)
		console.log(`[SBIS Staff] Найден в кэше: ${fullName} -> ${cached.Идентификатор}`)
		return cached
	}
	
	// Если нет в кэше, получаем список сотрудников из SBIS
	console.log(`[SBIS Staff] Идентификатор не найден в кэше для ${fullName}, запрашиваем из SBIS...`)
	const employees = await getStaffListFromSBIS(oauthToken, departmentName)
	
	// Ищем сотрудника по ФИО
	const found = employees.find(emp => 
		emp.Фамилия === staff.Фамилия &&
		emp.Имя === staff.Имя &&
		(!staff.Отчество || emp.Отчество === staff.Отчество)
	)
	
	if (found && found.Идентификатор) {
		const result = {
			Идентификатор: found.Идентификатор,
			Фамилия: found.Фамилия,
			Имя: found.Имя,
			Отчество: found.Отчество
		}
		staffIdCache.set(fullName, result)
		console.log(`[SBIS Staff] Найден в SBIS: ${fullName} -> ${found.Идентификатор}`)
		return result
	}
	
	console.warn(`[SBIS Staff] Сотрудник не найден в SBIS: ${fullName}`)
	return null
}

/**
 * Получить следующего сотрудника для ротации задач (с идентификатором из SBIS)
 * @param {string} departmentName - Название подразделения
 * @param {string} oauthToken - OAuth токен для доступа к SBIS API
 * @returns {Promise<Object|null>} - Объект с ФИО и идентификатором сотрудника или null
 */
async function getNextStaffMemberForRotation(departmentName, oauthToken) {
	if (!SBIS_TECH_DEPARTMENT_STAFF || !SBIS_TECH_DEPARTMENT_STAFF.trim()) {
		return null
	}
	
	// Парсим список сотрудников
	const staffList = SBIS_TECH_DEPARTMENT_STAFF.split(',')
		.map(s => s.trim())
		.filter(s => s.length > 0)
		.map(fullName => parseFullName(fullName))
		.filter(staff => staff !== null)
		// УДАЛЕНО: Проверка сотрудника-передатчика больше не нужна
		// .filter(staff => {
		// 	if (SBIS_MESSENGER_STAFF_ID && staff.Идентификатор) {
		// 		const staffId = staff.Идентификатор.toString()
		// 		const messengerId = SBIS_MESSENGER_STAFF_ID.toString()
		// 		if (staffId === messengerId) {
		// 			console.log(`[SBIS Task] Исключен сотрудник-передатчик из ротации: ${staff.Фамилия} ${staff.Имя} ${staff.Отчество} (ID: ${staff.Идентификатор})`)
		// 			return false
		// 		}
		// 	}
		// 	return true
		// })
	
	if (staffList.length === 0) {
		console.warn('[SBIS Task] Список сотрудников для ротации пуст после фильтрации (возможно, все сотрудники - это передатчики)')
		return null
	}
	
	// Получаем или создаем состояние ротации для подразделения
	if (!taskRotationState.has(departmentName)) {
		taskRotationState.set(departmentName, {
			lastIndex: -1,
			staff: staffList
		})
	}
	
	const rotationState = taskRotationState.get(departmentName)
	
	// Переходим к следующему сотруднику (ротация)
	rotationState.lastIndex = (rotationState.lastIndex + 1) % rotationState.staff.length
	const nextStaff = rotationState.staff[rotationState.lastIndex]
	
	// Если ID уже указан в формате "ФИО|ID", используем его напрямую
	if (nextStaff.Идентификатор) {
		console.log(`[SBIS Task] Ротация: выбран сотрудник ${rotationState.lastIndex + 1}/${rotationState.staff.length}: ${nextStaff.Фамилия} ${nextStaff.Имя} ${nextStaff.Отчество} (ID: ${nextStaff.Идентификатор} - указан напрямую)`)
		return nextStaff
	}
	
	// Иначе получаем идентификатор сотрудника из SBIS
	const staffWithId = await getStaffIdByFullName(nextStaff, oauthToken, departmentName)
	
	if (staffWithId) {
		// УДАЛЕНО: Проверка сотрудника-передатчика больше не нужна
		// if (SBIS_MESSENGER_STAFF_ID && staffWithId.Идентификатор) {
		// 	const staffId = staffWithId.Идентификатор.toString()
		// 	const messengerId = SBIS_MESSENGER_STAFF_ID.toString()
		// 	if (staffId === messengerId) {
		// 		console.warn(`[SBIS Task] Обнаружен сотрудник-передатчик в ротации: ${staffWithId.Фамилия} ${staffWithId.Имя} ${staffWithId.Отчество} (ID: ${staffWithId.Идентификатор}). Передатчик не должен быть в списке SBIS_TECH_DEPARTMENT_STAFF!`)
		// 		console.warn(`[SBIS Task] Задача будет назначена в подразделение без конкретного исполнителя`)
		// 		return null
		// 	}
		// }
		
		console.log(`[SBIS Task] Ротация: выбран сотрудник ${rotationState.lastIndex + 1}/${rotationState.staff.length}: ${staffWithId.Фамилия} ${staffWithId.Имя} ${staffWithId.Отчество} (ID: ${staffWithId.Идентификатор})`)
		return staffWithId
	} else {
		console.warn(`[SBIS Task] Ротация: сотрудник ${nextStaff.Фамилия} ${nextStaff.Имя} ${nextStaff.Отчество} не найден в SBIS, используем только ФИО`)
		return nextStaff // Возвращаем без идентификатора, если не найден
	}
}

// Функция для разбора ФИО на компоненты
// Поддерживает формат: "Фамилия Имя Отчество" или "Фамилия Имя Отчество|ID"
function parseFullName(fullName) {
	if (!fullName || !fullName.trim()) {
		return null
	}
	
	// Проверяем, есть ли ID в формате "ФИО|ID"
	const parts = fullName.trim().split('|')
	const namePart = parts[0].trim()
	const idPart = parts.length > 1 ? parts[1].trim() : null
	
	// Разбираем ФИО
	const nameComponents = namePart.split(/\s+/).filter(s => s.length > 0)
	if (nameComponents.length < 2) {
		return null
	}
	
	const result = {
		Фамилия: nameComponents[0],
		Имя: nameComponents[1],
		Отчество: nameComponents.length > 2 ? nameComponents.slice(2).join(' ') : ''
	}
	
	// Если указан ID, добавляем его
	if (idPart) {
		// Пробуем конвертировать в число, если это строка с числом
		const numericId = /^\d+$/.test(idPart) ? parseInt(idPart, 10) : idPart
		result.Идентификатор = numericId
	}
	
	return result
}

// Сервисы СБИС API
const SBIS_SERVICES = {
	// Основной сервис online.sbis.ru (без параметров) - для базовых методов
	main: 'https://online.sbis.ru/service/',
	// API ЭДО - для работы с контрагентами и документами
	// ВАЖНО: Согласно документации https://saby.ru/help/integration/api/all_methods/format
	// для команд ЭДО нужен URL с параметром ?srv=1
	edo: 'https://online.sbis.ru/service/?srv=1',
	// С параметром srv=1 (основной для ЭДО)
	mainSrv: 'https://online.sbis.ru/service/?srv=1',
	// Бизнес-сервис
	business: 'https://online.sbis.ru/service/',
	// CRM сервис
	crm: 'https://online.sbis.ru/service/',

	// ========================================
	// API "Все о компаниях" (SPP API)
	// Документация: из api_about_company.md
	// ========================================
	spp: 'https://api.saby.ru/spp-rest-api/service/', // Согласно документации пункта 12 и 13
	sppAuth: 'https://api.saby.ru/auth/service/', // Для api.saby.ru API
}

// Текущий активный сервис (можно переключать)
// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
let SBIS_API_URL = SBIS_SERVICES.mainSrv

// Хранение сессий пользователей (для online.sbis.ru)
const userSessions = new Map()

// Хранение сессий для SPP API (api.sbis.ru) - отдельно!
const sppSessions = new Map()

// Хранение OAuth токенов (сервисная авторизация)
const oauthTokens = new Map()

/**
 * Создание задачи в SBIS через метод "СБИС.ЗаписатьДокумент"
 * @param {Object} taskData - Данные задачи
 * @param {string} taskData.subject - Тема задачи
 * @param {string} taskData.message - Описание задачи
 * @param {string} taskData.clientName - Имя клиента
 * @param {string} taskData.clientEmail - Email клиента
 * @param {string} taskData.clientPhone - Телефон клиента (опционально)
 * @param {string} taskData.priority - Приоритет (normal, high, urgent, low)
 * @param {string} userId - ID пользователя для получения OAuth токена
 * @returns {Promise<Object>} Результат создания задачи в SBIS
 */
async function createSBISTask(taskData, userId = 'default') {
	try {
		console.log('=== Создание задачи в SBIS ===')
		console.log('Task data:', {
			subject: taskData.subject,
			clientName: taskData.clientName,
			clientEmail: taskData.clientEmail,
			priority: taskData.priority
		})

		// Получаем или создаем OAuth токен
		let oauthToken = oauthTokens.get(userId)
		
		if (!oauthToken) {
			console.log('OAuth токен не найден, выполняем авторизацию...')
			const requestBody = {
				app_client_id: SBIS_APP_CLIENT_ID,
				app_secret: SBIS_APP_SECRET,
				secret_key: SBIS_SECRET_KEY,
			}

			const authResponse = await axios.post(SBIS_OAUTH_URL, requestBody, {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
				},
				timeout: 30000,
			})

			if (authResponse.data && authResponse.data.token) {
				oauthToken = authResponse.data.token
				oauthTokens.set(userId, oauthToken)
				console.log('✅ OAuth токен получен для создания задачи')
			} else {
				throw new Error('Не удалось получить OAuth токен для создания задачи')
			}
		}

		// Формируем XML-файл задачи
		const currentDate = new Date()
		// Форматируем дату в формате DD.MM.YYYY (как требует SBIS API)
		const day = String(currentDate.getDate()).padStart(2, '0')
		const month = String(currentDate.getMonth() + 1).padStart(2, '0')
		const year = currentDate.getFullYear()
		const dateStr = `${day}.${month}.${year}`
		
		const timeStr = currentDate.toLocaleTimeString('ru-RU', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})

		// Формируем XML согласно формату SBIS для служебной записки
		const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Документ xmlns="http://www.sbis.ru/edo/edo_common.xsd" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<СлужебнаяЗаписка>
		<Идентификатор>${taskData.taskId || `task_${Date.now()}`}</Идентификатор>
		<Дата>${dateStr}</Дата>
		<Время>${timeStr}</Время>
		<Номер>${taskData.subject}</Номер>
		<Тема>${taskData.subject}</Тема>
		<Содержание>${(taskData.message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Содержание>
		<ОтКого>
			<ФИО>${(taskData.clientName || 'Клиент').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</ФИО>
			<Email>${taskData.clientEmail || ''}</Email>
			${taskData.clientPhone ? `<Телефон>${taskData.clientPhone}</Телефон>` : ''}
		</ОтКого>
		<Приоритет>${taskData.priority === 'urgent' ? 'Высокий' : taskData.priority === 'high' ? 'Высокий' : taskData.priority === 'low' ? 'Низкий' : 'Обычный'}</Приоритет>
	</СлужебнаяЗаписка>
</Документ>`

		// Конвертируем XML в base64
		const xmlBase64 = Buffer.from(xmlContent, 'utf-8').toString('base64')
		
		// Генерируем UUID v4 для идентификаторов (требуется SBIS API)
		const crypto = require('crypto')
		const generateUUID = () => {
			return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
				const r = Math.random() * 16 | 0
				const v = c === 'x' ? r : (r & 0x3 | 0x8)
				return v.toString(16)
			})
		}
		
		const attachmentId = generateUUID()
		const documentId = generateUUID()
		const fileName = `ON_SLUZHZAP_${dateStr.replace(/\./g, '')}_${attachmentId.substring(0, 8)}.xml`

		// Определяем контрагента по ИНН/КПП, если они указаны
		let contractorInfo = null;
		if (taskData.clientInn) {
			try {
				console.log(`[SBIS Task] Определение контрагента по ИНН: ${taskData.clientInn}`);
				
				// Определяем тип организации: 10 цифр - ООО, 12 цифр - ИП
				const innDigits = taskData.clientInn.replace(/\D/g, '');
				const isIP = innDigits.length === 12;
				const isOOO = innDigits.length === 10;
				
				const contractorRequest = {
					jsonrpc: '2.0',
					method: 'СБИС.ИнформацияОКонтрагенте',
					params: isIP ? {
						Участник: {
							СвФЛ: {
								ИНН: taskData.clientInn,
								Фамилия: taskData.clientName?.split(' ')[0] || '',
								Имя: taskData.clientName?.split(' ')[1] || '',
								Отчество: taskData.clientName?.split(' ')[2] || '',
								ЧастноеЛицо: 'Нет'
							}
						}
					} : {
						Участник: {
							СвЮЛ: {
								ИНН: taskData.clientInn,
								КПП: taskData.clientKpp || '',
								Название: taskData.clientName || ''
							}
						}
					},
					id: Date.now()
				};
				
				const contractorResponse = await axios.post(
					SBIS_SERVICES.edo,
					contractorRequest,
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISAccessToken': oauthToken,
						},
						timeout: 30000,
					}
				);
				
				if (contractorResponse.data.result && !contractorResponse.data.error) {
					contractorInfo = contractorResponse.data.result;
					console.log(`[SBIS Task] ✅ Контрагент определен: ${contractorInfo.СвЮЛ?.Название || contractorInfo.СвФЛ?.НазваниеПолное || 'Контрагент'}`);
				} else {
					console.log(`[SBIS Task] ⚠️ Не удалось определить контрагента: ${contractorResponse.data.error?.message || 'Неизвестная ошибка'}`);
				}
			} catch (contractorError) {
				console.error(`[SBIS Task] ⚠️ Ошибка определения контрагента (продолжаем без контрагента):`, contractorError.message);
			}
		}

		// Формируем запрос к SBIS API
		const documentParams = {
			Дата: dateStr,
			Номер: taskData.subject.substring(0, 50), // Ограничение длины номера
			Идентификатор: documentId,
			Тип: 'СлужЗап',
			Регламент: {
				Название: 'Задача'
			}
		}
		
		// Добавляем контрагента, если он был определен
		if (contractorInfo) {
			const innDigits = taskData.clientInn.replace(/\D/g, '');
			const isIP = innDigits.length === 12;
			
			if (isIP) {
				documentParams.Контрагент = {
					СвФЛ: {
						ИНН: taskData.clientInn,
						Фамилия: contractorInfo.СвФЛ?.Фамилия || taskData.clientName?.split(' ')[0] || '',
						Имя: contractorInfo.СвФЛ?.Имя || taskData.clientName?.split(' ')[1] || '',
						Отчество: contractorInfo.СвФЛ?.Отчество || taskData.clientName?.split(' ')[2] || ''
					}
				};
			} else {
				documentParams.Контрагент = {
					СвЮЛ: {
						ИНН: taskData.clientInn,
						КПП: taskData.clientKpp || contractorInfo.СвЮЛ?.КПП || '',
						Название: contractorInfo.СвЮЛ?.Название || taskData.clientName || ''
					}
				};
			}
			console.log(`[SBIS Task] Контрагент добавлен в параметры документа`);
		}
		
		// Добавляем примечание (описание) задачи, если есть
		if (taskData.message && taskData.message.trim()) {
			documentParams.Примечание = taskData.message.trim()
		}
		
		// Добавляем подразделение, если указано в настройках
		if (SBIS_DEPARTMENT_NAME || SBIS_DEPARTMENT_ID) {
			documentParams.Подразделение = {}
			if (SBIS_DEPARTMENT_NAME) {
				documentParams.Подразделение.Название = SBIS_DEPARTMENT_NAME
			}
			if (SBIS_DEPARTMENT_ID) {
				documentParams.Подразделение.Идентификатор = SBIS_DEPARTMENT_ID
			}
			console.log(`[SBIS Task] Используется подразделение: ${SBIS_DEPARTMENT_NAME || SBIS_DEPARTMENT_ID}`)
			
			// Если указан список сотрудников для ротации - назначаем исполнителя
			let nextStaff = null
			if (SBIS_TECH_DEPARTMENT_STAFF && SBIS_TECH_DEPARTMENT_STAFF.trim()) {
				// Получаем следующего сотрудника с идентификатором из SBIS
				nextStaff = await getNextStaffMemberForRotation(SBIS_DEPARTMENT_NAME || SBIS_DEPARTMENT_ID, oauthToken)
				if (nextStaff) {
					// Используем идентификатор, если он есть, иначе только ФИО
					// Идентификатор может быть строкой или числом, конвертируем в число если возможно
					let executor
					if (nextStaff.Идентификатор) {
						const id = nextStaff.Идентификатор
						// Пробуем конвертировать в число, если это строка с числом
						const numericId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id
						executor = { Идентификатор: numericId }
					} else {
						executor = {
							Фамилия: nextStaff.Фамилия,
							Имя: nextStaff.Имя,
							Отчество: nextStaff.Отчество
						}
					}
					
					// Назначаем исполнителя только в документе
					// НЕ указываем этап при создании - задача создастся в начальном этапе,
					// затем мы запустим её в документооборот через СБИС.ВыполнитьДействие
					documentParams.Исполнитель = executor
					
					if (nextStaff.Идентификатор) {
						console.log(`[SBIS Task] Назначен исполнитель (ротация) с ID: ${nextStaff.Фамилия} ${nextStaff.Имя} ${nextStaff.Отчество} (ID: ${nextStaff.Идентификатор})`)
					} else {
						console.log(`[SBIS Task] Назначен исполнитель (ротация) без ID: ${nextStaff.Фамилия} ${nextStaff.Имя} ${nextStaff.Отчество}`)
					}
					console.log(`[SBIS Task] Исполнитель указан в документе, задача будет запущена в документооборот после создания`)
				}
			}
			
			// Сохраняем nextStaff для использования после создания задачи (если не сработало при создании)
			documentParams._nextStaff = nextStaff
			
			if (!nextStaff) {
				console.log('[SBIS Task] Исполнитель не указан (задача будет в подразделении без конкретного исполнителя)')
			}
		} else {
			// Если подразделение не указано, можно указать ответственного
			const responsible = parseFullName(SBIS_RESPONSIBLE_FULL_NAME)
			if (responsible) {
				documentParams.Ответственный = responsible
				console.log(`[SBIS Task] Используется ответственный: ${responsible.Фамилия} ${responsible.Имя} ${responsible.Отчество}`)
			} else {
				console.log('[SBIS Task] Ответственный не указан, SBIS назначит автоматически')
			}
			console.log('[SBIS Task] Подразделение не указано')
		}
		
		// Добавляем директора как наблюдателя при создании задачи
		const directorInfo = await findDirectorSBISInfo(oauthToken)
		if (directorInfo) {
			documentParams.Наблюдатель = [directorInfo]
			console.log(`[SBIS Task] Наблюдатель добавлен в документ: ${directorInfo.Фамилия} ${directorInfo.Имя} ${directorInfo.Отчество} (ID: ${directorInfo.Идентификатор || 'нет'})`)
		}

		// Формируем массив вложений: сначала XML файл задачи, затем файлы от клиента
		const attachments = [
			{
				Идентификатор: attachmentId,
				Файл: {
					Имя: fileName,
					ДвоичныеДанные: xmlBase64
				}
			}
		];
		
		// Добавляем файлы от клиента, если они есть
		if (taskData.files && Array.isArray(taskData.files) && taskData.files.length > 0) {
			console.log(`[SBIS Task] Добавление ${taskData.files.length} файлов от клиента в задачу`);
			const fs = require('fs');
			
			for (const file of taskData.files) {
				try {
					// Проверяем, что файл существует
					if (!fs.existsSync(file.path)) {
						console.warn(`[SBIS Task] ⚠️ Файл не найден: ${file.path}`);
						continue;
					}
					
					// Читаем файл и конвертируем в base64
					const fileBuffer = fs.readFileSync(file.path);
					const fileBase64 = fileBuffer.toString('base64');
					
					// Генерируем UUID для идентификатора вложения
					const fileAttachmentId = generateUUID();
					
					// Определяем имя файла (используем originalname, если есть)
					const attachmentFileName = file.originalname || file.filename || `file_${fileAttachmentId.substring(0, 8)}`;
					
					attachments.push({
						Идентификатор: fileAttachmentId,
						Файл: {
							Имя: attachmentFileName,
							ДвоичныеДанные: fileBase64
						}
					});
					
					console.log(`[SBIS Task] ✅ Файл добавлен: ${attachmentFileName} (${file.size} bytes)`);
				} catch (fileError) {
					console.error(`[SBIS Task] ❌ Ошибка добавления файла ${file.originalname || file.filename}:`, fileError.message);
					// Продолжаем с другими файлами
				}
			}
		}
		
		documentParams.Вложение = attachments;
		
		// Удаляем временное поле перед отправкой
		const cleanDocumentParams = { ...documentParams }
		const nextStaff = cleanDocumentParams._nextStaff
		delete cleanDocumentParams._nextStaff
		
		const requestBody = {
			jsonrpc: '2.0',
			method: 'СБИС.ЗаписатьДокумент',
			params: {
				Документ: cleanDocumentParams
			},
			id: Date.now()
		}

		console.log('SBIS Task Request:', JSON.stringify({
			...requestBody,
			params: {
				...requestBody.params,
				Документ: {
					...requestBody.params.Документ,
					Вложение: [{
						...requestBody.params.Документ.Вложение[0],
						Файл: {
							...requestBody.params.Документ.Вложение[0].Файл,
							ДвоичныеДанные: `${xmlBase64.substring(0, 50)}...`
						}
					}]
				}
			}
		}, null, 2))

		// Отправляем запрос в SBIS
		const response = await axios.post(
			SBIS_SERVICES.edo, // https://online.sbis.ru/service/?srv=1
			requestBody,
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISAccessToken': oauthToken,
				},
				timeout: 30000,
			}
		)

		console.log('SBIS Task Response:', JSON.stringify(response.data, null, 2))

		if (response.data.error) {
			console.error('❌ SBIS Task Creation Error:', response.data.error)
			throw new Error(response.data.error.message || 'Ошибка создания задачи в SBIS')
		}

		if (response.data.result) {
			const taskId = response.data.result.Идентификатор || documentId
			const taskLink = response.data.result.СсылкаДляНашаОрганизация || null
			const department = response.data.result.Подразделение
			const executor = response.data.result.Исполнитель || response.data.result.Этап?.[0]?.Действие?.[0]?.Исполнитель
			
			console.log('✅ Задача успешно создана в SBIS')
			console.log(`   ID задачи: ${taskId}`)
			console.log(`   Ссылка: ${taskLink || 'не предоставлена'}`)
			console.log(`   Подразделение в ответе: ${department ? JSON.stringify(department) : 'не указано'}`)
			console.log(`   Исполнитель в ответе: ${executor ? JSON.stringify(executor) : 'не назначен'}`)
			console.log(`   Состояние: ${response.data.result.Состояние?.Название || 'неизвестно'}`)
			
			// Запускаем задачу в документооборот и назначаем исполнителя через СБИС.ВыполнитьДействие
			// Согласно документации (строка 726-728): для запуска ДО используем этап "На выполнение"
			// Исполнитель назначается через СледующийЭтап.Исполнитель для этапа "Выполнение" (строки 996-1030)
			if (nextStaff) {
				console.log('[SBIS Task] Запускаем задачу в документооборот и назначаем исполнителя через СБИС.ВыполнитьДействие...')
				try {
					// Получаем идентификатор редакции из ответа
					const currentRevision = response.data.result.Редакция?.find(r => r.Актуален === 'Да')
					const revisionId = currentRevision?.Идентификатор
					
					// Формируем объект сотрудника для исполнителя согласно документации (строки 1017-1021, 631-635)
					// Согласно строке 613: "Идентификатор": строка, табельный номер (идентификатор)
					// Согласно строке 477: "Идентификатор": строка, уникальный идентификатор в системе
					// ВАЖНО: Идентификатор должен быть СТРОКОЙ, не числом!
					let employee = {
						Сотрудник: nextStaff.Идентификатор 
							? {
								// Идентификатор должен быть строкой согласно документации (строка 613, 632)
								Идентификатор: String(nextStaff.Идентификатор),
								Фамилия: nextStaff.Фамилия,
								Имя: nextStaff.Имя,
								Отчество: nextStaff.Отчество
							}
							: {
								Фамилия: nextStaff.Фамилия,
								Имя: nextStaff.Имя,
								Отчество: nextStaff.Отчество
							}
					}
					
					// Если идентификатор есть, но SBIS его не принимает, попробуем без идентификатора
					// Сначала пробуем с идентификатором, если ошибка - используем только ФИО
					const employeeWithId = employee
					const employeeWithoutId = {
						Сотрудник: {
							Фамилия: nextStaff.Фамилия,
							Имя: nextStaff.Имя,
							Отчество: nextStaff.Отчество
						}
					}
					
					// Согласно документации (строки 733-745): запускаем задачу через этап "На выполнение"
					// И назначаем исполнителя для следующего этапа "Выполнение" через СледующийЭтап.Исполнитель (строки 1012-1030)
					const executeActionParams = {
						Документ: {
							Идентификатор: taskId,
							Этап: {
								Название: 'На выполнение', // Этап для запуска задачи в документооборот (строка 740)
								Действие: [
									{
										// Если в регламенте один стартовый переход, действие можно не передавать (строка 728)
										// Но для назначения исполнителя нужно указать СледующийЭтап
										СледующийЭтап: [
											{
												Название: 'Выполнение', // Следующий этап после "На выполнение"
												Исполнитель: [employee] // Исполнитель указывается в массиве (строки 1015-1030)
											}
										]
									}
								]
							}
						}
					}
					
					// Если есть идентификатор редакции, используем его (рекомендуется согласно строке 708)
					if (revisionId) {
						executeActionParams.Документ.Редакция = {
							Идентификатор: revisionId
						}
					}
					
					console.log('[SBIS Task] Запрос на выполнение действия с назначением исполнителя:', JSON.stringify(executeActionParams, null, 2))
					
					let executeResponse
					try {
						executeResponse = await axios.post(
							SBIS_SERVICES.edo,
							{
								jsonrpc: '2.0',
								method: 'СБИС.ВыполнитьДействие',
								params: executeActionParams,
								id: Date.now()
							},
							{
								headers: {
									'Content-Type': 'application/json-rpc; charset=utf-8',
									'X-SBISAccessToken': oauthToken,
								},
								timeout: 30000,
							}
						)
						
						console.log('[SBIS Task] Ответ на выполнение действия:', JSON.stringify(executeResponse.data, null, 2))
					} catch (err) {
						console.log('[SBIS Task] Ошибка при выполнении действия:', err.response?.data || err.message)
						executeResponse = { data: { error: err.response?.data?.error || { message: err.message } } }
					}
					
					// Если ошибка связана с идентификатором сотрудника, пробуем без идентификатора
					if (executeResponse.data.error && 
						(executeResponse.data.error.message?.includes('Не удалось определить работающего сотрудника') ||
						 executeResponse.data.error.message?.includes('идентификатор'))) {
						console.log('[SBIS Task] Ошибка с идентификатором сотрудника, пробуем назначить исполнителя только по ФИО...')
						
						// Обновляем параметры без идентификатора
						executeActionParams.Документ.Этап.Действие[0].СледующийЭтап[0].Исполнитель = [employeeWithoutId]
						
						console.log('[SBIS Task] Запрос на выполнение действия с исполнителем (только ФИО):', JSON.stringify(executeActionParams, null, 2))
						
						try {
							executeResponse = await axios.post(
								SBIS_SERVICES.edo,
								{
									jsonrpc: '2.0',
									method: 'СБИС.ВыполнитьДействие',
									params: executeActionParams,
									id: Date.now()
								},
								{
									headers: {
										'Content-Type': 'application/json-rpc; charset=utf-8',
										'X-SBISAccessToken': oauthToken,
									},
									timeout: 30000,
								}
							)
							
							console.log('[SBIS Task] Ответ на выполнение действия (только ФИО):', JSON.stringify(executeResponse.data, null, 2))
						} catch (err2) {
							console.log('[SBIS Task] Ошибка при выполнении действия (только ФИО):', err2.response?.data || err2.message)
							executeResponse = { data: { error: err2.response?.data?.error || { message: err2.message } } }
						}
					}
					
					if (executeResponse.data.result && !executeResponse.data.error) {
						// Проверяем все возможные места, где может быть исполнитель в ответе
						const result = executeResponse.data.result
						const assignedExecutor = result.Этап?.[0]?.Действие?.[0]?.Исполнитель || 
												 result.Исполнитель ||
												 result.Событие?.[0]?.Исполнитель ||
												 result.Этап?.[0]?.Исполнитель ||
												 result.Ответственный
						
						console.log('✅ Задача запущена в документооборот')
						console.log(`   Состояние: ${result.Состояние?.Название || 'неизвестно'}`)
						console.log(`   Этап: ${result.Этап?.[0]?.Название || 'неизвестно'}`)
						console.log(`   Этап ID: ${result.Этап?.[0]?.Идентификатор || 'неизвестно'}`)
						
						// Проверяем действия в этапе
						if (result.Этап?.[0]?.Действие) {
							console.log(`   Действия в этапе: ${result.Этап[0].Действие.map(a => a.Название).join(', ')}`)
							result.Этап[0].Действие.forEach((action, idx) => {
								if (action.Исполнитель) {
									console.log(`   ✅ Исполнитель найден в действии "${action.Название}": ${JSON.stringify(action.Исполнитель)}`)
								}
							})
						}
						
						if (assignedExecutor) {
							console.log(`✅ Исполнитель назначен: ${JSON.stringify(assignedExecutor)}`)
						} else {
							// Если исполнитель не найден в ответе, но задача запущена - возможно он назначен автоматически
							console.log('⚠️ Исполнитель не найден в ответе API, но задача запущена')
							console.log('   Возможно, исполнитель был назначен автоматически SBIS при запуске задачи')
							console.log('   Или исполнитель будет назначен при переходе на этап "Выполнение"')
							console.log('   Проверьте задачу в SBIS - исполнитель должен быть назначен')
						}
					} else {
						console.log('⚠️ Ошибка при запуске задачи в документооборот:', executeResponse.data.error?.message || 'неизвестная ошибка')
						console.log('⚠️ Исполнитель должен быть назначен вручную в интерфейсе SBIS')
					}
				} catch (executeError) {
					console.log('⚠️ Ошибка при запуске задачи в документооборот:', executeError.response?.data?.error?.message || executeError.message)
					console.log('⚠️ Исполнитель должен быть назначен вручную в интерфейсе SBIS')
				}
			}
			
			// Если наблюдатель не был добавлен при создании, пробуем обновить документ
		if (!directorInfo) {
			const directorRetry = await findDirectorSBISInfo(oauthToken)
			if (directorRetry) {
				try {
					const addObserverRequest = {
						jsonrpc: '2.0',
						method: 'СБИС.ЗаписатьДокумент',
						params: {
							Документ: {
								Идентификатор: taskId,
								Наблюдатель: [directorRetry]
							}
						},
						id: Date.now()
					};
					const obsResponse = await axios.post(SBIS_SERVICES.edo, addObserverRequest, {
						headers: { 'Content-Type': 'application/json-rpc; charset=utf-8', 'X-SBISAccessToken': oauthToken },
						timeout: 15000,
					});
					if (obsResponse.data.result && !obsResponse.data.error) {
						console.log(`✅ [SBIS] Директор добавлен как наблюдатель задачи ${taskId} (повторная попытка)`);
					} else {
						console.warn(`⚠️ [SBIS] Не удалось добавить наблюдателя: ${obsResponse.data.error?.message || 'unknown'}`);
					}
				} catch (obsError) {
					console.warn(`⚠️ [SBIS] Ошибка добавления наблюдателя: ${obsError.message}`);
				}
			}
		}

			return {
				success: true,
				sbisTaskId: taskId,
				sbisTaskNumber: response.data.result.Номер || taskData.subject,
				sbisLink: taskLink,
				details: response.data.result,
				assignedStaff: nextStaff || null
			}
		}

		throw new Error('Неожиданный ответ от SBIS API')
	} catch (error) {
		console.error('❌ Ошибка создания задачи в SBIS:', error.response?.data || error.message)
		throw error
	}
}

/**
 * GET /api/sbis-proxy/tech-staff
 * Получить список сотрудников техотдела с их ID из SBIS
 * Полезно для настройки переменной окружения SBIS_TECH_DEPARTMENT_STAFF
 */
router.get('/tech-staff', async (req, res) => {
	try {
		const { userId } = req.query
		const userKey = userId || 'default'
		
		// Получаем OAuth токен
		let oauthToken = oauthTokens.get(userKey)
		
		if (!oauthToken) {
			// Пытаемся получить токен
			const authResponse = await axios.post(SBIS_OAUTH_URL, {
				app_client_id: SBIS_APP_CLIENT_ID,
				app_secret: SBIS_APP_SECRET,
				secret_key: SBIS_SECRET_KEY,
			}, {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
				},
				timeout: 30000,
			})
			
			if (authResponse.data && authResponse.data.token) {
				oauthToken = authResponse.data.token
				oauthTokens.set(userKey, oauthToken)
			} else {
				return res.status(401).json({ error: 'Не удалось получить OAuth токен' })
			}
		}
		
		// Получаем список сотрудников из подразделения
		const departmentName = SBIS_DEPARTMENT_NAME || SBIS_DEPARTMENT_ID
		const employees = await getStaffListFromSBIS(oauthToken, departmentName)
		
		// Форматируем результат для удобства
		const staffList = employees.map(emp => ({
			id: emp.Идентификатор,
			fullName: `${emp.Фамилия} ${emp.Имя} ${emp.Отчество || ''}`.trim(),
			lastName: emp.Фамилия,
			firstName: emp.Имя,
			middleName: emp.Отчество || '',
			department: emp.Подразделение?.Название || emp.Подразделение?.Идентификатор || 'Не указано',
			// Формат для копирования в переменную окружения: "ФИО|ID"
			envFormat: `${emp.Фамилия} ${emp.Имя} ${emp.Отчество || ''}`.trim() + (emp.Идентификатор ? `|${emp.Идентификатор}` : '')
		}))
		
		return res.json({
			success: true,
			department: departmentName || 'Все подразделения',
			count: staffList.length,
			staff: staffList,
			// Готовая строка для переменной окружения SBIS_TECH_DEPARTMENT_STAFF
			envString: staffList.map(s => s.envFormat).join(', ')
		})
	} catch (error) {
		console.error('Get tech staff error:', error)
		res.status(500).json({
			success: false,
			error: error.message,
		})
	}
})

/**
 * GET /api/sbis-proxy/departments
 * Получить список подразделений из SBIS
 */
router.get('/departments', async (req, res) => {
	try {
		const { userId } = req.query
		const userKey = userId || 'default'
		
		// Получаем OAuth токен
		let oauthToken = oauthTokens.get(userKey)
		
		if (!oauthToken) {
			// Пытаемся получить токен
			const authResponse = await axios.post(SBIS_OAUTH_URL, {
				app_client_id: SBIS_APP_CLIENT_ID,
				app_secret: SBIS_APP_SECRET,
				secret_key: SBIS_SECRET_KEY,
			}, {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
				},
				timeout: 30000,
			})
			
			if (authResponse.data && authResponse.data.token) {
				oauthToken = authResponse.data.token
				oauthTokens.set(userKey, oauthToken)
			} else {
				return res.status(401).json({ error: 'Не удалось получить OAuth токен' })
			}
		}
		
		// Пробуем разные методы для получения подразделений
		const methods = [
			{ method: 'Подразделение.Список', params: {} },
			{ method: 'СБИС.СписокПодразделений', params: {} },
			{ method: 'Организация.Подразделения', params: {} },
			{ method: 'Подразделения.Список', params: {} },
		]
		
		for (const methodInfo of methods) {
			try {
				const response = await axios.post(
					SBIS_SERVICES.edo,
					{
						jsonrpc: '2.0',
						method: methodInfo.method,
						params: methodInfo.params,
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISAccessToken': oauthToken,
						},
						timeout: 30000,
					}
				)
				
				if (response.data.result && !response.data.error) {
					console.log(`✅ Метод ${methodInfo.method} работает`)
					return res.json({
						success: true,
						method: methodInfo.method,
						departments: response.data.result,
					})
				}
			} catch (error) {
				console.log(`❌ Метод ${methodInfo.method} не работает:`, error.response?.data?.error?.message || error.message)
				continue
			}
		}
		
		res.status(404).json({
			success: false,
			error: 'Не удалось получить список подразделений. Попробуйте найти идентификатор подразделения вручную в интерфейсе SBIS.',
		})
	} catch (error) {
		console.error('Get departments error:', error)
		res.status(500).json({
			success: false,
			error: error.message,
		})
	}
})

// Экспортируем функцию для использования в других модулях
module.exports.createSBISTask = createSBISTask

/**
 * POST /api/sbis-proxy/proxy
 * Проксирует JSON-RPC запросы к СБИС
 * 
 * ВАЖНО: Для работы с API необходимо передавать токен доступа в заголовке X-SBISAccessToken
 */
router.post('/proxy', async (req, res) => {
	try {
		const { method, params, userId } = req.body

		if (!method) {
			return res.status(400).json({ error: 'Method is required' })
		}

		const userKey = userId || 'default'
		
		// Получаем OAuth токен из заголовка (приоритет), из кэша или сессию (fallback)
		let oauthToken = req.headers['x-sbisaccesstoken'] || oauthTokens.get(userKey)
		const sessionId = userSessions.get(userKey)
		
		// Если токен передан в заголовке, сохраняем его в кэш
		if (req.headers['x-sbisaccesstoken'] && !oauthTokens.get(userKey)) {
			oauthTokens.set(userKey, oauthToken)
		}

		// Формируем параметры с сессией (если используется старый метод)
		const requestParams = sessionId ? { ...params, Сессия: sessionId } : params

		// Определяем URL в зависимости от метода
		const url =
			method === 'СБИС.Аутентифицировать' ? SBIS_AUTH_URL : SBIS_API_URL

		const headers = {
			'Content-Type': 'application/json-rpc; charset=utf-8',
		}

		// Добавляем токен доступа в заголовки (приоритет)
		if (oauthToken) {
			headers['X-SBISAccessToken'] = oauthToken
			console.log(`SBIS Proxy [${method}]: Using OAuth token`)
		} else if (sessionId) {
			// Fallback на старый метод с сессией
			headers['X-SBISSessionID'] = sessionId
			console.log(`SBIS Proxy [${method}]: Using session ID`)
		} else {
			console.warn(`SBIS Proxy [${method}]: No token or session found for user ${userKey}`)
		}

		console.log(`SBIS Proxy [${method}]:`, { url, hasToken: !!oauthToken, hasSession: !!sessionId })

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

		// Если это авторизация - сохраняем сессию (для обратной совместимости)
		if (method === 'СБИС.Аутентифицировать' && response.data.result) {
			userSessions.set(userKey, response.data.result)
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
 * Сервисная авторизация в СБИС через OAuth (app_client_id + app_secret + secret_key)
 * Это даёт доступ к полному API CRM, контрагентов, документов
 *
 * Формат запроса согласно документации:
 * POST https://online.sbis.ru/oauth/service/
 * Body: JSON с полями app_client_id, app_secret, secret_key
 * Ответ: JSON с полем token
 */
router.post('/auth-service', async (req, res) => {
	try {
		const { userId } = req.body
		const userKey = userId || 'default'

		console.log('=== SBIS Service Auth (OAuth) ===')
		console.log('app_client_id:', SBIS_APP_CLIENT_ID)
		console.log('app_secret:', SBIS_APP_SECRET ? '***' : 'MISSING')
		console.log('secret_key:', SBIS_SECRET_KEY ? '***' : 'MISSING')
		console.log('URL:', SBIS_OAUTH_URL)

		// Формируем JSON тело запроса согласно документации
		const requestBody = {
					app_client_id: SBIS_APP_CLIENT_ID,
					app_secret: SBIS_APP_SECRET,
			secret_key: SBIS_SECRET_KEY,
		}

		console.log('Request body (without secrets):', JSON.stringify({
			app_client_id: requestBody.app_client_id,
			app_secret: '***',
			secret_key: '***'
		}))

		// Выполняем POST запрос
		const response = await axios.post(SBIS_OAUTH_URL, requestBody, {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
			},
			timeout: 30000,
		})

		console.log('Response status:', response.status)
		console.log('Response headers:', JSON.stringify(response.headers))
		console.log('Response data:', JSON.stringify(response.data))

		// Проверяем ответ
		if (response.data && response.data.token) {
			const token = response.data.token
			
			// Сохраняем токен для пользователя
			oauthTokens.set(userKey, token)
			
			console.log('✅ OAuth token получен и сохранен для пользователя:', userKey)
			
			res.json({
				success: true,
				token: token,
				message: 'Авторизация успешна',
			})
		} else {
			console.error('❌ Токен не найден в ответе:', response.data)
			res.status(500).json({
				error: 'Токен не получен',
				response: response.data,
			})
		}
	} catch (error) {
		console.error('OAuth Error:', error.response?.data || error.message)
		res.status(error.response?.status || 500).json({
			success: false,
			error: error.response?.data?.error || error.message,
			details: error.response?.data,
		})
	}
})

/**
 * POST /api/sbis-proxy/contractor-info
 * Получение информации о контрагенте по ИНН через метод "СБИС.ИнформацияОКонтрагенте"
 * Используется при регистрации для автоматического заполнения данных организации
 */
router.post('/contractor-info', async (req, res) => {
	try {
		const { inn, kpp } = req.body
		const userKey = req.body.userId || 'default'

		if (!inn) {
			return res.status(400).json({ error: 'ИНН обязателен' })
		}

		console.log('=== Получение информации о контрагенте по ИНН ===')
		console.log('ИНН:', inn)
		console.log('КПП:', kpp || 'не указан')

		// Определяем тип контрагента по длине ИНН
		const innLength = inn.replace(/\D/g, '').length
		const isIP = innLength === 12 // ИП имеет 12-значный ИНН
		const isOOO = innLength === 10 // ООО имеет 10-значный ИНН

		console.log('Тип контрагента:', isIP ? 'ИП' : isOOO ? 'ООО' : 'Неизвестно')

		// Получаем или создаем OAuth токен
		let oauthToken = oauthTokens.get(userKey)
		
		if (!oauthToken) {
			console.log('OAuth токен не найден, выполняем авторизацию...')
			try {
				const requestBody = {
					app_client_id: SBIS_APP_CLIENT_ID,
					app_secret: SBIS_APP_SECRET,
					secret_key: SBIS_SECRET_KEY,
				}

				const authResponse = await axios.post(SBIS_OAUTH_URL, requestBody, {
					headers: {
						'Content-Type': 'application/json; charset=utf-8',
					},
					timeout: 30000,
				})

				if (authResponse.data && authResponse.data.token) {
					oauthToken = authResponse.data.token
					oauthTokens.set(userKey, oauthToken)
					console.log('✅ OAuth токен получен')
				} else {
					return res.status(401).json({ 
						error: 'Не удалось получить OAuth токен',
						details: authResponse.data 
					})
				}
			} catch (authError) {
				console.error('❌ Ошибка авторизации в SBIS:')
				console.error('   Status:', authError.response?.status)
				console.error('   Data:', JSON.stringify(authError.response?.data, null, 2))
				console.error('   Message:', authError.message)
				
				return res.status(401).json({ 
					error: 'Ошибка авторизации в SBIS',
					message: authError.response?.data?.error || authError.response?.data?.message || authError.message,
					details: authError.response?.data,
					status: authError.response?.status
				})
			}
		}

		// Формируем параметры запроса
		// Согласно документации SBIS и ошибке API:
		// - Для ООО (10 цифр ИНН) используется структура СвЮЛ с КПП
		// - Для ИП (12 цифр ИНН) используется структура СвФЛ (физическое лицо, без КПП)
		const cleanInn = inn.replace(/\D/g, '')
		
		let params
		if (isIP) {
			// ИП - используем структуру СвФЛ (физическое лицо)
			params = {
				Участник: {
					СвФЛ: {
						ИНН: cleanInn
					}
				}
			}
				} else {
			// ООО - используем структуру СвЮЛ
			// ВАЖНО: SBIS требует КПП для ООО
			// Если КПП не указан, используем пустую строку для головной организации
			// Если это не сработает, можно попробовать использовать "0" или другой метод API
			const kppValue = (kpp && kpp.trim().length > 0) ? kpp.trim() : ''
			
			params = {
				Участник: {
					СвЮЛ: {
						ИНН: cleanInn
					}
				}
			}
			
			// Всегда передаем КПП (даже пустую строку), так как SBIS требует это поле
			params.Участник.СвЮЛ.КПП = kppValue
			
			if (!kppValue) {
				console.log('⚠️  КПП не указан для ООО, используем пустую строку (головная организация)')
			}
		}
		
		console.log('Параметры запроса:', JSON.stringify(params, null, 2))
		console.log('OAuth токен:', oauthToken ? `${oauthToken.substring(0, 20)}...` : 'MISSING')
		console.log('URL запроса:', SBIS_SERVICES.edo)

		// Выполняем запрос к SBIS API
		const requestBody = {
						jsonrpc: '2.0',
			method: 'СБИС.ИнформацияОКонтрагенте',
			params: params,
						id: Date.now(),
					}
		
		console.log('Request body:', JSON.stringify(requestBody, null, 2))
		
		let sbisResponse
		try {
			sbisResponse = await axios.post(
				SBIS_SERVICES.edo, // https://online.sbis.ru/service/?srv=1
				requestBody,
				{
					headers: {
						'Content-Type': 'application/json-rpc; charset=utf-8',
						'X-SBISAccessToken': oauthToken,
					},
					timeout: 30000,
					validateStatus: (status) => status < 600, // Не выбрасывать исключение для любых HTTP ответов
				}
			)
		} catch (axiosError) {
			// Если axios выбрасывает исключение (например, сетевые ошибки)
			console.error('❌ Axios error:', axiosError.message)
			console.error('❌ Axios error response:', axiosError.response?.data)
			
			// Если это ошибка от SBIS API (есть response.data), обрабатываем её
			if (axiosError.response?.data?.error) {
				const errorMessage = axiosError.response.data.error.message || ''
				console.log('[AXIOS CATCH] Проверка условия для повторного запроса:')
				console.log('[AXIOS CATCH]   errorMessage:', errorMessage)
				console.log('[AXIOS CATCH]   kpp:', kpp)
				console.log('[AXIOS CATCH]   isOOO:', isOOO)
				
				if (errorMessage.includes('КПП') && (!kpp || kpp.trim() === '') && isOOO) {
					console.log('⚠️  [AXIOS CATCH] Ошибка из-за отсутствия КПП, пробуем альтернативные методы...')
					
					// Пробуем получить данные через внешние API (EGRUL, DaData, FNS)
					let alternativeData = null
					
					// 1. Пробуем EGRUL API
					try {
						console.log('[AXIOS CATCH] Пробуем EGRUL API...')
						const egrulResult = await searchContractorItsoft(cleanInn)
						if (egrulResult && egrulResult.name && !egrulResult.name.includes('(ИНН:')) {
							console.log('✅ [AXIOS CATCH] Данные получены через EGRUL:', egrulResult.name)
							alternativeData = {
								success: true,
								inn: egrulResult.inn || cleanInn,
								kpp: egrulResult.kpp || null,
								name: egrulResult.name || null,
								legalAddress: egrulResult.address || null,
								ogrn: egrulResult.ogrn || null,
								type: 'OOO',
								source: 'egrul'
							}
						}
					} catch (egrulError) {
						console.log('[AXIOS CATCH] EGRUL API failed:', egrulError.message)
					}
					
					// 2. Если EGRUL не сработал, пробуем DaData
					if (!alternativeData) {
						try {
							console.log('[AXIOS CATCH] Пробуем DaData API...')
							const dadataResult = await searchContractorDaData(cleanInn)
							if (dadataResult && dadataResult.name && !dadataResult.name.includes('(ИНН:')) {
								console.log('✅ [AXIOS CATCH] Данные получены через DaData:', dadataResult.name)
								alternativeData = {
									success: true,
									inn: dadataResult.inn || cleanInn,
									kpp: dadataResult.kpp || null,
									name: dadataResult.name || null,
									legalAddress: dadataResult.address || null,
									ogrn: dadataResult.ogrn || null,
									type: 'OOO',
									source: 'dadata'
								}
							}
						} catch (dadataError) {
							console.log('[AXIOS CATCH] DaData API failed:', dadataError.message)
						}
					}
					
					// 3. Если DaData не сработал, пробуем FNS
					if (!alternativeData) {
						try {
							console.log('[AXIOS CATCH] Пробуем FNS API...')
							const fnsResult = await searchContractorFNS(cleanInn)
							if (fnsResult && fnsResult.name && !fnsResult.name.includes('(ИНН:')) {
								console.log('✅ [AXIOS CATCH] Данные получены через FNS:', fnsResult.name)
								alternativeData = {
									success: true,
									inn: fnsResult.inn || cleanInn,
									kpp: fnsResult.kpp || null,
									name: fnsResult.name || null,
									legalAddress: fnsResult.address || null,
									ogrn: fnsResult.ogrn || null,
									type: 'OOO',
									source: 'fns'
								}
							}
						} catch (fnsError) {
							console.log('[AXIOS CATCH] FNS API failed:', fnsError.message)
						}
					}
					
					// Если получили данные из альтернативного источника, возвращаем их
					if (alternativeData && alternativeData.name) {
						console.log('✅ [AXIOS CATCH] Возвращаем данные из альтернативного источника:', alternativeData.source)
						return res.json(alternativeData)
					}
					
					// Если альтернативные методы не сработали, возвращаем ошибку с подсказкой
					console.log('❌ [AXIOS CATCH] Все альтернативные методы не сработали')
					return res.status(400).json({
						error: 'Ошибка при получении информации о контрагенте',
						message: 'Для ООО необходимо указать КПП. Пожалуйста, укажите КПП организации.',
						details: axiosError.response?.data?.error,
						code: axiosError.response?.data?.error?.code,
						hint: 'КПП обязателен для организаций (ООО). Укажите КПП в поле регистрации.'
					})
				} else {
					// Для других ошибок возвращаем как обычно
					return res.status(axiosError.response?.status || 500).json({
						error: 'Ошибка при получении информации о контрагенте',
						message: axiosError.response?.data?.error?.message || axiosError.message,
						details: axiosError.response?.data
					})
				}
			} else {
				// Если это не ошибка от SBIS API (сетевые ошибки и т.д.)
				return res.status(500).json({
					error: 'Ошибка при запросе к SBIS API',
					message: axiosError.message,
					details: axiosError.response?.data
				})
			}
		}

		console.log('SBIS API Response status:', sbisResponse.status)
		console.log('SBIS API Response:', JSON.stringify(sbisResponse.data, null, 2))

		if (sbisResponse.data.error) {
			console.error('❌ SBIS API Error:')
			console.error('   Error object:', JSON.stringify(sbisResponse.data.error, null, 2))
			
			// Если ошибка связана с отсутствием КПП для ООО, пробуем использовать "0" или другой подход
			const errorMessage = sbisResponse.data.error.message || ''
			console.log('[DEBUG] Проверка условия для повторного запроса:')
			console.log('[DEBUG]   errorMessage:', errorMessage)
			console.log('[DEBUG]   errorMessage.includes("КПП"):', errorMessage.includes('КПП'))
			console.log('[DEBUG]   kpp:', kpp)
			console.log('[DEBUG]   !kpp:', !kpp)
			console.log('[DEBUG]   isOOO:', isOOO)
			console.log('[DEBUG]   Условие выполняется:', errorMessage.includes('КПП') && !kpp && isOOO)
			
			if (errorMessage.includes('КПП') && (!kpp || kpp.trim() === '') && isOOO) {
				console.log('⚠️  Ошибка из-за отсутствия КПП, пробуем альтернативные методы (EGRUL, DaData, FNS)...')
				
				// Пробуем получить данные через внешние API (EGRUL, DaData, FNS)
				let alternativeData = null
				
				// 1. Пробуем EGRUL API (официальные данные из реестра ФНС)
				try {
					console.log('[ALTERNATIVE] Пробуем EGRUL API (egrul.itsoft.ru)...')
					const egrulResult = await searchContractorItsoft(cleanInn)
					if (egrulResult && egrulResult.name && !egrulResult.name.includes('(ИНН:')) {
						console.log('✅ [ALTERNATIVE] Данные получены через EGRUL:', egrulResult.name)
						alternativeData = {
							success: true,
							inn: egrulResult.inn || cleanInn,
							kpp: egrulResult.kpp || null,
							name: egrulResult.name || null,
							legalAddress: egrulResult.address || null,
							ogrn: egrulResult.ogrn || null,
							type: 'OOO',
							source: 'egrul'
						}
					}
				} catch (egrulError) {
					console.log('[ALTERNATIVE] EGRUL API failed:', egrulError.message)
				}
				
				// 2. Если EGRUL не сработал, пробуем DaData
				if (!alternativeData) {
					try {
						console.log('[ALTERNATIVE] Пробуем DaData API...')
						const dadataResult = await searchContractorDaData(cleanInn)
						if (dadataResult && dadataResult.name && !dadataResult.name.includes('(ИНН:')) {
							console.log('✅ [ALTERNATIVE] Данные получены через DaData:', dadataResult.name)
							alternativeData = {
								success: true,
								inn: dadataResult.inn || cleanInn,
								kpp: dadataResult.kpp || null,
								name: dadataResult.name || null,
								legalAddress: dadataResult.address || null,
								ogrn: dadataResult.ogrn || null,
								type: 'OOO',
								source: 'dadata'
							}
						}
					} catch (dadataError) {
						console.log('[ALTERNATIVE] DaData API failed:', dadataError.message)
					}
				}
				
				// 3. Если DaData не сработал, пробуем FNS
				if (!alternativeData) {
					try {
						console.log('[ALTERNATIVE] Пробуем FNS API (egrul.nalog.ru)...')
						const fnsResult = await searchContractorFNS(cleanInn)
						if (fnsResult && fnsResult.name && !fnsResult.name.includes('(ИНН:')) {
							console.log('✅ [ALTERNATIVE] Данные получены через FNS:', fnsResult.name)
							alternativeData = {
								success: true,
								inn: fnsResult.inn || cleanInn,
								kpp: fnsResult.kpp || null,
								name: fnsResult.name || null,
								legalAddress: fnsResult.address || null,
								ogrn: fnsResult.ogrn || null,
								type: 'OOO',
								source: 'fns'
							}
						}
					} catch (fnsError) {
						console.log('[ALTERNATIVE] FNS API failed:', fnsError.message)
					}
				}
				
				// Если получили данные из альтернативного источника, возвращаем их
				if (alternativeData && alternativeData.name) {
					console.log('✅ [ALTERNATIVE] Возвращаем данные из альтернативного источника:', alternativeData.source)
					return res.json(alternativeData)
				}
				
				// Если альтернативные методы не сработали, возвращаем ошибку с подсказкой
				console.log('❌ [ALTERNATIVE] Все альтернативные методы не сработали')
				return res.status(400).json({
					error: 'Ошибка при получении информации о контрагенте',
					message: 'Для ООО необходимо указать КПП. Пожалуйста, укажите КПП организации.',
					details: sbisResponse.data.error,
					code: sbisResponse.data.error.code,
					hint: 'КПП обязателен для организаций (ООО). Укажите КПП в поле регистрации.'
				})
			} else {
				// Для других ошибок возвращаем как обычно
				return res.status(400).json({
					error: 'Ошибка при получении информации о контрагенте',
					message: sbisResponse.data.error.message || sbisResponse.data.error.user_hint || 'Неизвестная ошибка',
					details: sbisResponse.data.error,
					code: sbisResponse.data.error.code
				})
			}
		}

		const result = sbisResponse.data.result
		if (!result) {
			return res.status(404).json({ error: 'Контрагент не найден' })
		}

		// Извлекаем данные из ответа
		// Для ООО данные в result.СвЮЛ
		// Для ИП данные в result.СвФЛ (физическое лицо)
		let svul = null
		let svfl = null
		
		if (result.СвЮЛ) {
			svul = result.СвЮЛ
		} else if (result.СвФЛ) {
			svfl = result.СвФЛ
		}
		
		const identifier = result.Идентификатор

		// Формируем ответ в удобном формате для Android
		let responseData
		
		if (isIP && svfl) {
			// ИП - данные из СвФЛ (физическое лицо)
			const fio = `${svfl.Фамилия || ''} ${svfl.Имя || ''} ${svfl.Отчество || ''}`.trim() || null
			responseData = {
					success: true,
				inn: svfl.ИНН || cleanInn,
				kpp: null, // У ИП нет КПП
				name: svfl.ФИО || fio || null, // ФИО ИП из SBIS
				legalAddress: svfl.АдресЮридический || svfl.Адрес || svfl.АдресРегистрации || null, // Адрес из SBIS
				countryCode: svfl.КодСтраны || null,
				branchCode: svfl.КодФилиала || null,
				identifier: identifier || null,
				identifiers: Array.isArray(identifier) ? identifier : null,
				type: 'IP',
				// Дополнительные поля для ИП
				ogrnip: svfl.ОГРНИП || null,
				ogrn: svfl.ОГРНИП || null, // Для ИП ОГРНИП = ОГРН
				ceo: fio || null
			}
		} else if (!isIP && svul) {
			// ООО - данные из СвЮЛ
			// Согласно документации (строка 71-72): АдресЮридический - юридический адрес головной организации
			// Название - название организации (строка 71)
			responseData = {
				success: true,
				inn: svul.ИНН || cleanInn,
				kpp: svul.КПП || kpp || null,
				name: svul.Название || null, // Название организации из SBIS
				legalAddress: svul.АдресЮридический || null, // Юридический адрес из SBIS
				countryCode: svul.КодСтраны || null,
				branchCode: svul.КодФилиала || null,
				identifier: identifier || null,
				identifiers: Array.isArray(identifier) ? identifier : null,
				type: 'OOO',
				// Дополнительные поля для ООО
				ogrn: svul.ОГРН || null
			}
		} else {
			// Fallback - если структура неожиданная
			const data = svul || svfl || result
			responseData = {
				success: true,
				inn: data.ИНН || cleanInn,
				kpp: isIP ? null : (data.КПП || kpp || null),
				name: data.Название || data.ФИО || (svfl ? `${svfl.Фамилия || ''} ${svfl.Имя || ''} ${svfl.Отчество || ''}`.trim() : null) || null,
				legalAddress: data.АдресЮридический || data.Адрес || data.АдресРегистрации || null,
				countryCode: data.КодСтраны || null,
				branchCode: data.КодФилиала || null,
				identifier: identifier || null,
				identifiers: Array.isArray(identifier) ? identifier : null,
				type: isIP ? 'IP' : 'OOO'
			}
		}

		console.log('✅ Информация о контрагенте получена:')
		console.log('   Название:', responseData.name)
		console.log('   ИНН:', responseData.inn)
		console.log('   КПП:', responseData.kpp)
		console.log('   Адрес:', responseData.legalAddress)
		console.log('   ОГРН/ОГРНИП:', responseData.ogrn || responseData.ogrnip)
		console.log('   Тип:', responseData.type)
		console.log('   Идентификатор:', responseData.identifier)
		console.log('   Полный ответ SBIS:', JSON.stringify(result, null, 2))

		res.json(responseData)
	} catch (error) {
		console.error('Contractor info error (catch block):', error.response?.data || error.message)
		console.error('Error stack:', error.stack)
		
		// Если это ошибка от SBIS API (в response.data.error), обрабатываем её
		if (error.response?.data?.error) {
			const errorMessage = error.response.data.error.message || ''
			console.log('[CATCH] Проверка условия для повторного запроса:')
			console.log('[CATCH]   errorMessage:', errorMessage)
			console.log('[CATCH]   kpp:', kpp)
			console.log('[CATCH]   isOOO:', isOOO)
			console.log('[CATCH]   Условие выполняется:', errorMessage.includes('КПП') && (!kpp || kpp.trim() === '') && isOOO)
			
			if (errorMessage.includes('КПП') && (!kpp || kpp.trim() === '') && isOOO) {
				console.log('⚠️  [CATCH] Ошибка из-за отсутствия КПП, пробуем использовать "0"...')
				
				try {
					const retryParams = {
						Участник: {
							СвЮЛ: {
								ИНН: cleanInn,
								КПП: '0'
							}
						}
					}
					
					const retryRequestBody = {
						jsonrpc: '2.0',
						method: 'СБИС.ИнформацияОКонтрагенте',
						params: retryParams,
						id: Date.now(),
					}
					
					console.log('[CATCH] Повторный запрос с КПП="0":', JSON.stringify(retryRequestBody, null, 2))
					
					const retryResponse = await axios.post(
						SBIS_SERVICES.edo,
						retryRequestBody,
						{
							headers: {
								'Content-Type': 'application/json-rpc; charset=utf-8',
								'X-SBISAccessToken': oauthToken,
							},
							timeout: 30000,
							validateStatus: (status) => status < 500,
						}
					)
					
					if (!retryResponse.data.error && retryResponse.data.result) {
						console.log('✅ [CATCH] Успешно получены данные с КПП="0"')
						// Продолжаем обработку с результатом повторного запроса
						const result = retryResponse.data.result
						
						// Извлекаем данные из ответа
						let svul = null
						let svfl = null
						
						if (result.СвЮЛ) {
							svul = result.СвЮЛ
						} else if (result.СвФЛ) {
							svfl = result.СвФЛ
						}
						
						const identifier = result.Идентификатор
						
						// Формируем ответ
						const responseData = {
							success: true,
							inn: svul?.ИНН || cleanInn,
							kpp: svul?.КПП || null,
							name: svul?.Название || null,
							legalAddress: svul?.АдресЮридический || null,
							countryCode: svul?.КодСтраны || null,
							branchCode: svul?.КодФилиала || null,
							identifier: identifier || null,
							identifiers: Array.isArray(identifier) ? identifier : null,
							type: 'OOO'
						}
						
						console.log('✅ [CATCH] Информация о контрагенте получена:')
						console.log('   Название:', responseData.name)
						console.log('   ИНН:', responseData.inn)
						console.log('   КПП:', responseData.kpp)
						
						return res.json(responseData)
					} else {
						// Если и с "0" не сработало, возвращаем ошибку с подсказкой
						return res.status(400).json({
							error: 'Ошибка при получении информации о контрагенте',
							message: 'Для ООО необходимо указать КПП. Пожалуйста, укажите КПП организации.',
							details: error.response?.data?.error || retryResponse.data.error,
							code: error.response?.data?.error?.code || retryResponse.data.error?.code,
							hint: 'КПП обязателен для организаций (ООО). Укажите КПП в поле регистрации.'
						})
					}
				} catch (retryError) {
					console.error('❌ [CATCH] Ошибка при повторном запросе:', retryError.message)
					return res.status(400).json({
						error: 'Ошибка при получении информации о контрагенте',
						message: 'Для ООО необходимо указать КПП. Пожалуйста, укажите КПП организации.',
						details: error.response?.data?.error,
						code: error.response?.data?.error?.code,
						hint: 'КПП обязателен для организаций (ООО). Укажите КПП в поле регистрации.'
					})
				}
			}
		}
		
		res.status(error.response?.status || 500).json({
			error: 'Ошибка при получении информации о контрагенте',
			message: error.response?.data?.error?.message || error.message,
			details: error.response?.data
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

		// 3. Пробуем сервисную авторизацию (OAuth) для доступа к ЭДО/CRM
		// Это нужно для методов, которые недоступны через обычную авторизацию
		let serviceToken = null
		if (!onlineSessionId) {
			console.log('⚠️ Online сессия не получена, пробуем сервисную авторизацию...')
			try {
				const secretKey = `user_${userId || 'default'}_${Date.now()}`
				
				// Пробуем разные методы сервисной авторизации
				const serviceAuthMethods = [
					{
						url: 'https://online.sbis.ru/oauth/service/',
						method: 'OAuth.Authorize',
						params: {
							app_client_id: SBIS_APP_CLIENT_ID,
							app_secret: SBIS_APP_SECRET,
							secret_key: secretKey,
						},
					},
					{
						url: 'https://online.sbis.ru/auth/service/',
						method: 'САП.Авторизоваться',
						params: {
							Приложение: SBIS_APP_CLIENT_ID,
							Секрет: SBIS_APP_SECRET,
							СекретныйКлюч: secretKey,
						},
					},
				]

				for (const authMethod of serviceAuthMethods) {
					try {
						const serviceResponse = await axios.post(
							authMethod.url,
							{
								jsonrpc: '2.0',
								method: authMethod.method,
								params: authMethod.params,
								id: Date.now(),
							},
							{
								headers: {
									'Content-Type': 'application/json-rpc; charset=utf-8',
								},
								timeout: 30000,
							}
						)

						const result =
							serviceResponse.data.result ||
							serviceResponse.data.access_token ||
							serviceResponse.data.sid ||
							serviceResponse.data.token

						if (result) {
							serviceToken = typeof result === 'string' ? result : result.sid || result.token
							onlineSessionId = serviceToken
							oauthTokens.set(userId || 'default', serviceToken)
							userSessions.set(userId || 'default', serviceToken)
							console.log('✅ Сервисная авторизация успешна!')
							break
						}
					} catch (e) {
						console.log(`⚠️ Сервисная авторизация (${authMethod.method}) не удалась:`, e.message)
					}
				}
			} catch (e) {
				console.log('⚠️ Ошибка при попытке сервисной авторизации:', e.message)
			}
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
			serviceToken: serviceToken,
			services: {
				online: !!onlineSessionId,
				spp: !!sppSessionId,
				serviceAuth: !!serviceToken,
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
				protocol: 3, // Согласно документации пункта 13
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
			const baseRequisites = data.BaseRequisites || {}

			// Извлекаем данные из ответа SPP API
			// Согласно документации, основные данные находятся в BaseRequisites
			const result = {
				inn: baseRequisites.INN || data.INN || data.inn || inn,
				kpp: baseRequisites.KPP || data.KPP || data.kpp,
				ogrn: baseRequisites.OGRN || data.OGRN || data.ogrn || data.OGRNIP, // ОГРНИП для ИП
				name: baseRequisites.Name || baseRequisites.ShortName || data.Name || data.ShortName || data.FullName,
				fullName: baseRequisites.FullName || data.FullName || data.Name,
				address: baseRequisites.Address || baseRequisites.ActualAddress || data.Address || data.LegalAddress,
				director: baseRequisites.DirectorName?.Name || baseRequisites.Head || data.Director || data.HeadName,
				okved: baseRequisites.OKVED || baseRequisites.ExtendedOKVED?.split(',')[0] || data.OKVED || data.MainOKVED,
				oktmo: baseRequisites.OKTMO || data.OKTMO || data.oktmo,
				okpo: baseRequisites.OKPO || data.OKPO || data.okpo,
				pfRegNumber: baseRequisites.RegNumberPF || data.PFRegNumber || data.pfRegNumber || data.PensionFundRegNumber,
				sfrRegNumber: baseRequisites.RegNumberFSS || data.SFRRegNumber || data.sfrRegNumber || data.SocialFundRegNumber,
				registrationDate: baseRequisites.DateRegistration || baseRequisites.DateOfOGRNRegistration || data.RegistrationDate || data.RegDate,
				registrationAuthority: baseRequisites.NameOfRegistrationAuthority || data.RegistrationAuthority || data.RegAuthority,
				status: baseRequisites.State || data.State,
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
						protocol: 3, // Согласно документации пункта 13
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
				protocol: 3, // Согласно документации пункта 13
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
				// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
				// https://saby.ru/help/integration/api/all_methods/format
				const response = await axios.post(
					SBIS_SERVICES.mainSrv, // URL с ?srv=1 для ЭДО
					{
						jsonrpc: '2.0',
						method: m.method,
						params: m.params,
						protocol: 2, // ВАЖНО: для ЭДО методов нужен protocol: 2
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
							Host: 'online.sbis.ru',
							Accept: 'application/json-rpc',
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

		// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
		// https://saby.ru/help/integration/api/all_methods/format
		const response = await axios.post(
			SBIS_SERVICES.mainSrv, // Используем URL с ?srv=1 для ЭДО
			{
				jsonrpc: '2.0',
				method: 'СБИС.ЗаписатьДокумент',
				params: {
					Документ: document,
				},
				protocol: 2, // ВАЖНО: для ЭДО методов нужен protocol: 2
				id: Date.now(),
			},
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISSessionID': sessionId,
					Host: 'online.sbis.ru',
					Accept: 'application/json-rpc',
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

				// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
				// https://saby.ru/help/integration/api/all_methods/format
				const response = await axios.post(
					SBIS_SERVICES.mainSrv, // URL с ?srv=1 для ЭДО
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
							Host: 'online.sbis.ru',
							Accept: 'application/json-rpc',
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
						protocol: 3, // Согласно документации пункта 13
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
		// Если нет online сессии, пробуем сервисную авторизацию
		if (!sessionId) {
			console.log('⚠️ Online сессия отсутствует, пробуем сервисную авторизацию...')
			try {
				const secretKey = `user_${userKey}_${Date.now()}`
				const serviceAuthMethods = [
					{
						url: 'https://online.sbis.ru/oauth/service/',
						method: 'OAuth.Authorize',
						params: {
							app_client_id: SBIS_APP_CLIENT_ID,
							app_secret: SBIS_APP_SECRET,
							secret_key: secretKey,
						},
					},
					{
						url: 'https://online.sbis.ru/auth/service/',
						method: 'САП.Авторизоваться',
						params: {
							Приложение: SBIS_APP_CLIENT_ID,
							Секрет: SBIS_APP_SECRET,
							СекретныйКлюч: secretKey,
						},
					},
				]

				for (const authMethod of serviceAuthMethods) {
					try {
						const serviceResponse = await axios.post(
							authMethod.url,
							{
								jsonrpc: '2.0',
								method: authMethod.method,
								params: authMethod.params,
								id: Date.now(),
							},
							{
								headers: {
									'Content-Type': 'application/json-rpc; charset=utf-8',
								},
								timeout: 30000,
							}
						)

						const result =
							serviceResponse.data.result ||
							serviceResponse.data.access_token ||
							serviceResponse.data.sid ||
							serviceResponse.data.token

						if (result) {
							const token = typeof result === 'string' ? result : result.sid || result.token
							if (token) {
								sessionId = token
								oauthTokens.set(userKey, token)
								userSessions.set(userKey, token)
								console.log('✅ Сервисная авторизация успешна в диагностике!')
								break
							}
						}
					} catch (e) {
						console.log(`⚠️ Сервисная авторизация (${authMethod.method}) не удалась:`, e.message)
					}
				}
			} catch (e) {
				console.log('⚠️ Ошибка при попытке сервисной авторизации в диагностике:', e.message)
			}
		}

		// Проверяем, работает ли обычная сессия для ЭДО методов
		// Если нет - пробуем получить OAuth токен
		// ВАЖНО: Объявляем oauthToken ДО использования
		let oauthToken = oauthTokens.get(userKey)

		if (!sessionId) {
			results.recommendations.push('⚠️ Online SBIS (ЭДО) не авторизован')
			results.recommendations.push('💡 Попробуйте использовать сервисную авторизацию через /auth-service')
		} else {
			// Получаем официальный список доступных методов через СБИС.СписокМетодов
			try {
				console.log('📋 Запрашиваем СБИС.СписокМетодов...')
				// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
				const methodsListResponse = await axios.post(
					SBIS_SERVICES.mainSrv, // URL с ?srv=1 для ЭДО
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
						validateStatus: () => true, // Не выбрасывать ошибку при 404
					}
				)

				// Если получили 404 - пробуем OAuth токен
				if ((methodsListResponse.status === 404 || (methodsListResponse.data.error && methodsListResponse.data.error.code === 404)) && !oauthToken) {
					console.log('⚠️ СБИС.СписокМетодов вернул 404, пробуем OAuth...')
					// OAuth токен будет получен в следующем блоке кода
				}

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
		if (sessionId && !oauthToken) {
			// Пробуем простой метод, чтобы проверить, работает ли сессия
			try {
				// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
				const testResponse = await axios.post(
					SBIS_SERVICES.mainSrv, // URL с ?srv=1 для ЭДО
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
						timeout: 5000,
						validateStatus: () => true, // Не выбрасывать ошибку при 404
					}
				)

				// Если получили 404 - сессия не работает для ЭДО, нужен OAuth
				if (testResponse.status === 404 || (testResponse.data.error && testResponse.data.error.code === 404)) {
					console.log('⚠️ Обычная сессия не работает для ЭДО, пробуем OAuth...')
					try {
						const secretKey = `user_${userKey}_${Date.now()}`
						const serviceAuthMethods = [
							// Метод 1: OAuth.Authorize с secret_key (для открытых приложений)
							{
								url: 'https://online.sbis.ru/oauth/service/',
								method: 'OAuth.Authorize',
								params: {
									app_client_id: SBIS_APP_CLIENT_ID,
									app_secret: SBIS_APP_SECRET,
									secret_key: secretKey,
								},
							},
							// Метод 2: САП.Авторизоваться (альтернативный)
							{
								url: 'https://online.sbis.ru/auth/service/',
								method: 'САП.Авторизоваться',
								params: {
									Приложение: SBIS_APP_CLIENT_ID,
									Секрет: SBIS_APP_SECRET,
									СекретныйКлюч: secretKey,
								},
							},
							// Метод 3: OAuth.Authorize без secret_key (для закрытых приложений)
							{
								url: 'https://online.sbis.ru/oauth/service/',
								method: 'OAuth.Authorize',
								params: {
									app_client_id: SBIS_APP_CLIENT_ID,
									app_secret: SBIS_APP_SECRET,
								},
							},
							// Метод 4: СБИС.Аутентифицировать с приложением
							{
								url: 'https://online.sbis.ru/auth/service/',
								method: 'СБИС.Аутентифицировать',
								params: {
									Параметр: {
										Приложение: SBIS_APP_CLIENT_ID,
										Секрет: SBIS_APP_SECRET,
									},
								},
							},
							// Метод 5: Прямой запрос с app_client_id и app_secret в параметрах
							{
								url: 'https://online.sbis.ru/oauth/service/',
								method: 'OAuth.GetToken',
								params: {
									app_client_id: SBIS_APP_CLIENT_ID,
									app_secret: SBIS_APP_SECRET,
									secret_key: secretKey,
								},
							},
						]

						for (const authMethod of serviceAuthMethods) {
							try {
								const serviceResponse = await axios.post(
									authMethod.url,
									{
										jsonrpc: '2.0',
										method: authMethod.method,
										params: authMethod.params,
										id: Date.now(),
									},
									{
										headers: {
											'Content-Type': 'application/json-rpc; charset=utf-8',
										},
										timeout: 30000,
									}
								)

								const result =
									serviceResponse.data.result ||
									serviceResponse.data.access_token ||
									serviceResponse.data.sid ||
									serviceResponse.data.token

								if (result) {
									oauthToken = typeof result === 'string' ? result : result.sid || result.token
									if (oauthToken) {
										oauthTokens.set(userKey, oauthToken)
										// Используем OAuth токен вместо обычной сессии для ЭДО
										sessionId = oauthToken
										userSessions.set(userKey, oauthToken)
										console.log('✅ OAuth токен получен и будет использован для ЭДО методов')
										break
									}
								}
							} catch (e) {
								console.log(`⚠️ OAuth метод ${authMethod.method} не сработал:`, e.message)
								if (e.response?.data) {
									console.log(`   Детали ошибки:`, JSON.stringify(e.response.data))
								}
								if (e.response?.status) {
									console.log(`   HTTP статус:`, e.response.status)
								}
							}
						}
					} catch (e) {
						console.log('⚠️ Ошибка при получении OAuth токена:', e.message)
					}
				}
			} catch (e) {
				console.log('⚠️ Ошибка при проверке сессии:', e.message)
			}
		}

		// Используем OAuth токен, если он есть, иначе обычную сессию
		// ВАЖНО: Для открытых приложений OAuth может быть недоступен,
		// но обычная сессия может работать для ЭДО, если подключен тариф
		const effectiveSessionId = oauthToken || sessionId
		
		// Если OAuth не сработал, но есть обычная сессия - пробуем использовать её
		// Возможно, для работы с ЭДО достаточно обычной авторизации, если подключен тариф
		if (!oauthToken && sessionId) {
			console.log('ℹ️ OAuth недоступен, используем обычную сессию для проверки ЭДО методов')
		}

		// 1. Получаем информацию о пользователе (только если есть Online сессия)
		let methodsTestedCount = 0
		if (effectiveSessionId) {
			try {
				// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
				const userInfoResponse = await axios.post(
					SBIS_SERVICES.mainSrv, // URL с ?srv=1 для ЭДО
					{
						jsonrpc: '2.0',
						method: 'СБИС.ИнформацияОПользователе',
						params: {},
						protocol: 2, // ВАЖНО: для ЭДО методов нужен protocol: 2
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': effectiveSessionId,
							Host: 'online.sbis.ru',
							Accept: 'application/json-rpc',
						},
						timeout: 10000,
						validateStatus: () => true,
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
			// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
			const orgResponse = await axios.post(
				SBIS_SERVICES.mainSrv, // URL с ?srv=1 для ЭДО
				{
					jsonrpc: '2.0',
					method: 'СБИС.ТекущаяОрганизация',
					params: {},
					protocol: 2, // ВАЖНО: для ЭДО методов нужен protocol: 2
					id: Date.now(),
				},
				{
					headers: {
						'Content-Type': 'application/json-rpc; charset=utf-8',
						'X-SBISSessionID': effectiveSessionId,
						Host: 'online.sbis.ru',
						Accept: 'application/json-rpc',
					},
					timeout: 10000,
					validateStatus: () => true,
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

			// 3. Тестируем основные API методы для разных сервисов (только через Online API)
		const methodsToTest = [
			// API ЭДО (электронный документооборот)
			// Пробуем разные варианты имен методов и параметров согласно документации
			{
				method: 'СБИС.СписокКонтрагентов',
				params: { Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокКонтрагентов',
				params: {}, // Без параметров
				service: 'ЭДО',
			},
			{
				method: 'Контрагент.Список',
				params: {}, // Без параметров
				service: 'ЭДО',
			},
			{
				method: 'Контрагент.Список',
				params: { Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'Контрагент.Список',
				params: { Фильтр: {}, Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументов',
				params: {}, // Без параметров
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументов',
				params: { Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументов',
				params: { Фильтр: {}, Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументовПоСобытиям',
				params: {}, // Без параметров
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументовПоСобытиям',
				params: { Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},
			{
				method: 'СБИС.СписокДокументовПоСобытиям',
				params: { Фильтр: {}, Навигация: { Количество: 1 } },
				service: 'ЭДО',
			},

				// API Все о компаниях через Online API (только если SPP недоступен)
				// Если SPP доступен, эти методы не проверяем, так как они работают через SPP
				...(results.sppAvailable ? [] : [
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
				]),

				// API Бухгалтерия (работает через ЭДО)
				// Для работы с бухгалтерскими документами используются методы ЭДО
				// Проверяем доступность через реестр счетов на оплату
			{
					method: 'СБИС.СписокРеестра',
					params: { ИмяРеестра: 'СчетНаОплату', Навигация: { Количество: 1 } },
				service: 'Бухгалтерия',
			},
				// Альтернативный метод для проверки бухгалтерских документов
			{
					method: 'СБИС.СписокДокументов',
					params: { 
						Фильтр: { ТипДокумента: 'СчетНаОплату' },
						Навигация: { Количество: 1 } 
					},
				service: 'Бухгалтерия',
			},

			// Альтернативные методы
			{ method: 'Контрагент.Список', params: {}, service: 'Альтернативный' },
			{ method: 'Документ.Список', params: {}, service: 'Альтернативный' },
		]

			methodsTestedCount = methodsToTest.length
		for (const test of methodsToTest) {
			try {
				// Для методов ЭДО пробуем разные форматы запроса
				// Сначала пробуем с protocol: 2, потом без него
				const requestBodies = [
					{
						jsonrpc: '2.0',
						method: test.method,
						params: test.params,
						protocol: 2, // ВАЖНО: для ЭДО методов нужен protocol: 2
						id: Date.now(),
					},
					{
						jsonrpc: '2.0',
						method: test.method,
						params: test.params,
						// Без protocol для некоторых методов
						id: Date.now(),
					},
				]

				const headers = {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISSessionID': effectiveSessionId,
					Host: 'online.sbis.ru',
					Accept: 'application/json-rpc',
				}

				console.log(`📋 Тестируем ${test.method} [${test.service}]...`)
				// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
				// https://saby.ru/help/integration/api/all_methods/format
				const edoUrl = test.service === 'ЭДО' || test.service === 'Бухгалтерия' 
					? SBIS_SERVICES.mainSrv  // URL с ?srv=1 для ЭДО
					: SBIS_API_URL
				
				let response = null
				let lastError = null
				
				// Пробуем оба варианта запроса (с protocol: 2 и без)
				for (const requestBody of requestBodies) {
					try {
						response = await axios.post(
							edoUrl,
							requestBody,
							{
								headers,
								timeout: 10000,
								validateStatus: () => true, // Не выбрасывать ошибку при любом статусе
							}
						)
						
						// Если получили результат или ошибку не -32601 (метод не найден), используем этот вариант
						if (response.data.result || (response.data.error && response.data.error.code !== -32601)) {
							break
						}
						lastError = response.data.error
					} catch (err) {
						lastError = err.response?.data?.error || err
						continue
					}
				}
				
				if (!response) {
					throw new Error('Не удалось выполнить запрос')
				}

				// Логируем детали ответа для отладки
				if (response.data.error) {
					const code = response.data.error.code
					const message = response.data.error.message || response.data.error.details
					
					// Если метод не найден (-32601), пробуем следующий вариант
					if (code === -32601) {
						console.log(`⚠️ ${test.method} [${test.service}] - метод не найден, пробуем альтернативные варианты...`)
						// Не добавляем в unavailable, так как можем найти рабочий вариант
						continue
					}
					
					// Для ошибки -32602 (Invalid params) логируем детали
					if (code === -32602) {
						console.log(`❌ ${test.method} [${test.service}] - ошибка ${code}: ${message}`)
						console.log(`   Параметры запроса:`, JSON.stringify(test.params))
						console.log(`   Полный ответ ошибки:`, JSON.stringify(response.data.error).substring(0, 500))
						// Продолжаем пробовать другие варианты параметров
						continue
					}
					
					console.log(`❌ ${test.method} [${test.service}] - ошибка ${code}: ${message}`)
					
					// Если это ошибка доступа или авторизации, но не "метод не найден" - возможно, проблема с правами
					if (code !== -32601 && code !== 404 && code !== -32602) {
						console.log(`   Возможно, проблема с правами доступа или форматом запроса`)
					}
					
					results.unavailableMethods.push(`${test.method} (${test.service}): ${message}`)
				} else if (response.data.result) {
					console.log(`✅ ${test.method} [${test.service}] - работает!`)
					results.availableMethods.push(`${test.method} (${test.service})`)
					// Если метод работает, не пробуем другие варианты
					break
				} else {
					console.log(`⚠️ ${test.method} [${test.service}] - неожиданный ответ`)
					results.unavailableMethods.push(`${test.method} (${test.service}): неожиданный ответ`)
				}
			} catch (error) {
				console.log(`❌ ${test.method} [${test.service}] - исключение:`, error.message)
				if (error.response?.data) {
					console.log(`   Детали:`, JSON.stringify(error.response.data).substring(0, 200))
				}
				// При исключении пробуем следующий вариант метода
				continue
			}
		}
		} else {
			// Если нет Online сессии, но есть SPP - добавляем методы "Все о компаниях" как недоступные через Online API
			// Но они доступны через SPP, так что не добавляем их в недоступные
			if (!results.sppAvailable) {
				results.unavailableMethods.push('СБИС.ПоискКонтрагента (Все о компаниях)')
				results.unavailableMethods.push('СБИС.РеквизитыКонтрагента (Все о компаниях)')
			}
		}

		// 4. Формируем рекомендации на основе результатов
		const hasEDO = results.availableMethods.some(m => m.includes('ЭДО'))
		const hasCompanyInfo =
			results.sppAvailable ||
			results.availableMethods.some(m => m.includes('Все о компаниях'))
		// API Бухгалтерия работает через ЭДО, поэтому проверяем доступность методов Бухгалтерии
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
			// API Бухгалтерия работает через ЭДО, поэтому если ЭДО недоступен, то и Бухгалтерия недоступна
			if (!hasAccounting) {
				results.recommendations.push(
					'📊 API Бухгалтерия недоступен (работает через ЭДО) - для работы с бухгалтерскими документами требуется тариф ЭДО'
				)
			}
		} else if (hasAccounting) {
			results.recommendations.push(
				'✅ API Бухгалтерия доступен - работа с бухгалтерскими документами возможна'
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
		// Фильтруем недоступные методы - убираем методы "Все о компаниях", если SPP доступен
		const filteredUnavailable = results.unavailableMethods.filter(method => {
			// Если SPP доступен, не показываем методы "Все о компаниях" как недоступные
			if (results.sppAvailable && method.includes('Все о компаниях')) {
				return false
			}
			return true
		})

		results.summary = {
			totalTested:
				(sessionId ? methodsTestedCount + 3 : 0) + (sppSession ? 2 : 0),
			available: results.availableMethods.length,
			unavailable: filteredUnavailable.length,
			sppAvailable: results.sppAvailable,
			hasEDO,
			hasCompanyInfo,
			hasAccounting,
		}

		// Обновляем список недоступных методов (без методов "Все о компаниях", если SPP работает)
		results.unavailableMethods = filteredUnavailable

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
				// ВАЖНО: Для методов ЭДО используем URL с ?srv=1 согласно документации
				const response = await axios.post(
					SBIS_SERVICES.mainSrv, // URL с ?srv=1 для ЭДО
					{
						jsonrpc: '2.0',
						method: m.method,
						params: m.params,
						protocol: 2, // ВАЖНО: для ЭДО методов нужен protocol: 2
						id: Date.now(),
					},
					{
						headers: {
							'Content-Type': 'application/json-rpc; charset=utf-8',
							'X-SBISSessionID': sessionId,
							Host: 'online.sbis.ru',
							Accept: 'application/json-rpc',
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

/**
 * Извлечь текст из JsonML структуры
 * @param {Array} jsonML - JsonML массив
 * @returns {string} Текст
 */
function extractTextFromJsonML(jsonML) {
	if (typeof jsonML === 'string') {
		return jsonML;
	}
	if (Array.isArray(jsonML)) {
		return jsonML
			.filter(item => typeof item === 'string')
			.join(' ');
	}
	return '';
}

/**
 * Получить ID сотрудника-передатчика (если указано ФИО, получить ID из SBIS)
 * @param {string} oauthToken - OAuth токен для доступа к SBIS API
 * @param {string} departmentName - Название подразделения (опционально)
 * @returns {Promise<string>} ID сотрудника-передатчика
 */
async function resolveMessengerStaffId(oauthToken, departmentName = null) {
	if (!SBIS_MESSENGER_STAFF_ID_RAW || SBIS_MESSENGER_STAFF_ID_RESOLVED) {
		return SBIS_MESSENGER_STAFF_ID
	}
	
	// Если это уже числовой ID, используем его и пытаемся получить UUID
	if (/^\d+$/.test(SBIS_MESSENGER_STAFF_ID_RAW.trim())) {
		const numericId = SBIS_MESSENGER_STAFF_ID_RAW.trim()
		SBIS_MESSENGER_STAFF_ID = numericId
		SBIS_MESSENGER_STAFF_ID_RESOLVED = true
		
		// Пытаемся получить UUID сотрудника по числовому ID
		const uuid = await getStaffUuidByNumericId(numericId, oauthToken, departmentName)
		if (uuid) {
			// Сохраняем UUID для сравнения с senderID в сообщениях
			staffUuidCache.set(numericId, uuid)
			console.log(`[SBIS Messenger] ✅ UUID сотрудника-передатчика получен: ${uuid} (числовой ID: ${numericId})`)
		} else {
			console.warn(`[SBIS Messenger] ⚠️ Не удалось получить UUID для числового ID ${numericId}. Будет использоваться числовой ID для сравнения.`)
		}
		
		return SBIS_MESSENGER_STAFF_ID
	}
	
	// Если это ФИО, получаем ID из SBIS
	console.log(`[SBIS Messenger] Получение ID сотрудника-передатчика по ФИО: ${SBIS_MESSENGER_STAFF_ID_RAW}`)
	const parsedName = parseFullName(SBIS_MESSENGER_STAFF_ID_RAW)
	if (parsedName) {
		const staffWithId = await getStaffIdByFullName(parsedName, oauthToken, departmentName)
		if (staffWithId && staffWithId.Идентификатор) {
			SBIS_MESSENGER_STAFF_ID = staffWithId.Идентификатор.toString()
			SBIS_MESSENGER_STAFF_ID_RESOLVED = true
			console.log(`[SBIS Messenger] ✅ ID сотрудника-передатчика получен: ${SBIS_MESSENGER_STAFF_ID} (${staffWithId.Фамилия} ${staffWithId.Имя} ${staffWithId.Отчество})`)
			return SBIS_MESSENGER_STAFF_ID
		} else {
			console.warn(`[SBIS Messenger] ⚠️ Сотрудник-передатчик не найден в SBIS: ${SBIS_MESSENGER_STAFF_ID_RAW}`)
		}
	}
	
	return SBIS_MESSENGER_STAFF_ID_RAW // Возвращаем исходное значение, если не удалось получить ID
}

/**
 * Получить сообщения из SBIS по документу (задаче)
 * Использует метод DocumentMessage.List (пункт 17)
 * 
 * ВАЖНО: Используется ID документа (documentId = sbis_task_id) для правильной маршрутизации сообщений.
 * Это гарантирует, что сообщения из разных задач не смешиваются.
 * 
 * Логика определения типа сообщения:
 * - Если сообщение от сотрудника-передатчика (SBIS_MESSENGER_STAFF_ID) - это сообщение от инженера
 * - Если senderId не совпадает с client_id - это тоже сообщение от инженера
 * - Иначе - сообщение от клиента
 * 
 * @param {string} documentId - Идентификатор документа в SBIS (sbis_task_id)
 * @param {string} userId - ID пользователя для получения OAuth токена
 * @returns {Promise<Array>} Массив сообщений из SBIS с флагом isFromEngineer
 */
async function getSBISMessages(documentId, userId = 'default') {
	try {
		console.log(`[SBIS Messages] Получение сообщений для документа ${documentId}`)
		if (SBIS_MESSENGER_STAFF_ID) {
			console.log(`[SBIS Messages] Используется сотрудник-передатчик с ID: ${SBIS_MESSENGER_STAFF_ID}`)
		}
		
		// Получаем или создаем OAuth токен
		let oauthToken = oauthTokens.get(userId)
		
		if (!oauthToken) {
			console.log('OAuth токен не найден, выполняем авторизацию...')
			const requestBody = {
				app_client_id: SBIS_APP_CLIENT_ID,
				app_secret: SBIS_APP_SECRET,
				secret_key: SBIS_SECRET_KEY,
			}

			const authResponse = await axios.post(SBIS_OAUTH_URL, requestBody, {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
				},
				timeout: 30000,
			})

			if (authResponse.data && authResponse.data.token) {
				oauthToken = authResponse.data.token
				oauthTokens.set(userId, oauthToken)
				console.log('✅ OAuth токен получен для получения сообщений')
			} else {
				throw new Error('Не удалось получить OAuth токен для получения сообщений')
			}
		}
		
		// Получаем ID сотрудника-передатчика (если указано ФИО, получаем ID из SBIS)
		await resolveMessengerStaffId(oauthToken, SBIS_DEPARTMENT_NAME || SBIS_DEPARTMENT_ID)
		if (SBIS_MESSENGER_STAFF_ID) {
			console.log(`[SBIS Messages] Используется сотрудник-передатчик с ID: ${SBIS_MESSENGER_STAFF_ID}`)
		}
		
		// Получаем ID сотрудника-передатчика (если указано ФИО, получаем ID из SBIS)
		await resolveMessengerStaffId(oauthToken, SBIS_DEPARTMENT_NAME || SBIS_DEPARTMENT_ID)
		if (SBIS_MESSENGER_STAFF_ID) {
			console.log(`[SBIS Messages] Используется сотрудник-передатчик с ID: ${SBIS_MESSENGER_STAFF_ID}`)
		}

		// Формируем запрос согласно документации пункта 17
		const requestBody = {
			jsonrpc: '2.0',
			protocol: 6,
			method: 'DocumentMessage.List',
			params: {
				Filter: {
					d: [documentId, null, null, 'asc'], // document, fromDateTime, toDateTime, order
					s: [
						{ t: 'UUID', n: 'document' },
						{ t: 'Дата и время', n: 'fromDateTime' },
						{ t: 'Дата и время', n: 'toDateTime' },
						{ t: 'Строка', n: 'order' }
					],
					_type: 'record'
				},
				Sorting: null,
				Pagination: {
					d: [100, 0], // РазмерСтраницы, Страница
					s: [
						{ t: 'Число целое', n: 'РазмерСтраницы' },
						{ t: 'Число целое', n: 'Страница' }
					],
					_type: 'record'
				},
				ExtraFields: ['model']
			},
			id: Date.now()
		}

		console.log('[SBIS Messages] Запрос:', JSON.stringify(requestBody, null, 2))

		// Отправляем запрос в SBIS
		// Согласно документации пункта 17, адрес запроса: https://online.sbis.ru/service/?srv=1
		const response = await axios.post(
			SBIS_SERVICES.edo, // https://online.sbis.ru/service/?srv=1
			requestBody,
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISAccessToken': oauthToken,
				},
				timeout: 30000,
			}
		)

		console.log('[SBIS Messages] Ответ:', JSON.stringify(response.data, null, 2))

		if (response.data.error) {
			console.error('❌ SBIS Messages Error:', response.data.error)
			throw new Error(response.data.error.message || 'Ошибка получения сообщений из SBIS')
		}

		// Парсим ответ согласно документации пункта 17
		// Ответ содержит массив сообщений в формате, описанном в пункте 17
		// Структура ответа: result содержит массив объектов с полями: theme, message, datetime, model
		if (response.data.result) {
			let messages = [];
			
			// Проверяем, является ли result массивом
			if (Array.isArray(response.data.result)) {
				messages = response.data.result;
			} else if (response.data.result.d && Array.isArray(response.data.result.d)) {
				// Если ответ в формате с полем d (данные)
				messages = response.data.result.d;
			} else if (typeof response.data.result === 'object') {
				// Если result - объект, пытаемся найти массив сообщений
				messages = response.data.result.messages || response.data.result.items || [];
			}
			
			const parsedMessages = messages.map((msg, index) => {
				// Структура ответа: [theme, message, datetime, extchannel, model]
				// msg[0] = theme (dialogID)
				// msg[1] = message (messageID)
				// msg[2] = datetime
				// msg[3] = extchannel
				// msg[4] = model (объект с полями d и s)
				
				const theme = Array.isArray(msg) ? msg[0] : (msg.theme || msg.dialogID);
				const messageId = Array.isArray(msg) ? msg[1] : (msg.message || msg.uuid || msg.messageID);
				const datetime = Array.isArray(msg) ? msg[2] : (msg.datetime || msg.dateSend);
				const model = Array.isArray(msg) ? msg[4] : (msg.model || {});
				
				// model - это объект с полями d (массив данных) и s (массив схем)
				// Согласно схеме, senderID находится в model.d[7]
				// Структура model.d:
				// [0] uuid, [1] dialogID, [2] treeMessageText, [3] serviceObject,
				// [4] timestamp, [5] typeMsg, [6] subscriptionState, [7] senderID, ...
				const modelData = model.d || [];
				const modelSchema = model.s || [];
				
				// Находим индекс senderID в схеме
				let senderIdIndex = -1;
				for (let i = 0; i < modelSchema.length; i++) {
					if (modelSchema[i].n === 'senderID') {
						senderIdIndex = i;
						break;
					}
				}
				
				// Извлекаем senderID из массива данных
				// Сначала пробуем найти по схеме, затем используем индекс 7 напрямую (согласно документации)
				let senderId = null;
				if (senderIdIndex >= 0) {
					senderId = modelData[senderIdIndex];
					if (!senderId && modelData.length > senderIdIndex) {
						console.warn(`[SBIS Messages] ⚠️ senderID по индексу ${senderIdIndex} пустой, значение: ${modelData[senderIdIndex]}`);
					}
				}
				
				// Fallback: используем индекс 7 напрямую, если не нашли по схеме или значение пустое
				if (!senderId && modelData.length > 7) {
					senderId = modelData[7];
					if (senderId) {
						console.log(`[SBIS Messages] ✅ senderID найден по индексу 7 (fallback): ${senderId}`);
					} else {
						console.warn(`[SBIS Messages] ⚠️ senderID по индексу 7 тоже пустой: ${modelData[7]}`);
					}
				}
				
				if (!senderId) {
					console.warn(`[SBIS Messages] ❌ senderID не найден: senderIdIndex=${senderIdIndex}, modelData.length=${modelData.length}, modelData[7]=${modelData[7] || 'null'}`);
					// Выводим первые 10 элементов для отладки
					console.warn(`[SBIS Messages] Первые элементы modelData:`, modelData.slice(0, 10).map((v, i) => `[${i}]=${v}`).join(', '));
				}
				
				// Извлекаем текст из treeMessageText (model.d[2])
				let text = '';
				const textIndex = modelSchema.findIndex(s => s.n === 'treeMessageText');
				if (textIndex >= 0 && modelData[textIndex]) {
					const textModel = modelData[textIndex];
					if (typeof textModel === 'string') {
						text = textModel;
					} else if (Array.isArray(textModel)) {
						// Если text_model - массив (JsonML), извлекаем текст
						text = extractTextFromJsonML(textModel);
					}
				} else if (modelData.length > 2 && modelData[2]) {
					// Fallback: используем индекс 2 напрямую
					const textModel = modelData[2];
					if (typeof textModel === 'string') {
						text = textModel;
					} else if (Array.isArray(textModel)) {
						text = extractTextFromJsonML(textModel);
					}
				}
				
				// Извлекаем dateSend (model.d[8])
				const dateSendIndex = modelSchema.findIndex(s => s.n === 'dateSend');
				let dateSend = datetime;
				if (dateSendIndex >= 0 && modelData[dateSendIndex]) {
					dateSend = modelData[dateSendIndex];
				} else if (modelData.length > 8 && modelData[8]) {
					// Fallback: используем индекс 8 напрямую
					dateSend = modelData[8];
				}

				// Извлекаем serviceObject (model.d[3]) — метаданные сообщения (пункт 17)
				let serviceObject = null;
				const serviceObjectIndex = modelSchema.findIndex(s => s.n === 'serviceObject');
				if (serviceObjectIndex >= 0 && modelData[serviceObjectIndex]) {
					serviceObject = modelData[serviceObjectIndex];
				} else if (modelData.length > 3 && modelData[3]) {
					serviceObject = modelData[3];
				}
				
				console.log(
					`[SBIS Messages] Сообщение ${index + 1}: senderId=${senderId}, передатчик ID=${SBIS_MESSENGER_STAFF_ID}, ` +
					`text="${text.substring(0, 30)}...", modelData.length=${modelData.length}, ` +
					`source=${serviceObject?.source || 'нет'}`
				)
				
				// ВАЖНО: senderID в SBIS - это UUID пользователя, а SBIS_MESSENGER_STAFF_ID может быть числовым ID
				// Нужно получить UUID сотрудника-передатчика для сравнения
				let isFromMessenger = false
				if (SBIS_MESSENGER_STAFF_ID && senderId) {
					const senderIdStr = senderId.toString()
					const messengerIdStr = SBIS_MESSENGER_STAFF_ID.toString()
					
					// Прямое сравнение (если оба UUID или оба числа)
					if (senderIdStr === messengerIdStr) {
						isFromMessenger = true
						console.log(`[SBIS Messages] ✅ Сообщение от сотрудника-передатчика (прямое совпадение: ${senderIdStr})`)
					} else {
						// Если не совпадают напрямую, проверяем кэш UUID
						// Если SBIS_MESSENGER_STAFF_ID - число, ищем его UUID в кэше
						if (/^\d+$/.test(messengerIdStr)) {
							const cachedUuid = staffUuidCache.get(messengerIdStr)
							if (cachedUuid && cachedUuid === senderIdStr) {
								isFromMessenger = true
								console.log(`[SBIS Messages] ✅ Сообщение от сотрудника-передатчика (UUID из кэша: ${senderIdStr})`)
							} else {
								console.log(`[SBIS Messages] Сравнение: senderId=${senderIdStr} (UUID), messengerId=${messengerIdStr} (число), cachedUuid=${cachedUuid || 'нет'}`)
							}
						} else {
							console.log(`[SBIS Messages] Сравнение: senderId=${senderIdStr}, messengerId=${messengerIdStr} - не совпадают`)
						}
					}
				}
				
				return {
					messageId: messageId,
					dialogId: theme,
					text: text,
					senderId: senderId,
					isFromEngineer: isFromMessenger, // Флаг: сообщение от инженера через передатчика
					isFromMobileClient: serviceObject && serviceObject.source === 'mobile_client',
					dateSend: dateSend,
					files: []
				}
			})
			
			console.log(`[SBIS Messages] Получено ${parsedMessages.length} сообщений`)
			return parsedMessages
		}

		return []
	} catch (error) {
		console.error('❌ Ошибка получения сообщений из SBIS:', error.response?.data || error.message)
		throw error
	}
}

/**
 * Отправить сообщение в SBIS по документу (задаче)
 * Использует метод PublicMsgApi.MessageSend (пункт 16)
 * 
 * ВАЖНО: Используется ID документа (documentId = sbis_task_id) для правильной маршрутизации сообщений.
 * Это гарантирует, что сообщения отправляются в правильную задачу и не смешиваются между разными задачами.
 * 
 * Когда клиент отправляет сообщение:
 * - Сообщение отправляется в задачу SBIS по documentId
 * - Инженер видит сообщение в чате задачи SBIS
 * - Инженер может ответить, выбрав сотрудника-передатчика (SBIS_MESSENGER_STAFF_ID)
 * - Сообщение от сотрудника-передатчика будет определено как сообщение от инженера
 * 
 * @param {string} dialogId - Идентификатор диалога в SBIS (может быть null, SBIS создаст новый)
 * @param {string} documentId - Идентификатор документа в SBIS (sbis_task_id) - ОБЯЗАТЕЛЬНО для правильной маршрутизации
 * @param {string} text - Текст сообщения
 * @param {string} userId - ID пользователя для получения OAuth токена
 * @returns {Promise<Object>} Результат отправки сообщения (messageId, dialogId, sendStatus)
 */
async function sendSBISMessage(dialogId, documentId, text, userId = 'default', meta = {}) {
	try {
		console.log(`[SBIS Message] Отправка сообщения в диалог ${dialogId}, документ ${documentId}`)
		
		// Получаем или создаем OAuth токен
		let oauthToken = oauthTokens.get(userId)
		
		if (!oauthToken) {
			console.log('OAuth токен не найден, выполняем авторизацию...')
			const requestBody = {
				app_client_id: SBIS_APP_CLIENT_ID,
				app_secret: SBIS_APP_SECRET,
				secret_key: SBIS_SECRET_KEY,
			}

			const authResponse = await axios.post(SBIS_OAUTH_URL, requestBody, {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
				},
				timeout: 30000,
			})

			if (authResponse.data && authResponse.data.token) {
				oauthToken = authResponse.data.token
				oauthTokens.set(userId, oauthToken)
				console.log('✅ OAuth токен получен для отправки сообщения')
			} else {
				throw new Error('Не удалось получить OAuth токен для отправки сообщения')
			}
		}
		
		// Получаем ID сотрудника-передатчика (если указано ФИО, получаем ID из SBIS)
		await resolveMessengerStaffId(oauthToken, SBIS_DEPARTMENT_NAME || SBIS_DEPARTMENT_ID)

		// ВАЖНО: dialogID должен быть строкой UUID или null
		// Если dialogId пустой или невалидный, передаем null - SBIS создаст новый диалог
		const validDialogId = dialogId && typeof dialogId === 'string' && dialogId.trim().length > 0 
			? dialogId.trim() 
			: null;
		
		// Формируем ServiceObject согласно пункту 16: в него кладём метаданные,
		// по которым потом отличим сообщения клиента (из приложения) от сообщений инженера.
		const serviceObject = {
			source: 'mobile_client',
			...(meta.ticketId ? { ticketId: meta.ticketId } : {}),
			...(meta.clientId ? { clientId: meta.clientId } : {}),
		}

		const optionsRecord = {
			d: [
				null,        // Title
				0,           // TextFormat = 0 (обычный текст)
				serviceObject, // ServiceObject (JSON-объект)
			],
			s: [
				{ t: 'Строка', n: 'Title' },
				{ t: 'Число целое', n: 'TextFormat' },
				{ t: 'JSON-объект', n: 'ServiceObject' },
			],
			_type: 'record',
		}

		const requestBody = {
			jsonrpc: '2.0',
			protocol: 6,
			method: 'PublicMsgApi.MessageSend',
			params: {
				dialogID: validDialogId, // Если null, SBIS создаст новый диалог
				messageID: null,
				answer: null,
				text: text,
				document: documentId, // ОБЯЗАТЕЛЬНО: ID документа для правильной маршрутизации
				files: null,
				recipients: [], // Получатели определяются по документу
				options: optionsRecord
			},
			id: Date.now()
		}

		console.log(`[SBIS Message] Отправка: dialogID=${validDialogId}, document=${documentId}, text="${text.substring(0, 50)}..."`)
		console.log('[SBIS Message] Запрос:', JSON.stringify(requestBody, null, 2))

		// Отправляем запрос в SBIS
		const response = await axios.post(
			'https://online.sbis.ru/msg/service/', // Адрес для PublicMsgApi согласно пункту 16
			requestBody,
			{
				headers: {
					'Content-Type': 'application/json-rpc; charset=utf-8',
					'X-SBISAccessToken': oauthToken,
				},
				timeout: 30000,
			}
		)

		console.log('[SBIS Message] Ответ:', JSON.stringify(response.data, null, 2))

		if (response.data.error) {
			console.error('❌ SBIS Message Send Error:', response.data.error)
			throw new Error(response.data.error.message || 'Ошибка отправки сообщения в SBIS')
		}

		// Парсим ответ согласно документации пункта 16
		if (response.data.result && response.data.result.d) {
			const result = response.data.result.d
			return {
				success: true,
				messageId: result[0] || null, // messageID
				dialogId: result[1] || dialogId || null, // dialogID
				sendStatus: result[2] || null // sendStatus
			}
		}

		throw new Error('Неожиданный ответ от SBIS API')
	} catch (error) {
		console.error('❌ Ошибка отправки сообщения в SBIS:', error.response?.data || error.message)
		throw error
	}
}

// Экспортируем router и функции
router.createSBISTask = createSBISTask
// router.getSBISMessages = getSBISMessages // УДАЛЕНО: больше не используется
// router.sendSBISMessage = sendSBISMessage // УДАЛЕНО: больше не используется
module.exports = router
module.exports.createSBISTask = createSBISTask
// module.exports.getSBISMessages = getSBISMessages // УДАЛЕНО: больше не используется
// module.exports.sendSBISMessage = sendSBISMessage // УДАЛЕНО: больше не используется