/**
 * Простой тест CRM API с обычной авторизацией
 * Запуск: node backend/test-crm-simple.js
 */

const axios = require('axios')

const API_URL = 'http://localhost:3000/api/sbis-proxy'
const TEST_INN = '253812528630' // Ваш реальный ИНН из CRM
const SBIS_LOGIN = 'tenditnika'
const SBIS_PASSWORD = 'Tenditnik1!'

const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
}

const log = {
	success: msg => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
	error: msg => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
	info: msg => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
	warning: msg => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
	section: msg =>
		console.log(
			`\n${colors.cyan}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${
				colors.reset
			}\n`
		),
}

async function testCRM() {
	log.section('ТЕСТ CRM API (упрощенная авторизация)')

	try {
		// ========================================
		// Шаг 1: Авторизация в СБИС
		// ========================================
		log.section('Шаг 1: Авторизация в СБИС')

		log.info(`Авторизуемся как: ${SBIS_LOGIN}`)

		const authResponse = await axios.post(`${API_URL}/auth`, {
			login: SBIS_LOGIN,
			password: SBIS_PASSWORD,
			userId: 'test-user',
		})

		if (authResponse.data.success) {
			log.success('Авторизация успешна!')
			log.info(
				`Session ID: ${authResponse.data.sessionId?.substring(0, 30)}...`
			)
		} else {
			log.error('Авторизация не удалась')
			log.error(authResponse.data.error)
			return
		}

		// Небольшая пауза
		await new Promise(resolve => setTimeout(resolve, 1000))

		// ========================================
		// Шаг 2: Поиск клиента в CRM
		// ========================================
		log.section('Шаг 2: Поиск клиента в CRM')

		log.info(`Ищем клиента с ИНН: ${TEST_INN}`)

		const crmResponse = await axios.post(`${API_URL}/crm-client-oauth`, {
			inn: TEST_INN,
			userId: 'test-user',
			includeDeals: true,
			includeDocuments: true,
		})

		const result = crmResponse.data

		log.section('РЕЗУЛЬТАТЫ ПОИСКА')

		console.log('Статус:', result.success ? '✅ УСПЕШНО' : '❌ НЕ НАЙДЕН')
		console.log('Найден в CRM:', result.data?.found ? '✅ ДА' : '❌ НЕТ')
		console.log('')

		if (result.data?.found) {
			log.success('КЛИЕНТ НАЙДЕН В CRM!')
			console.log('')

			console.log('📋 КОНТРАГЕНТ:')
			console.log('─'.repeat(60))
			console.log('  Название:', result.data.contractor?.name || 'N/A')
			console.log('  ИНН:', result.data.contractor?.inn || 'N/A')
			console.log('  КПП:', result.data.contractor?.kpp || 'N/A')
			console.log('  ОГРН:', result.data.contractor?.ogrn || 'N/A')
			console.log('  Адрес:', result.data.contractor?.address || 'N/A')
			console.log('  Телефон:', result.data.contractor?.phone || 'N/A')
			console.log('  Email:', result.data.contractor?.email || 'N/A')
			console.log('  Руководитель:', result.data.contractor?.director || 'N/A')
			console.log('')

			console.log('💼 СДЕЛКИ:', result.data.deals?.length || 0)
			console.log('─'.repeat(60))
			if (result.data.deals?.length > 0) {
				result.data.deals.slice(0, 5).forEach((deal, i) => {
					console.log(`  ${i + 1}. ${deal.name || 'Без названия'}`)
					console.log(`     Сумма: ${deal.amount || 0} ₽`)
					console.log(`     Статус: ${deal.status || 'N/A'}`)
					console.log(`     Дата: ${deal.date || 'N/A'}`)
					if (deal.stage) console.log(`     Этап: ${deal.stage}`)
					console.log('')
				})
				if (result.data.deals.length > 5) {
					console.log(`  ... и еще ${result.data.deals.length - 5} сделок`)
				}
			} else {
				console.log('  Сделки не найдены')
			}
			console.log('')

			console.log('📄 ДОКУМЕНТЫ:', result.data.documents?.length || 0)
			console.log('─'.repeat(60))
			if (result.data.documents?.length > 0) {
				result.data.documents.slice(0, 5).forEach((doc, i) => {
					console.log(
						`  ${i + 1}. ${doc.type || 'Документ'} №${doc.number || 'N/A'}`
					)
					console.log(`     Дата: ${doc.date || 'N/A'}`)
					console.log(`     Сумма: ${doc.amount || 0} ₽`)
					console.log(`     Статус: ${doc.status || 'N/A'}`)
					console.log('')
				})
				if (result.data.documents.length > 5) {
					console.log(
						`  ... и еще ${result.data.documents.length - 5} документов`
					)
				}
			} else {
				console.log('  Документы не найдены')
			}
			console.log('')

			// Считаем общую сумму
			const totalDeals =
				result.data.deals?.reduce(
					(sum, d) => sum + (parseFloat(d.amount) || 0),
					0
				) || 0
			const totalDocs =
				result.data.documents?.reduce(
					(sum, d) => sum + (parseFloat(d.amount) || 0),
					0
				) || 0

			console.log('💰 ФИНАНСЫ:')
			console.log('─'.repeat(60))
			console.log(`  Сумма сделок: ${totalDeals.toLocaleString('ru-RU')} ₽`)
			console.log(`  Сумма документов: ${totalDocs.toLocaleString('ru-RU')} ₽`)
			console.log('')
		} else {
			log.warning('КЛИЕНТ НЕ НАЙДЕН В CRM')
			console.log('')
			console.log('Возможные причины:')
			console.log('  • Клиента нет в вашей CRM СБИС')
			console.log('  • Недостаточно прав доступа')
			console.log('  • ИНН указан неверно')
			console.log('')
		}

		if (result.data?.errors?.length > 0) {
			log.warning('ОШИБКИ ПРИ ПОИСКЕ:')
			console.log('─'.repeat(60))
			result.data.errors.slice(0, 10).forEach((err, i) => {
				console.log(`  ${i + 1}. ${err}`)
			})
			if (result.data.errors.length > 10) {
				console.log(`  ... и еще ${result.data.errors.length - 10} ошибок`)
			}
			console.log('')
		}

		log.section('ТЕСТ ЗАВЕРШЕН')
		log.success('Все проверки выполнены успешно!')
	} catch (error) {
		log.section('КРИТИЧЕСКАЯ ОШИБКА')

		if (error.response) {
			log.error(`HTTP ${error.response.status}: ${error.response.statusText}`)
			console.log('')
			console.log(
				'Ответ сервера:',
				JSON.stringify(error.response.data, null, 2)
			)
		} else if (error.request) {
			log.error('Нет ответа от сервера')
			console.log('')
			console.log('Проверьте:')
			console.log('  • Backend запущен: npm start (в папке backend)')
			console.log('  • Сервер доступен на http://localhost:3000')
		} else {
			log.error(error.message)
		}

		console.log('')
		process.exit(1)
	}
}

// Запуск
console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════════╗
║              ТЕСТИРОВАНИЕ CRM API СБИС                   ║
║         (упрощенная версия без OAuth)                     ║
║                                                           ║
║  Убедитесь что backend запущен на http://localhost:3000  ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`)

testCRM()
