import React, { useState, useEffect } from 'react'
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { api } from '../services/api'
import { SBIS_CONFIG, isSbisConfigured } from '../config/sbisConfig'
import colors from '../theme/colors'

/**
 * Экран диагностики СБИС API
 * Показывает какие методы API доступны для текущего аккаунта
 * Помогает понять какие тарифы подключены
 */
export default function SbisDiagnosticsScreen({ navigation }) {
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [diagnostics, setDiagnostics] = useState(null)
	const [error, setError] = useState(null)
	const [sbisConnected, setSbisConnected] = useState(false)
	const [authStatus, setAuthStatus] = useState('')

	useEffect(() => {
		connectAndDiagnose()
	}, [])

	// Автоматическое подключение к СБИС и диагностика
	const connectAndDiagnose = async () => {
		try {
			setLoading(true)
			setAuthStatus('Проверка подключения...')

			// 1. Проверяем статус
			const statusResponse = await api.get('/sbis-proxy/status')
			
			if (!statusResponse.data.connected) {
				// 2. Если не подключен - авторизуемся
				if (!isSbisConfigured()) {
					setAuthStatus('СБИС не настроен')
					setLoading(false)
					return
				}

				setAuthStatus('Авторизация в СБИС...')
				
				try {
					const authResponse = await api.post('/sbis-proxy/auth', {
						login: SBIS_CONFIG.login,
						password: SBIS_CONFIG.password,
					})

					if (authResponse.data.success) {
						setSbisConnected(true)
						setAuthStatus('Подключено! Запуск диагностики...')
					} else {
						setError(authResponse.data.error || 'Ошибка авторизации')
						setLoading(false)
						return
					}
				} catch (authErr) {
					console.log('Auth error:', authErr.response?.data || authErr.message)
					setError(authErr.response?.data?.error || 'Ошибка авторизации в СБИС')
					setLoading(false)
					return
				}
			} else {
				setSbisConnected(true)
				setAuthStatus('Уже подключено')
			}

			// 3. Запускаем диагностику
			await runDiagnostics()
		} catch (err) {
			console.log('Connect error:', err.message)
			setError(err.message)
			setLoading(false)
		}
	}

	const checkSbisStatus = async () => {
		try {
			const response = await api.get('/sbis-proxy/status')
			setSbisConnected(response.data.connected)
			if (response.data.connected) {
				runDiagnostics()
			} else {
				setLoading(false)
			}
		} catch (err) {
			console.log('Status check error:', err.message)
			setLoading(false)
		}
	}

	const runDiagnostics = async () => {
		try {
			setError(null)
			const response = await api.post('/sbis-proxy/diagnose', {})
			setDiagnostics(response.data.diagnostics)
		} catch (err) {
			console.log('Diagnostics error:', err.message)
			setError(err.response?.data?.error || err.message)
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		setDiagnostics(null)
		setError(null)
		connectAndDiagnose()
	}

	const handleConnect = () => {
		// Показываем диалог для подключения СБИС
		Alert.alert(
			'Подключение СБИС',
			'Для подключения к СБИС API необходимо:\n\n' +
				'1. Иметь аккаунт в СБИС\n' +
				'2. Подключить нужные тарифы API\n' +
				'3. Получить логин и пароль для API\n\n' +
				'Обратитесь к администратору или в поддержку СБИС.',
			[
				{ text: 'Понятно', style: 'cancel' },
				{
					text: 'Подробнее',
					onPress: () => {
						Alert.alert(
							'API СБИС',
						'Основные сервисы API:\n\n' +
							'• API ЭДО - электронный документооборот\n' +
							'• API "Все о компаниях" - поиск организаций по ИНН\n' +
							'• API Бухгалтерия - бухгалтерские документы (через ЭДО)\n' +
							'• API Отчетность - отправка отчетов в госорганы\n' +
							'• API ОФД - онлайн-кассы и фискальные документы\n' +
							'• API CRM - управление сделками\n\n' +
								'Подробнее: saby.ru/help/integration/api'
						)
					},
				},
			]
		)
	}

	const StatusBadge = ({ status, text }) => (
		<View
			style={[
				styles.badge,
				status === 'success' && styles.badgeSuccess,
				status === 'error' && styles.badgeError,
				status === 'warning' && styles.badgeWarning,
			]}
		>
			<Text
				style={[
					styles.badgeText,
					status === 'success' && styles.badgeTextSuccess,
					status === 'error' && styles.badgeTextError,
					status === 'warning' && styles.badgeTextWarning,
				]}
			>
				{text}
			</Text>
		</View>
	)

	const MethodItem = ({ method, available }) => (
		<View style={styles.methodItem}>
			<Text style={styles.methodIcon}>{available ? '✅' : '❌'}</Text>
			<Text
				style={[styles.methodName, !available && styles.methodNameDisabled]}
			>
				{method}
			</Text>
		</View>
	)

	const RecommendationItem = ({ text }) => (
		<View style={styles.recommendationItem}>
			<Text style={styles.recommendationText}>{text}</Text>
		</View>
	)

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
				<Text style={styles.loadingText}>{authStatus || 'Диагностика СБИС API...'}</Text>
			</View>
		)
	}

	if (!sbisConnected) {
		const isConfigured = isSbisConfigured()
		
		return (
			<View style={styles.container}>
				<View style={styles.notConnectedCard}>
					<Text style={styles.notConnectedIcon}>🔌</Text>
					<Text style={styles.notConnectedTitle}>
						{isConfigured ? 'Ошибка подключения' : 'СБИС не настроен'}
					</Text>
					<Text style={styles.notConnectedText}>
						{isConfigured 
							? 'Не удалось подключиться к СБИС. Проверьте логин и пароль в конфигурации.'
							: 'Для использования расширенных функций необходимо настроить интеграцию с СБИС'
						}
					</Text>
					
					{isConfigured ? (
						<TouchableOpacity
							style={styles.connectButton}
							onPress={connectAndDiagnose}
						>
							<Text style={styles.connectButtonText}>Повторить подключение</Text>
						</TouchableOpacity>
					) : (
						<TouchableOpacity
							style={styles.connectButton}
							onPress={handleConnect}
						>
							<Text style={styles.connectButtonText}>Как подключить</Text>
						</TouchableOpacity>
					)}
				</View>

				{/* Текущий конфиг */}
				{isConfigured && (
					<View style={styles.configCard}>
						<Text style={styles.configTitle}>⚙️ Текущие настройки</Text>
						<Text style={styles.configText}>
							Логин: {SBIS_CONFIG.login}{'\n'}
							ИНН организации: {SBIS_CONFIG.sellerINN}
						</Text>
					</View>
				)}

				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>ℹ️ Что работает без СБИС</Text>
					<Text style={styles.infoText}>
						• Данные контрагентов из ЕГРЮЛ (бесплатно){'\n'}
						• Базовые функции приложения{'\n'}• Локальная история операций
					</Text>
				</View>
			</View>
		)
	}

	if (error) {
		return (
			<View style={styles.container}>
				<View style={styles.errorCard}>
					<Text style={styles.errorIcon}>⚠️</Text>
					<Text style={styles.errorTitle}>Ошибка диагностики</Text>
					<Text style={styles.errorText}>{error}</Text>
					<TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
						<Text style={styles.retryButtonText}>Повторить</Text>
					</TouchableOpacity>
				</View>
			</View>
		)
	}

	const summary = diagnostics?.summary || {}

	return (
		<ScrollView
			style={styles.container}
			refreshControl={
				<RefreshControl
					refreshing={refreshing}
					onRefresh={onRefresh}
					tintColor={colors.primary}
				/>
			}
		>
			{/* Статус подключения */}
			<View style={styles.statusCard}>
				<View style={styles.statusHeader}>
					<Text style={styles.statusIcon}>🔗</Text>
					<View style={styles.statusInfo}>
						<Text style={styles.statusTitle}>Подключение к СБИС</Text>
						<StatusBadge status='success' text='Активно' />
					</View>
				</View>
				{diagnostics?.organization && (
					<View style={styles.orgInfo}>
						<Text style={styles.orgLabel}>Организация:</Text>
						<Text style={styles.orgName}>
							{diagnostics.organization.Название ||
								diagnostics.organization.НазваниеПолное ||
								'Определена'}
						</Text>
					</View>
				)}
			</View>

			{/* Сводка по API */}
			<View style={styles.summaryCard}>
				<Text style={styles.sectionTitle}>📊 Сводка по API</Text>
				<View style={styles.summaryGrid}>
					<View style={styles.summaryItem}>
						<Text style={styles.summaryValue}>{summary.available || 0}</Text>
						<Text style={styles.summaryLabel}>Доступно</Text>
					</View>
					<View style={styles.summaryItem}>
						<Text style={[styles.summaryValue, styles.summaryValueError]}>
							{summary.unavailable || 0}
						</Text>
						<Text style={styles.summaryLabel}>Недоступно</Text>
					</View>
				</View>

				<View style={styles.apiStatusRow}>
					<View style={styles.apiStatusItem}>
						<Text style={styles.apiStatusIcon}>
							{summary.hasEDO ? '✅' : '❌'}
						</Text>
						<Text style={styles.apiStatusText}>API ЭДО</Text>
					</View>
					<View style={styles.apiStatusItem}>
						<Text style={styles.apiStatusIcon}>
							{summary.hasCompanyInfo ? '✅' : '❌'}
						</Text>
						<Text style={styles.apiStatusText}>Все о компаниях</Text>
					</View>
					<View style={styles.apiStatusItem}>
						<Text style={styles.apiStatusIcon}>
							{summary.hasAccounting ? '✅' : '❌'}
						</Text>
						<Text style={styles.apiStatusText}>Бухгалтерия</Text>
					</View>
				</View>
			</View>

			{/* Рекомендации */}
			{diagnostics?.recommendations?.length > 0 && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>💡 Рекомендации</Text>
					<View style={styles.sectionContent}>
						{diagnostics.recommendations.map((rec, index) => (
							<RecommendationItem key={index} text={rec} />
						))}
					</View>
				</View>
			)}

			{/* Доступные методы */}
			{diagnostics?.availableMethods?.length > 0 && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						✅ Доступные методы ({diagnostics.availableMethods.length})
					</Text>
					<View style={styles.sectionContent}>
						{diagnostics.availableMethods.map((method, index) => (
							<MethodItem key={index} method={method} available={true} />
						))}
					</View>
				</View>
			)}

			{/* Недоступные методы */}
			{diagnostics?.unavailableMethods?.length > 0 && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>
						❌ Недоступные методы ({diagnostics.unavailableMethods.length})
					</Text>
					<View style={styles.sectionContent}>
						{diagnostics.unavailableMethods.map((method, index) => (
							<MethodItem key={index} method={method} available={false} />
						))}
					</View>
				</View>
			)}

			{/* Информация о тарифах */}
			<View style={styles.infoCard}>
				<Text style={styles.infoTitle}>ℹ️ О тарифах СБИС API</Text>
				<Text style={styles.infoText}>
					Каждый сервис API СБИС требует подключения отдельного тарифа.{'\n\n'}
					<Text style={styles.infoHighlight}>API ЭДО</Text> — электронный
					документооборот с контрагентами{'\n'}
					<Text style={styles.infoHighlight}>API "Все о компаниях"</Text> —
					поиск организаций по ИНН, оценка надежности{'\n'}
					<Text style={styles.infoHighlight}>API Бухгалтерия</Text> — работа с
					бухгалтерскими документами (работает через ЭДО){'\n'}
					<Text style={styles.infoHighlight}>API Отчетность</Text> — отправка
					отчетов в ФНС, ФСС и другие госорганы{'\n'}
					<Text style={styles.infoHighlight}>API ОФД</Text> — данные с
					онлайн-касс и фискальных документов{'\n\n'}
					Полный список сервисов и документация:{'\n'}
					saby.ru/help/integration/api
				</Text>
			</View>

			{/* Кнопка обновления */}
			<TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
				<Text style={styles.refreshButtonIcon}>🔄</Text>
				<Text style={styles.refreshButtonText}>Обновить диагностику</Text>
			</TouchableOpacity>

			<View style={styles.footer} />
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: colors.background,
	},
	loadingText: {
		marginTop: 16,
		fontSize: 16,
		color: colors.textMuted,
	},

	// Status Card
	statusCard: {
		backgroundColor: colors.backgroundWhite,
		margin: 16,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	statusHeader: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	statusIcon: {
		fontSize: 32,
		marginRight: 12,
	},
	statusInfo: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	statusTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
	},
	orgInfo: {
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	orgLabel: {
		fontSize: 12,
		color: colors.textMuted,
	},
	orgName: {
		fontSize: 14,
		fontWeight: '500',
		color: colors.textDark,
		marginTop: 2,
	},

	// Badges
	badge: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
		backgroundColor: colors.borderLight,
	},
	badgeSuccess: {
		backgroundColor: colors.success + '20',
	},
	badgeError: {
		backgroundColor: colors.error + '20',
	},
	badgeWarning: {
		backgroundColor: colors.warning + '20',
	},
	badgeText: {
		fontSize: 12,
		fontWeight: '600',
		color: colors.textMuted,
	},
	badgeTextSuccess: {
		color: colors.success,
	},
	badgeTextError: {
		color: colors.error,
	},
	badgeTextWarning: {
		color: colors.warning,
	},

	// Summary Card
	summaryCard: {
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		marginBottom: 16,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	summaryGrid: {
		flexDirection: 'row',
		marginTop: 12,
	},
	summaryItem: {
		flex: 1,
		alignItems: 'center',
		paddingVertical: 12,
		backgroundColor: colors.background,
		borderRadius: 12,
		marginHorizontal: 4,
	},
	summaryValue: {
		fontSize: 28,
		fontWeight: 'bold',
		color: colors.success,
	},
	summaryValueError: {
		color: colors.error,
	},
	summaryLabel: {
		fontSize: 12,
		color: colors.textMuted,
		marginTop: 4,
	},
	apiStatusRow: {
		flexDirection: 'row',
		marginTop: 16,
		paddingTop: 16,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	apiStatusItem: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	apiStatusIcon: {
		fontSize: 16,
		marginRight: 4,
	},
	apiStatusText: {
		fontSize: 11,
		color: colors.textMuted,
	},

	// Sections
	section: {
		marginHorizontal: 16,
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 12,
	},
	sectionContent: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 12,
		overflow: 'hidden',
	},

	// Method Item
	methodItem: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	methodIcon: {
		fontSize: 14,
		marginRight: 10,
	},
	methodName: {
		fontSize: 13,
		color: colors.textDark,
		flex: 1,
	},
	methodNameDisabled: {
		color: colors.textMuted,
	},

	// Recommendation Item
	recommendationItem: {
		padding: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	recommendationText: {
		fontSize: 14,
		color: colors.textDark,
		lineHeight: 20,
	},

	// Config Card
	configCard: {
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		marginBottom: 16,
		borderRadius: 16,
		padding: 16,
		borderWidth: 1,
		borderColor: colors.border,
	},
	configTitle: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 8,
	},
	configText: {
		fontSize: 13,
		color: colors.textMuted,
		lineHeight: 20,
	},

	// Info Card
	infoCard: {
		backgroundColor: colors.primaryLight + '15',
		marginHorizontal: 16,
		marginBottom: 16,
		borderRadius: 16,
		padding: 16,
		borderWidth: 1,
		borderColor: colors.primaryLight + '30',
	},
	infoTitle: {
		fontSize: 15,
		fontWeight: '600',
		color: colors.primary,
		marginBottom: 8,
	},
	infoText: {
		fontSize: 13,
		color: colors.textDark,
		lineHeight: 20,
	},
	infoHighlight: {
		fontWeight: '600',
		color: colors.primary,
	},

	// Not Connected Card
	notConnectedCard: {
		backgroundColor: colors.backgroundWhite,
		margin: 16,
		borderRadius: 16,
		padding: 24,
		alignItems: 'center',
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	notConnectedIcon: {
		fontSize: 48,
		marginBottom: 16,
	},
	notConnectedTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 8,
	},
	notConnectedText: {
		fontSize: 14,
		color: colors.textMuted,
		textAlign: 'center',
		lineHeight: 20,
		marginBottom: 16,
	},
	connectButton: {
		backgroundColor: colors.primary,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 12,
	},
	connectButtonText: {
		color: colors.textLight,
		fontSize: 16,
		fontWeight: '600',
	},

	// Error Card
	errorCard: {
		backgroundColor: colors.backgroundWhite,
		margin: 16,
		borderRadius: 16,
		padding: 24,
		alignItems: 'center',
	},
	errorIcon: {
		fontSize: 48,
		marginBottom: 16,
	},
	errorTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.error,
		marginBottom: 8,
	},
	errorText: {
		fontSize: 14,
		color: colors.textMuted,
		textAlign: 'center',
		marginBottom: 16,
	},
	retryButton: {
		backgroundColor: colors.primary,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 12,
	},
	retryButtonText: {
		color: colors.textLight,
		fontSize: 16,
		fontWeight: '600',
	},

	// Refresh Button
	refreshButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		marginBottom: 16,
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: colors.border,
	},
	refreshButtonIcon: {
		fontSize: 20,
		marginRight: 8,
	},
	refreshButtonText: {
		fontSize: 16,
		fontWeight: '500',
		color: colors.primary,
	},

	footer: {
		height: 40,
	},
})

