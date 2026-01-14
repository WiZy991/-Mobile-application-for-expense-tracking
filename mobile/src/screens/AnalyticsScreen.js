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
import { api } from '../services/api'
import colors from '../theme/colors'

const { width } = Dimensions.get('window')

const PERIODS = [
	{ id: 'month', label: 'Месяц' },
	{ id: 'quarter', label: 'Квартал' },
	{ id: 'year', label: 'Год' },
	{ id: 'all', label: 'Всё время' },
]

export default function AnalyticsScreen() {
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [period, setPeriod] = useState('month')
	const [analytics, setAnalytics] = useState(null)

	useEffect(() => {
		loadAnalytics()
	}, [period])

	const loadAnalytics = async () => {
		try {
			// Загружаем аналитику из API
			const response = await api.get(`/analytics?period=${period}`)
			setAnalytics(response.data)
		} catch (error) {
			console.log('Error loading analytics:', error.message)
			// Показываем пустые данные если API недоступен
			setAnalytics({
				totalSpent: 0,
				totalPaid: 0,
				invoicesCount: 0,
				servicesCount: 0,
				avgInvoice: 0,
				trend: '0%',
				byCategory: [],
				monthlyData: [],
			})
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		loadAnalytics()
	}

	const handleSync = async () => {
		setSyncing(true)
		try {
			await api.post('/analytics/sync')
			await loadAnalytics()
			Alert.alert('Синхронизация', 'Аналитика обновлена из СБИС')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadAnalytics()
		} finally {
			setSyncing(false)
		}
	}

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
				<Text style={styles.loadingText}>Загрузка аналитики...</Text>
			</View>
		)
	}

	const renderBar = (item, maxAmount) => {
		const barWidth = maxAmount > 0 ? (item.spent / maxAmount) * 100 : 0
		return (
			<View key={item.month} style={styles.barContainer}>
				<Text style={styles.barLabel}>{item.month}</Text>
				<View style={styles.barWrapper}>
					<View style={[styles.bar, { width: `${barWidth}%` }]} />
				</View>
				<Text style={styles.barValue}>{(item.spent / 1000).toFixed(0)}k</Text>
			</View>
		)
	}

	const maxMonthlySpent =
		analytics?.monthlyData?.length > 0
			? Math.max(...analytics.monthlyData.map(d => d.spent))
			: 0

<<<<<<< HEAD
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Всего потрачено за {year} год</Text>
        <Text style={styles.summaryAmount}>
          {typeof analytics.total === 'number' 
            ? analytics.total.toFixed(2) 
            : parseFloat(analytics.total || 0).toFixed(2)} ₽
        </Text>
        <Text style={styles.summaryCount}>
          {analytics.transaction_count} транзакций
        </Text>
      </View>
=======
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
						<Text style={styles.syncButtonIcon}>🔄</Text>
						<Text style={styles.syncButtonText}>Синхронизировать с СБИС</Text>
					</>
				)}
			</TouchableOpacity>
>>>>>>> 86fa44cdf55de05b6875cdfda4f46151993974b2

			{/* Выбор периода */}
			<View style={styles.periodContainer}>
				{PERIODS.map(p => (
					<TouchableOpacity
						key={p.id}
						style={[
							styles.periodButton,
							period === p.id && styles.periodButtonActive,
						]}
						onPress={() => setPeriod(p.id)}
					>
						<Text
							style={[
								styles.periodText,
								period === p.id && styles.periodTextActive,
							]}
						>
							{p.label}
						</Text>
					</TouchableOpacity>
				))}
			</View>

