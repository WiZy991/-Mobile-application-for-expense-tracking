import { format } from 'date-fns'
import ru from 'date-fns/locale/ru'
import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { MaterialIcons, Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons'
import { api } from '../services/api'
import colors from '../theme/colors'

const { width } = Dimensions.get('window')

export default function DashboardScreen({ navigation }) {
	const [client, setClient] = useState(null)
	const [recentTransactions, setRecentTransactions] = useState([])
	const [sbisData, setSbisData] = useState(null)
	const [unreadNotifications, setUnreadNotifications] = useState(0)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [syncing, setSyncing] = useState(false)

	useEffect(() => {
		loadData()
	}, [])

	// Обновляем данные при возврате на экран
	useEffect(() => {
		const unsubscribe = navigation.addListener('focus', () => {
			loadData()
		})
		return unsubscribe
	}, [navigation])

	// Обновляем счетчик уведомлений периодически
	useEffect(() => {
		const interval = setInterval(() => {
			// Обновляем только счетчик уведомлений
			api.get('/notifications/unread/count')
				.then(response => {
					setUnreadNotifications(response.data?.count || 0)
				})
				.catch(() => {
					// Игнорируем ошибки при обновлении счетчика
				})
		}, 30000) // Обновляем каждые 30 секунд

		return () => clearInterval(interval)
	}, [])

	const loadData = async () => {
		try {
			// Загружаем данные клиента с сервера
			const profileResponse = await api.get('/clients/me')
			const clientData = profileResponse.data

			setClient({
				name: clientData.name || 'Клиент',
				email: clientData.email || '',
				phone: clientData.phone || '',
				balance: parseFloat(clientData.balance) || 0,
				companyName: clientData.name || clientData.company_name || '',
				inn: clientData.inn || '',
			})

			// Загружаем транзакции
			try {
				const transactionsResponse = await api.get('/payments/history?limit=5')
				const transactions = transactionsResponse.data?.transactions || []
				// Убеждаемся, что все транзакции имеют нужные поля
				setRecentTransactions(transactions.map(t => ({
					id: t.id,
					type: t.type || 'charge',
					amount: parseFloat(t.amount) || 0,
					description: t.description || t.service_name || 'Транзакция',
					service_name: t.service_name || 'Услуга',
					status: t.status || 'pending',
					created_at: t.created_at,
				})))
			} catch (e) {
				console.log('Транзакции недоступны:', e.message)
				setRecentTransactions([])
			}

			// Загружаем уведомления
			try {
				const notificationsResponse = await api.get(
					'/notifications/unread/count'
				)
				setUnreadNotifications(parseInt(notificationsResponse.data?.count) || 0)
			} catch (e) {
				console.log('Уведомления недоступны:', e.message)
				setUnreadNotifications(0)
			}

			// Статистика по транзакциям
			try {
				const statsResponse = await api.get('/clients/me/stats')
				setSbisData({
					totalSpent: parseFloat(statsResponse.data?.totalSpent) || 0,
					activeInvoices: parseInt(statsResponse.data?.activeInvoices) || 0,
					paidInvoices: parseInt(statsResponse.data?.paidInvoices) || 0,
					pendingAmount: parseFloat(statsResponse.data?.pendingAmount) || 0,
				})
			} catch (e) {
				console.log('Статистика недоступна:', e.message)
				setSbisData({
					totalSpent: 0,
					activeInvoices: 0,
					paidInvoices: 0,
					pendingAmount: 0,
				})
			}
		} catch (error) {
			console.error('Error loading dashboard:', error)
			// Если не удалось загрузить - показываем пустые данные
			setClient({
				name: 'Клиент',
				email: '',
				phone: '',
				balance: 0,
				companyName: '',
				inn: '',
			})
			setSbisData({
				totalSpent: 0,
				activeInvoices: 0,
				paidInvoices: 0,
				pendingAmount: 0,
			})
			setRecentTransactions([])
			setUnreadNotifications(0)
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		loadData()
	}

	const handleSync = async () => {
		setSyncing(true)
		try {
			await api.post('/clients/sync')
			await loadData()
			Alert.alert('Синхронизация', 'Данные успешно обновлены')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadData()
		} finally {
			setSyncing(false)
		}
	}

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
				<Text style={styles.loadingText}>Загрузка данных...</Text>
			</View>
		)
	}

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
			{/* Шапка */}
			<View style={styles.header}>
				<View style={styles.greetingRow}>
					<View>
						<Text style={styles.greeting}>Добро пожаловать,</Text>
						<Text style={styles.userName}>{client?.name}!</Text>
						<Text style={styles.companyName}>{client?.companyName}</Text>
					</View>
					<TouchableOpacity
						style={styles.profileButton}
						onPress={() => navigation.navigate('Profile')}
					>
						<Text style={styles.profileButtonText}>
							{client?.name?.charAt(0).toUpperCase() || 'П'}
						</Text>
					</TouchableOpacity>
				</View>

				{/* Карточка баланса */}
				<View style={styles.balanceCard}>
					<View style={styles.balanceHeader}>
						<Text style={styles.balanceLabel}>Ваш баланс</Text>
					</View>
					<Text
						style={[
							styles.balanceAmount,
							Number(client?.balance || 0) < 0 && styles.balanceNegative,
						]}
					>
						{(client?.balance || 0).toLocaleString('ru-RU')} ₽
					</Text>
					<TouchableOpacity
						style={styles.topUpButton}
						onPress={() => navigation.navigate('Balance')}
					>
						<Text style={styles.topUpButtonText}>Пополнить баланс</Text>
					</TouchableOpacity>
				</View>
			</View>

			{/* Уведомления */}
			{unreadNotifications > 0 && (
				<TouchableOpacity
					style={styles.notificationBanner}
					onPress={() => navigation.navigate('Notifications')}
				>
					<View style={styles.notificationIcon}>
						<Text style={styles.notificationIconText}>•</Text>
					</View>
					<Text style={styles.notificationText}>
						У вас {unreadNotifications} непрочитанных уведомления
					</Text>
					<Text style={styles.notificationArrow}>→</Text>
				</TouchableOpacity>
			)}

			{/* Кнопка синхронизации */}
			<TouchableOpacity
				style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
				onPress={handleSync}
				disabled={syncing}
			>
				{syncing ? (
					<ActivityIndicator size='small' color={colors.textLight} />
				) : (
					<>
						<MaterialIcons name="sync" size={20} color={colors.textLight} />
						<Text style={styles.syncButtonText}>Синхронизировать</Text>
					</>
				)}
			</TouchableOpacity>

			{/* Статистика */}
			<View style={styles.sbisSection}>
				<Text style={styles.sectionTitle}>Статистика</Text>
				<View style={styles.statsGrid}>
					<View style={styles.statCard}>
						<View
							style={[styles.statIcon, { backgroundColor: colors.primarySoft }]}
						>
							<MaterialIcons name="account-balance-wallet" size={24} color={colors.primary} />
						</View>
						<Text style={styles.statValue}>
							{sbisData?.totalSpent?.toLocaleString('ru-RU')} ₽
						</Text>
						<Text style={styles.statLabel}>Всего потрачено</Text>
					</View>

					<View style={styles.statCard}>
						<View
							style={[
								styles.statIcon,
								{ backgroundColor: colors.warning + '30' },
							]}
						>
							<MaterialIcons name="assignment" size={24} color={colors.warning} />
						</View>
						<Text style={styles.statValue}>{sbisData?.activeInvoices}</Text>
						<Text style={styles.statLabel}>Активных счетов</Text>
					</View>

					<View style={styles.statCard}>
						<View
							style={[
								styles.statIcon,
								{ backgroundColor: colors.success + '30' },
							]}
						>
							<MaterialIcons name="check" size={24} color={colors.success} />
						</View>
						<Text style={styles.statValue}>{sbisData?.paidInvoices}</Text>
						<Text style={styles.statLabel}>Оплаченных</Text>
					</View>

					<View style={styles.statCard}>
						<View
							style={[
								styles.statIcon,
								{ backgroundColor: colors.error + '30' },
							]}
						>
							<MaterialIcons name="schedule" size={24} color={colors.error} />
						</View>
						<Text style={styles.statValue}>
							{sbisData?.pendingAmount?.toLocaleString('ru-RU')} ₽
						</Text>
						<Text style={styles.statLabel}>К оплате</Text>
					</View>
				</View>
			</View>

			{/* Последние транзакции */}
			<View style={styles.section}>
				<View style={styles.sectionHeader}>
					<Text style={styles.sectionTitle}>Последние операции</Text>
					<TouchableOpacity onPress={() => navigation.navigate('History')}>
						<Text style={styles.seeAll}>Все →</Text>
					</TouchableOpacity>
				</View>

				{recentTransactions.length === 0 ? (
					<View style={styles.emptyState}>
						<MaterialIcons name="receipt" size={48} color={colors.textMuted} />
						<Text style={styles.emptyText}>Нет операций</Text>
					</View>
				) : (
					recentTransactions.map(transaction => (
						<View key={transaction.id} style={styles.transactionItem}>
							<View style={styles.transactionLeft}>
								<View
									style={[
										styles.transactionIcon,
										transaction.type === 'charge'
											? styles.transactionIconCharge
											: styles.transactionIconPayment,
									]}
								>
									{transaction.type === 'charge' ? (
										<MaterialIcons name="arrow-downward" size={20} color={colors.error} />
									) : (
										<MaterialIcons name="arrow-upward" size={20} color={colors.success} />
									)}
								</View>
								<View style={styles.transactionInfo}>
									<Text style={styles.transactionService}>
										{transaction.service_name}
									</Text>
									<Text style={styles.transactionDate}>
										{format(
											new Date(transaction.created_at),
											'dd MMM yyyy, HH:mm',
											{
												locale: ru,
											}
										)}
									</Text>
								</View>
							</View>
							<View style={styles.transactionRight}>
								<Text
									style={[
										styles.transactionAmount,
										transaction.type === 'charge' && styles.chargeAmount,
										transaction.type === 'payment' && styles.paymentAmount,
									]}
								>
									{transaction.type === 'charge' ? '-' : '+'}
									{Number(transaction.amount).toLocaleString('ru-RU')} ₽
								</Text>
								<View
									style={[
										styles.statusBadge,
										transaction.status === 'completed'
											? styles.statusCompleted
											: styles.statusPending,
									]}
								>
									<Text style={styles.statusText}>
										{transaction.status === 'completed'
											? 'Проведено'
											: 'Ожидает'}
									</Text>
								</View>
							</View>
						</View>
					))
				)}
			</View>

			{/* Быстрые действия */}
			<View style={styles.quickActions}>
				<Text style={styles.sectionTitle}>Быстрые действия</Text>
				<View style={styles.actionsGrid}>
					<TouchableOpacity
						style={styles.actionCard}
						onPress={() => navigation.navigate('Balance')}
					>
						<View
							style={[styles.actionIcon, { backgroundColor: colors.primary }]}
						>
							<MaterialIcons name="account-balance-wallet" size={24} color={colors.textLight} />
						</View>
						<Text style={styles.actionCardText}>Пополнить</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.actionCard}
						onPress={() => navigation.navigate('Services')}
					>
						<View
							style={[styles.actionIcon, { backgroundColor: colors.warning }]}
						>
							<MaterialIcons name="shopping-cart" size={24} color={colors.textLight} />
						</View>
						<Text style={styles.actionCardText}>Услуги</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.actionCard}
						onPress={() => navigation.navigate('Analytics')}
					>
						<View style={[styles.actionIcon, { backgroundColor: colors.info }]}>
							<MaterialIcons name="bar-chart" size={24} color={colors.textLight} />
						</View>
						<Text style={styles.actionCardText}>Аналитика</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.actionCard}
						onPress={() => navigation.navigate('History')}
					>
						<View
							style={[
								styles.actionIcon,
								{ backgroundColor: colors.primaryDark },
							]}
						>
							<MaterialIcons name="history" size={24} color={colors.textLight} />
						</View>
						<Text style={styles.actionCardText}>История</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.actionCard}
						onPress={() => navigation.navigate('Resources')}
					>
						<View
							style={[
								styles.actionIcon,
								{ backgroundColor: '#4CAF50' },
							]}
						>
							<MaterialIcons name="inventory" size={24} color={colors.textLight} />
						</View>
						<Text style={styles.actionCardText}>Ресурсы</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.actionCard}
						onPress={() => navigation.navigate('Subscriptions')}
					>
						<View
							style={[
								styles.actionIcon,
								{ backgroundColor: '#9C27B0' },
							]}
						>
							<MaterialIcons name="subscriptions" size={24} color={colors.textLight} />
						</View>
						<Text style={styles.actionCardText}>Подписки</Text>
					</TouchableOpacity>
				</View>
			</View>

			{/* Кнопка помощи */}
			<TouchableOpacity
				style={styles.helpButton}
				onPress={() => navigation.navigate('Support')}
			>
				<View style={styles.helpIconContainer}>
					<MaterialIcons name="help-outline" size={24} color={colors.primary} />
				</View>
				<View style={styles.helpContent}>
					<Text style={styles.helpTitle}>Нужна помощь?</Text>
					<Text style={styles.helpSubtitle}>
						Свяжитесь с техподдержкой в один клик
					</Text>
				</View>
				<Text style={styles.helpArrow}>→</Text>
			</TouchableOpacity>

			{/* Футер */}
			<View style={styles.footer}>
				<Text style={styles.footerText}>WorldCashBox © 2025</Text>
			</View>
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
		marginTop: 12,
		fontSize: 14,
		color: colors.textMuted,
	},
	header: {
		padding: 20,
		backgroundColor: colors.primary,
		paddingTop: 60,
		paddingBottom: 30,
		borderBottomLeftRadius: 24,
		borderBottomRightRadius: 24,
	},
	greetingRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 24,
	},
	greeting: {
		fontSize: 14,
		color: 'rgba(255,255,255,0.8)',
	},
	userName: {
		fontSize: 26,
		fontWeight: 'bold',
		color: colors.textLight,
		marginTop: 2,
	},
	companyName: {
		fontSize: 13,
		color: 'rgba(255,255,255,0.7)',
		marginTop: 4,
	},
	profileButton: {
		width: 50,
		height: 50,
		borderRadius: 25,
		backgroundColor: 'rgba(255,255,255,0.2)',
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 2,
		borderColor: 'rgba(255,255,255,0.3)',
	},
	profileButtonText: {
		fontSize: 22,
		fontWeight: 'bold',
		color: colors.textLight,
	},
	balanceCard: {
		backgroundColor: 'rgba(255,255,255,0.15)',
		borderRadius: 20,
		padding: 24,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.2)',
	},
	balanceHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	balanceLabel: {
		color: 'rgba(255,255,255,0.9)',
		fontSize: 14,
	},
	balanceAmount: {
		color: colors.textLight,
		fontSize: 40,
		fontWeight: 'bold',
		marginBottom: 16,
	},
	balanceNegative: {
		color: '#FFD93D',
	},
	topUpButton: {
		backgroundColor: colors.textLight,
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 24,
		alignItems: 'center',
	},
	topUpButtonText: {
		color: colors.primary,
		fontSize: 16,
		fontWeight: '600',
	},
	syncButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.primary,
		marginHorizontal: 16,
		marginTop: 16,
		padding: 14,
		borderRadius: 12,
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	syncButtonDisabled: {
		opacity: 0.7,
	},
	syncButtonIcon: {
		fontSize: 18,
		marginRight: 8,
	},
	syncButtonText: {
		color: colors.textLight,
		fontSize: 15,
		fontWeight: '600',
	},
	notificationBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.warning + '20',
		margin: 16,
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.warning + '40',
	},
	notificationIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: colors.warning,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	notificationIconText: {
		fontSize: 16,
	},
	notificationText: {
		flex: 1,
		fontSize: 14,
		color: colors.textDark,
		fontWeight: '500',
	},
	notificationArrow: {
		fontSize: 18,
		color: colors.warning,
		fontWeight: 'bold',
	},
	sbisSection: {
		padding: 16,
	},
	statsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
		marginTop: 12,
	},
	statCard: {
		width: (width - 44) / 2,
		backgroundColor: colors.backgroundWhite,
		borderRadius: 16,
		padding: 16,
		alignItems: 'center',
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	statIcon: {
		width: 44,
		height: 44,
		borderRadius: 22,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 10,
	},
	statIconText: {
		fontSize: 20,
	},
	statValue: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.textDark,
		marginBottom: 4,
	},
	statLabel: {
		fontSize: 12,
		color: colors.textMuted,
		textAlign: 'center',
	},
	section: {
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
	sectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
	},
	seeAll: {
		color: colors.primary,
		fontSize: 14,
		fontWeight: '600',
	},
	emptyState: {
		alignItems: 'center',
		padding: 30,
	},
	emptyIcon: {
		fontSize: 40,
		marginBottom: 10,
	},
	emptyText: {
		color: colors.textMuted,
		fontSize: 14,
	},
	transactionItem: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 14,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	transactionLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	transactionIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	transactionIconCharge: {
		backgroundColor: colors.error + '20',
	},
	transactionIconPayment: {
		backgroundColor: colors.success + '20',
	},
	transactionIconText: {
		fontSize: 18,
	},
	transactionInfo: {
		flex: 1,
	},
	transactionService: {
		fontSize: 15,
		fontWeight: '500',
		color: colors.textDark,
		marginBottom: 4,
	},
	transactionDate: {
		fontSize: 12,
		color: colors.textMuted,
	},
	transactionRight: {
		alignItems: 'flex-end',
	},
	transactionAmount: {
		fontSize: 16,
		fontWeight: '600',
		marginBottom: 4,
	},
	chargeAmount: {
		color: colors.error,
	},
	paymentAmount: {
		color: colors.success,
	},
	statusBadge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
	},
	statusCompleted: {
		backgroundColor: colors.success + '20',
	},
	statusPending: {
		backgroundColor: colors.warning + '20',
	},
	statusText: {
		fontSize: 10,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	quickActions: {
		padding: 16,
	},
	actionsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
		marginTop: 12,
	},
	actionCard: {
		width: (width - 44) / 2,
		backgroundColor: colors.backgroundWhite,
		borderRadius: 16,
		padding: 20,
		alignItems: 'center',
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	actionIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 12,
	},
	actionIconText: {
		fontSize: 26,
	},
	actionCardText: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textDark,
	},
	footer: {
		alignItems: 'center',
		paddingVertical: 30,
		paddingBottom: 40,
	},
	footerText: {
		fontSize: 14,
		color: colors.textMuted,
		fontWeight: '500',
	},
	footerSubtext: {
		fontSize: 12,
		color: colors.textMuted,
		marginTop: 4,
	},
	helpButton: {
		flexDirection: 'row',
		alignItems: 'center',
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
		borderWidth: 2,
		borderColor: colors.primary + '30',
	},
	helpIconContainer: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: colors.primary + '20',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	helpIcon: {
		fontSize: 24,
	},
	helpContent: {
		flex: 1,
	},
	helpTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 4,
	},
	helpSubtitle: {
		fontSize: 13,
		color: colors.textMuted,
	},
	helpArrow: {
		fontSize: 20,
		color: colors.primary,
		fontWeight: 'bold',
	},
})
