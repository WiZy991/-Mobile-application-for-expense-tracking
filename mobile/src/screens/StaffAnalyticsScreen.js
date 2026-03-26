import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Dimensions,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	Platform,
} from 'react-native'
import { api } from '../services/api'
import colors from '../theme/colors'
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit'

// Подавляем предупреждения React для react-native-chart-kit на веб-платформе
if (Platform.OS === 'web') {
	const originalError = console.error
	console.error = (...args) => {
		if (
			typeof args[0] === 'string' &&
			(args[0].includes('Unknown event handler property') ||
				args[0].includes('TouchableMixin is deprecated'))
		) {
			return
		}
		originalError(...args)
	}
}

const { width } = Dimensions.get('window')

const PERIODS = [
	{ id: 'week', label: 'Неделя', days: 7 },
	{ id: 'month', label: 'Месяц', days: 30 },
	{ id: 'quarter', label: 'Квартал', days: 90 },
	{ id: 'year', label: 'Год', days: 365 },
]

export default function StaffAnalyticsScreen({ navigation, route }) {
	const { staffRole } = route.params || {}
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [selectedPeriod, setSelectedPeriod] = useState('month')
	const [analytics, setAnalytics] = useState(null)

	// Обновляем данные при изменении периода
	useEffect(() => {
		loadAnalytics()
	}, [selectedPeriod])

	// Обновляем данные при возврате на экран
	useEffect(() => {
		const unsubscribe = navigation.addListener('focus', () => {
			console.log('[Analytics] Screen focused, reloading data...')
			loadAnalytics()
		})
		return unsubscribe
	}, [navigation])

	const loadAnalytics = async () => {
		try {
			setLoading(true)
			const response = await api.get(
				`/staff/support/analytics?period=${selectedPeriod}&assigned_to=me`
			)
			console.log('[Analytics] Loaded data:', {
				period: selectedPeriod,
				total: response.data?.stats?.total,
				completed: response.data?.stats?.completed,
				resolved: response.data?.stats?.resolved,
				closed: response.data?.stats?.closed
			})
			setAnalytics(response.data)
		} catch (error) {
			console.error('Error loading analytics:', error)
			if (error.response) {
				console.error('Response data:', error.response.data)
			}
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		loadAnalytics()
	}

	const formatTime = minutes => {
		if (!minutes || minutes === 0) return '0 мин'
		const hours = Math.floor(minutes / 60)
		const mins = minutes % 60
		if (hours > 0) {
			return `${hours}ч ${mins}мин`
		}
		return `${mins} мин`
	}

	const formatDate = dateString => {
		if (!dateString) return ''
		const date = new Date(dateString)
		return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
	}

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
				<Text style={styles.loadingText}>Загрузка аналитики...</Text>
			</View>
		)
	}

	if (!analytics) {
		return (
			<View style={styles.center}>
				<Text style={styles.emptyText}>Нет данных для отображения</Text>
			</View>
		)
	}

	const chartWidth = width - 32

	// Данные для графика задач по дням
	const dailyLabels = analytics.dailyStats
		.slice()
		.reverse()
		.slice(-7)
		.map(item => formatDate(item.date))
	const dailyTicketsData = analytics.dailyStats
		.slice()
		.reverse()
		.slice(-7)
		.map(item => item.ticketsCount)
	const dailyCompletedData = analytics.dailyStats
		.slice()
		.reverse()
		.slice(-7)
		.map(item => item.completedCount)

	// Данные для графика по приоритетам
	const priorityLabels = analytics.priorityStats.map(item => {
		const labels = {
			urgent: 'Срочно',
			high: 'Высокий',
			normal: 'Обычный',
			low: 'Низкий',
		}
		return labels[item.priority] || item.priority
	})
	const priorityData = analytics.priorityStats.map(item => item.count)
	const priorityColors = ['#ff4444', '#ff8800', colors.primary, colors.textMuted]

	// Данные для круговой диаграммы статусов
	const statusData = [
		{
			name: 'Открыто',
			value: analytics.stats.open,
			color: '#ff8800',
			legendFontColor: colors.textDark,
			legendFontSize: 12,
		},
		{
			name: 'В работе',
			value: analytics.stats.inProgress,
			color: colors.primary,
			legendFontColor: colors.textDark,
			legendFontSize: 12,
		},
		{
			name: 'Решено',
			value: analytics.stats.resolved,
			color: colors.success,
			legendFontColor: colors.textDark,
			legendFontSize: 12,
		},
		{
			name: 'Закрыто',
			value: analytics.stats.closed,
			color: colors.textMuted,
			legendFontColor: colors.textDark,
			legendFontSize: 12,
		},
	].filter(item => item.value > 0)

	return (
		<View style={styles.container}>
			<ScrollView
				style={styles.scrollView}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
				}
			>
				{/* Период фильтра */}
				<View style={styles.periodContainer}>
					<Text style={styles.sectionTitle}>Период</Text>
					<View style={styles.periodButtons}>
						{PERIODS.map(period => (
							<TouchableOpacity
								key={period.id}
								style={[
									styles.periodButton,
									selectedPeriod === period.id && styles.periodButtonActive,
								]}
								onPress={() => setSelectedPeriod(period.id)}
							>
								<Text
									style={[
										styles.periodButtonText,
										selectedPeriod === period.id && styles.periodButtonTextActive,
									]}
								>
									{period.label}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>

				{/* Основная статистика */}
				<View style={styles.statsGrid}>
					<View style={styles.statCard}>
						<Text style={styles.statValue}>{analytics.stats.total}</Text>
						<Text style={styles.statLabel}>Всего задач</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={[styles.statValue, { color: colors.success }]}>
							{analytics.stats.completed}
						</Text>
						<Text style={styles.statLabel}>Выполнено</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={[styles.statValue, { color: colors.primary }]}>
							{analytics.stats.completionRate}%
						</Text>
						<Text style={styles.statLabel}>Процент выполнения</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={[styles.statValue, { color: '#ff8800' }]}>
							{formatTime(analytics.stats.time.totalMinutes)}
						</Text>
						<Text style={styles.statLabel}>Всего времени</Text>
					</View>
				</View>

				{/* Статистика по времени */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Время выполнения</Text>
					<View style={styles.timeStatsGrid}>
						<View style={styles.timeStatCard}>
							<Text style={styles.timeStatValue}>
								{formatTime(analytics.stats.time.avgMinutes)}
							</Text>
							<Text style={styles.timeStatLabel}>Среднее время</Text>
						</View>
						<View style={styles.timeStatCard}>
							<Text style={styles.timeStatValue}>
								{formatTime(analytics.stats.time.minMinutes)}
							</Text>
							<Text style={styles.timeStatLabel}>Минимум</Text>
						</View>
						<View style={styles.timeStatCard}>
							<Text style={styles.timeStatValue}>
								{formatTime(analytics.stats.time.maxMinutes)}
							</Text>
							<Text style={styles.timeStatLabel}>Максимум</Text>
						</View>
					</View>
				</View>

				{/* График задач по дням */}
				{analytics.dailyStats.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Задачи по дням</Text>
						<LineChart
							data={{
								labels: dailyLabels,
								datasets: [
									{
										data: dailyTicketsData,
										color: (opacity = 1) => colors.primary,
										strokeWidth: 2,
									},
									{
										data: dailyCompletedData,
										color: (opacity = 1) => colors.success,
										strokeWidth: 2,
									},
								],
								legend: ['Всего', 'Выполнено'],
							}}
							width={chartWidth}
							height={220}
							chartConfig={{
								backgroundColor: colors.backgroundWhite,
								backgroundGradientFrom: colors.backgroundWhite,
								backgroundGradientTo: colors.backgroundWhite,
								decimalPlaces: 0,
								color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
								labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
								style: {
									borderRadius: 16,
								},
								propsForDots: {
									r: '4',
									strokeWidth: '2',
									stroke: colors.primary,
								},
							}}
							bezier
							style={styles.chart}
						/>
					</View>
				)}

				{/* Статистика по приоритетам */}
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Задачи по приоритетам</Text>
					{analytics.priorityStats.length > 0 ? (
						<BarChart
							data={{
								labels: priorityLabels,
								datasets: [
									{
										data: priorityData,
									},
								],
							}}
							width={chartWidth}
							height={220}
							chartConfig={{
								backgroundColor: colors.backgroundWhite,
								backgroundGradientFrom: colors.backgroundWhite,
								backgroundGradientTo: colors.backgroundWhite,
								decimalPlaces: 0,
								color: (opacity = 1) => colors.primary,
								labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
								barPercentage: 0.7,
							}}
							style={styles.chart}
							showValuesOnTopOfBars
						/>
					) : (
						<Text style={styles.emptyText}>Нет данных по приоритетам</Text>
					)}
				</View>

				{/* Круговая диаграмма статусов */}
				{statusData.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Распределение по статусам</Text>
						<PieChart
							data={statusData}
							width={chartWidth}
							height={220}
							chartConfig={{
								color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
							}}
							accessor="value"
							backgroundColor="transparent"
							paddingLeft="15"
							style={styles.chart}
						/>
					</View>
				)}

				{/* Статистика по времени по статусам */}
				{analytics.statusTimeStats.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Среднее время по статусам</Text>
						{analytics.statusTimeStats.map((item, index) => {
							const statusLabels = {
								open: 'Открыто',
								in_progress: 'В работе',
								resolved: 'Решено',
								closed: 'Закрыто',
							}
							return (
								<View key={index} style={styles.statusTimeItem}>
									<View style={styles.statusTimeLeft}>
										<Text style={styles.statusTimeLabel}>
											{statusLabels[item.status] || item.status}
										</Text>
										<Text style={styles.statusTimeCount}>{item.count} задач</Text>
									</View>
									<Text style={styles.statusTimeValue}>
										{formatTime(item.avgTimeMinutes)}
									</Text>
								</View>
							)
						})}
					</View>
				)}

				{/* Топ задач по времени */}
				{analytics.topTimeConsuming.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>⏰ Топ задач по времени выполнения</Text>
						{analytics.topTimeConsuming.map((item, index) => (
							<View key={item.id} style={styles.topTaskCard}>
								<View style={styles.topTaskHeader}>
									<Text style={styles.topTaskIndex}>#{index + 1}</Text>
									<Text style={styles.topTaskSubject} numberOfLines={1}>
										{item.subject}
									</Text>
								</View>
								<View style={styles.topTaskInfo}>
									<Text style={styles.topTaskClient}>{item.clientName}</Text>
									<Text style={styles.topTaskTime}>
										{formatTime(item.timeSpentMinutes)}
									</Text>
								</View>
								<View style={styles.topTaskFooter}>
									<View
										style={[
											styles.priorityBadge,
											{
												backgroundColor:
													item.priority === 'urgent'
														? '#ff444420'
														: item.priority === 'high'
														? '#ff880020'
														: colors.primary + '20',
											},
										]}
									>
										<Text
											style={[
												styles.priorityText,
												{
													color:
														item.priority === 'urgent'
															? '#ff4444'
															: item.priority === 'high'
															? '#ff8800'
															: colors.primary,
												},
											]}
										>
											{item.priority === 'urgent'
												? 'Срочно'
												: item.priority === 'high'
												? 'Высокий'
												: item.priority === 'normal'
												? 'Обычный'
												: 'Низкий'}
										</Text>
									</View>
									<Text style={styles.topTaskStatus}>
										{item.status === 'closed'
											? 'Закрыто'
											: item.status === 'resolved'
											? 'Решено'
											: item.status === 'in_progress'
											? 'В работе'
											: 'Открыто'}
									</Text>
								</View>
							</View>
						))}
					</View>
				)}
			</ScrollView>
		</View>
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
	emptyText: {
		fontSize: 14,
		color: colors.textMuted,
		textAlign: 'center',
		padding: 20,
	},
	scrollView: {
		flex: 1,
	},
	periodContainer: {
		backgroundColor: colors.backgroundWhite,
		padding: 16,
		marginBottom: 8,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 12,
	},
	periodButtons: {
		flexDirection: 'row',
		gap: 8,
	},
	periodButton: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 10,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: 'transparent',
	},
	periodButtonActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	periodButtonText: {
		fontSize: 14,
		fontWeight: '500',
		color: colors.textDark,
	},
	periodButtonTextActive: {
		color: colors.textLight,
		fontWeight: '600',
	},
	statsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		padding: 16,
		gap: 12,
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
	statValue: {
		fontSize: 28,
		fontWeight: 'bold',
		color: colors.primary,
		marginBottom: 4,
	},
	statLabel: {
		fontSize: 12,
		color: colors.textMuted,
		textAlign: 'center',
	},
	section: {
		backgroundColor: colors.backgroundWhite,
		padding: 16,
		marginBottom: 8,
	},
	timeStatsGrid: {
		flexDirection: 'row',
		gap: 12,
	},
	timeStatCard: {
		flex: 1,
		backgroundColor: colors.backgroundLight,
		borderRadius: 12,
		padding: 12,
		alignItems: 'center',
	},
	timeStatValue: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.primary,
		marginBottom: 4,
	},
	timeStatLabel: {
		fontSize: 11,
		color: colors.textMuted,
		textAlign: 'center',
	},
	chart: {
		marginVertical: 8,
		borderRadius: 16,
	},
	statusTimeItem: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	statusTimeLeft: {
		flex: 1,
	},
	statusTimeLabel: {
		fontSize: 15,
		fontWeight: '500',
		color: colors.textDark,
		marginBottom: 2,
	},
	statusTimeCount: {
		fontSize: 12,
		color: colors.textMuted,
	},
	statusTimeValue: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.primary,
	},
	topTaskCard: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 12,
		padding: 12,
		marginBottom: 8,
	},
	topTaskHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 8,
	},
	topTaskIndex: {
		fontSize: 16,
		fontWeight: 'bold',
		color: colors.primary,
		marginRight: 8,
		width: 24,
	},
	topTaskSubject: {
		flex: 1,
		fontSize: 15,
		fontWeight: '600',
		color: colors.textDark,
	},
	topTaskInfo: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	topTaskClient: {
		fontSize: 13,
		color: colors.textMuted,
	},
	topTaskTime: {
		fontSize: 15,
		fontWeight: '600',
		color: colors.primary,
	},
	topTaskFooter: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	priorityBadge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 8,
	},
	priorityText: {
		fontSize: 11,
		fontWeight: '600',
	},
	topTaskStatus: {
		fontSize: 12,
		color: colors.textMuted,
	},
})