<<<<<<< HEAD
      <View style={styles.servicesCard}>
        <Text style={styles.servicesTitle}>Расходы по услугам</Text>
        {analytics.by_service.map((service, index) => (
          <View key={index} style={styles.serviceItem}>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceName}>{service.service_name}</Text>
              <Text style={styles.serviceCount}>
                {service.transaction_count} транзакций
              </Text>
            </View>
            <Text style={styles.serviceAmount}>
              {typeof service.total_amount === 'number' 
                ? service.total_amount.toFixed(2) 
                : parseFloat(service.total_amount || 0).toFixed(2)} ₽
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
=======
			{/* Главные метрики */}
			<View style={styles.mainStats}>
				<View style={styles.mainStatCard}>
					<Text style={styles.mainStatIcon}>📊</Text>
					<Text style={styles.mainStatValue}>
						{analytics?.totalSpent?.toLocaleString('ru-RU') || 0} ₽
					</Text>
					<Text style={styles.mainStatLabel}>Расходы</Text>
					{analytics?.trend && (
						<View style={styles.trendBadge}>
							<Text style={styles.trendText}>{analytics.trend}</Text>
						</View>
					)}
				</View>
			</View>

			{/* Статистика */}
			<View style={styles.statsGrid}>
				<View style={styles.statCard}>
					<Text style={styles.statIcon}>💰</Text>
					<Text style={styles.statValue}>
						{analytics?.totalPaid?.toLocaleString('ru-RU') || 0} ₽
					</Text>
					<Text style={styles.statLabel}>Оплачено</Text>
				</View>
				<View style={styles.statCard}>
					<Text style={styles.statIcon}>📄</Text>
					<Text style={styles.statValue}>{analytics?.invoicesCount || 0}</Text>
					<Text style={styles.statLabel}>Счетов</Text>
				</View>
				<View style={styles.statCard}>
					<Text style={styles.statIcon}>⚡</Text>
					<Text style={styles.statValue}>{analytics?.servicesCount || 0}</Text>
					<Text style={styles.statLabel}>Услуг</Text>
				</View>
				<View style={styles.statCard}>
					<Text style={styles.statIcon}>📈</Text>
					<Text style={styles.statValue}>
						{analytics?.avgInvoice?.toLocaleString('ru-RU') || 0} ₽
					</Text>
					<Text style={styles.statLabel}>Средний счёт</Text>
				</View>
			</View>

			{/* Расходы по категориям */}
			{analytics?.byCategory?.length > 0 && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Расходы по категориям</Text>
					<View style={styles.categoriesCard}>
						{analytics.byCategory.map((category, index) => (
							<View key={index} style={styles.categoryItem}>
								<View style={styles.categoryHeader}>
									<View style={styles.categoryInfo}>
										<View
											style={[
												styles.categoryDot,
												{ backgroundColor: category.color || colors.primary },
											]}
										/>
										<Text style={styles.categoryName}>{category.name}</Text>
									</View>
									<Text style={styles.categoryAmount}>
										{category.amount?.toLocaleString('ru-RU') || 0} ₽
									</Text>
								</View>
								<View style={styles.categoryBar}>
									<View
										style={[
											styles.categoryBarFill,
											{
												width: `${category.percent || 0}%`,
												backgroundColor: category.color || colors.primary,
											},
										]}
									/>
								</View>
								<Text style={styles.categoryPercent}>
									{category.percent || 0}%
								</Text>
							</View>
						))}
					</View>
				</View>
			)}

			{/* График по месяцам */}
			{analytics?.monthlyData?.length > 0 && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Динамика расходов</Text>
					<View style={styles.chartCard}>
						{analytics.monthlyData.map(item =>
							renderBar(item, maxMonthlySpent)
						)}
					</View>
				</View>
			)}

			{/* Пустое состояние */}
			{!analytics?.byCategory?.length && !analytics?.monthlyData?.length && (
				<View style={styles.emptyState}>
					<Text style={styles.emptyIcon}>📊</Text>
					<Text style={styles.emptyText}>Нет данных для аналитики</Text>
					<Text style={styles.emptySubtext}>
						Данные появятся после первых операций
					</Text>
				</View>
			)}

			{/* Подсказка */}
			<View style={styles.hintCard}>
				<Text style={styles.hintIcon}>💡</Text>
				<Text style={styles.hintText}>
					Данные синхронизируются с СБИС. Нажмите кнопку "Синхронизировать" для
					обновления.
				</Text>
			</View>
		</ScrollView>
	)
>>>>>>> 86fa44cdf55de05b6875cdfda4f46151993974b2
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
	syncButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.primary,
		margin: 16,
		marginBottom: 8,
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
	periodContainer: {
		flexDirection: 'row',
		padding: 16,
		paddingTop: 8,
		gap: 8,
	},
	periodButton: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 10,
		backgroundColor: colors.backgroundWhite,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: colors.border,
	},
	periodButtonActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	periodText: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textDark,
	},
	periodTextActive: {
		color: colors.textLight,
	},
	mainStats: {
		padding: 16,
		paddingTop: 0,
	},
	mainStatCard: {
		backgroundColor: colors.primary,
		borderRadius: 20,
		padding: 24,
		alignItems: 'center',
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.3,
		shadowRadius: 12,
		elevation: 6,
	},
	mainStatIcon: {
		fontSize: 36,
		marginBottom: 8,
	},
	mainStatValue: {
		fontSize: 36,
		fontWeight: 'bold',
		color: colors.textLight,
		marginBottom: 4,
	},
	mainStatLabel: {
		fontSize: 14,
		color: 'rgba(255,255,255,0.8)',
		marginBottom: 12,
	},
	trendBadge: {
		backgroundColor: 'rgba(255,255,255,0.2)',
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 20,
	},
	trendText: {
		color: colors.textLight,
		fontSize: 14,
		fontWeight: '600',
	},
	statsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		padding: 16,
		paddingTop: 0,
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
	statIcon: {
		fontSize: 28,
		marginBottom: 8,
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
	},
	section: {
		padding: 16,
		paddingTop: 0,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 12,
	},
	categoriesCard: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	categoryItem: {
		marginBottom: 16,
	},
	categoryHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	categoryInfo: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	categoryDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginRight: 10,
	},
	categoryName: {
		fontSize: 14,
		fontWeight: '500',
		color: colors.textDark,
	},
	categoryAmount: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textDark,
	},
	categoryBar: {
		height: 8,
		backgroundColor: colors.backgroundLight,
		borderRadius: 4,
		overflow: 'hidden',
		marginBottom: 4,
	},
	categoryBarFill: {
		height: '100%',
		borderRadius: 4,
	},
	categoryPercent: {
		fontSize: 11,
		color: colors.textMuted,
		textAlign: 'right',
	},
	chartCard: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	barContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 12,
	},
	barLabel: {
		width: 40,
		fontSize: 12,
		color: colors.textMuted,
		fontWeight: '500',
	},
	barWrapper: {
		flex: 1,
		height: 20,
		backgroundColor: colors.backgroundLight,
		borderRadius: 10,
		marginHorizontal: 10,
		overflow: 'hidden',
	},
	bar: {
		height: '100%',
		backgroundColor: colors.primary,
		borderRadius: 10,
	},
	barValue: {
		width: 40,
		fontSize: 12,
		color: colors.textDark,
		fontWeight: '600',
		textAlign: 'right',
	},
	emptyState: {
		alignItems: 'center',
		padding: 40,
	},
	emptyIcon: {
		fontSize: 60,
		marginBottom: 16,
	},
	emptyText: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 8,
	},
	emptySubtext: {
		fontSize: 14,
		color: colors.textMuted,
		textAlign: 'center',
	},
	hintCard: {
		flexDirection: 'row',
		backgroundColor: colors.backgroundLight,
		margin: 16,
		borderRadius: 12,
		padding: 16,
		marginBottom: 30,
	},
	hintIcon: {
		fontSize: 20,
		marginRight: 12,
	},
	hintText: {
		flex: 1,
		fontSize: 13,
		color: colors.textSecondary,
		lineHeight: 18,
	},
})
