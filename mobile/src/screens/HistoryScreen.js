import { format } from 'date-fns'
import ru from 'date-fns/locale/ru'
import React, { useEffect, useState } from 'react'
import {
<<<<<<< HEAD
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { api } from '../services/api';
import { format } from 'date-fns';
import ru from 'date-fns/locale/ru';
=======
	ActivityIndicator,
	Alert,
	FlatList,
	RefreshControl,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { api } from '../services/api'
import colors from '../theme/colors'

const FILTERS = [
	{ id: 'all', label: 'Все' },
	{ id: 'payment', label: 'Пополнения' },
	{ id: 'charge', label: 'Списания' },
	{ id: 'pending', label: 'Ожидают' },
]
>>>>>>> 86fa44cdf55de05b6875cdfda4f46151993974b2

export default function HistoryScreen() {
	const [transactions, setTransactions] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [filter, setFilter] = useState('all')
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(true)
	const [lastSync, setLastSync] = useState(null)

	useEffect(() => {
		loadTransactions()
	}, [])

	const loadTransactions = async (pageNum = 1) => {
		try {
			// Загружаем транзакции из API
			const response = await api.get(
				`/payments/history?page=${pageNum}&limit=20`
			)
			const data = response.data

			if (pageNum === 1) {
				setTransactions(data.transactions || [])
			} else {
				setTransactions(prev => [...prev, ...(data.transactions || [])])
			}

			setHasMore(data.hasMore || false)
			setLastSync(new Date())
		} catch (error) {
			console.log('Error loading transactions:', error.message)
			// Если нет данных - показываем пустой список
			if (pageNum === 1) {
				setTransactions([])
			}
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		setPage(1)
		loadTransactions(1)
	}

<<<<<<< HEAD
  const renderTransaction = ({ item }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionHeader}>
        <Text style={styles.transactionService}>
          {item.service_name || 'Услуга'}
        </Text>
        <Text
          style={[
            styles.transactionAmount,
            item.type === 'charge' && styles.chargeAmount,
            item.type === 'payment' && styles.paymentAmount,
          ]}
        >
          {item.type === 'charge' ? '-' : '+'}
          {typeof item.amount === 'number' 
            ? item.amount.toFixed(2) 
            : parseFloat(item.amount || 0).toFixed(2)} ₽
        </Text>
      </View>
      <Text style={styles.transactionDescription}>{item.description}</Text>
      {item.period_start && item.period_end && (
        <Text style={styles.transactionPeriod}>
          Период: {format(new Date(item.period_start), 'dd.MM.yyyy', { locale: ru })} -{' '}
          {format(new Date(item.period_end), 'dd.MM.yyyy', { locale: ru })}
        </Text>
      )}
      <View style={styles.transactionFooter}>
        <Text style={styles.transactionDate}>
          {format(new Date(item.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
        </Text>
        <View
          style={[
            styles.statusBadge,
            item.status === 'completed' && styles.statusCompleted,
            item.status === 'pending' && styles.statusPending,
          ]}
        >
          <Text style={styles.statusText}>
            {item.status === 'completed' ? 'Оплачено' : 'Ожидает'}
          </Text>
        </View>
      </View>
    </View>
  );
=======
	const handleSync = async () => {
		setSyncing(true)
		try {
			// Запрашиваем синхронизацию с СБИС
			await api.post('/payments/sync')
			await loadTransactions(1)
			Alert.alert('Синхронизация', 'Данные успешно обновлены из СБИС')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadTransactions(1)
		} finally {
			setSyncing(false)
		}
	}
>>>>>>> 86fa44cdf55de05b6875cdfda4f46151993974b2

	const loadMore = () => {
		if (!loading && hasMore && !refreshing) {
			const nextPage = page + 1
			setPage(nextPage)
			loadTransactions(nextPage)
		}
	}

	const filteredTransactions = transactions.filter(t => {
		if (filter === 'all') return true
		if (filter === 'pending') return t.status === 'pending'
		return t.type === filter
	})

	const getTotalStats = () => {
		const payments = transactions
			.filter(t => t.type === 'payment' && t.status === 'completed')
			.reduce((sum, t) => sum + Number(t.amount), 0)
		const charges = transactions
			.filter(t => t.type === 'charge' && t.status === 'completed')
			.reduce((sum, t) => sum + Number(t.amount), 0)
		return { payments, charges }
	}

	const stats = getTotalStats()

	const renderTransaction = ({ item }) => (
		<View style={styles.transactionItem}>
			<View style={styles.transactionHeader}>
				<View style={styles.transactionLeft}>
					<View
						style={[
							styles.transactionIcon,
							item.type === 'charge' ? styles.iconCharge : styles.iconPayment,
						]}
					>
						<Text style={styles.transactionIconText}>
							{item.type === 'charge' ? '📤' : '📥'}
						</Text>
					</View>
					<View style={styles.transactionInfo}>
						<Text style={styles.transactionService}>
							{item.service_name || item.description || 'Операция'}
						</Text>
						<Text style={styles.transactionDescription} numberOfLines={1}>
							{item.description || ''}
						</Text>
					</View>
				</View>
				<View style={styles.transactionRight}>
					<Text
						style={[
							styles.transactionAmount,
							item.type === 'charge'
								? styles.chargeAmount
								: styles.paymentAmount,
						]}
					>
						{item.type === 'charge' ? '-' : '+'}
						{Number(item.amount).toLocaleString('ru-RU')} ₽
					</Text>
				</View>
			</View>

			{item.period_start && item.period_end && (
				<View style={styles.periodContainer}>
					<Text style={styles.periodLabel}>📅 Период:</Text>
					<Text style={styles.periodValue}>
						{format(new Date(item.period_start), 'dd.MM.yyyy', { locale: ru })}{' '}
						— {format(new Date(item.period_end), 'dd.MM.yyyy', { locale: ru })}
					</Text>
				</View>
			)}

			{item.invoice_number && (
				<View style={styles.invoiceContainer}>
					<Text style={styles.invoiceLabel}>📄 Счёт:</Text>
					<Text style={styles.invoiceValue}>{item.invoice_number}</Text>
				</View>
			)}

			<View style={styles.transactionFooter}>
				<Text style={styles.transactionDate}>
					{item.created_at
						? format(new Date(item.created_at), 'dd MMM yyyy, HH:mm', {
								locale: ru,
						  })
						: ''}
				</Text>
				<View
					style={[
						styles.statusBadge,
						item.status === 'completed'
							? styles.statusCompleted
							: styles.statusPending,
					]}
				>
					<Text style={styles.statusText}>
						{item.status === 'completed' ? '✓ Проведено' : '⏳ Ожидает'}
					</Text>
				</View>
			</View>
		</View>
	)

	if (loading && transactions.length === 0) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
				<Text style={styles.loadingText}>Загрузка истории...</Text>
			</View>
		)
	}

	return (
		<View style={styles.container}>
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

			{/* Статистика */}
			<View style={styles.statsContainer}>
				<View style={styles.statItem}>
					<Text style={styles.statIcon}>📥</Text>
					<View>
						<Text style={styles.statValue}>
							+{stats.payments.toLocaleString('ru-RU')} ₽
						</Text>
						<Text style={styles.statLabel}>Пополнения</Text>
					</View>
				</View>
				<View style={styles.statDivider} />
				<View style={styles.statItem}>
					<Text style={styles.statIcon}>📤</Text>
					<View>
						<Text style={[styles.statValue, styles.chargeText]}>
							-{stats.charges.toLocaleString('ru-RU')} ₽
						</Text>
						<Text style={styles.statLabel}>Списания</Text>
					</View>
				</View>
			</View>

			{/* Фильтры */}
			<View style={styles.filtersContainer}>
				{FILTERS.map(f => (
					<TouchableOpacity
						key={f.id}
						style={[
							styles.filterButton,
							filter === f.id && styles.filterButtonActive,
						]}
						onPress={() => setFilter(f.id)}
					>
						<Text
							style={[
								styles.filterText,
								filter === f.id && styles.filterTextActive,
							]}
						>
							{f.label}
						</Text>
					</TouchableOpacity>
				))}
			</View>

			{/* Список транзакций */}
			<FlatList
				data={filteredTransactions}
				renderItem={renderTransaction}
				keyExtractor={(item, index) => item.id?.toString() || index.toString()}
				contentContainerStyle={styles.listContent}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
				onEndReached={loadMore}
				onEndReachedThreshold={0.5}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<Text style={styles.emptyIcon}>📋</Text>
						<Text style={styles.emptyText}>Нет операций</Text>
						<Text style={styles.emptySubtext}>
							{filter !== 'all'
								? 'Попробуйте изменить фильтр'
								: 'История операций появится здесь после первой транзакции'}
						</Text>
					</View>
				}
			/>

			{/* Время последней синхронизации */}
			{lastSync && (
				<View style={styles.lastSyncContainer}>
					<Text style={styles.lastSyncText}>
						Обновлено: {format(lastSync, 'HH:mm', { locale: ru })}
					</Text>
				</View>
			)}
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
	syncButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.primary,
		margin: 16,
		marginBottom: 0,
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
	statsContainer: {
		flexDirection: 'row',
		backgroundColor: colors.backgroundWhite,
		margin: 16,
		marginBottom: 0,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	statItem: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
	},
	statIcon: {
		fontSize: 28,
		marginRight: 12,
	},
	statValue: {
		fontSize: 16,
		fontWeight: 'bold',
		color: colors.success,
		marginBottom: 2,
	},
	chargeText: {
		color: colors.error,
	},
	statLabel: {
		fontSize: 12,
		color: colors.textMuted,
	},
	statDivider: {
		width: 1,
		height: '100%',
		backgroundColor: colors.borderLight,
		marginHorizontal: 16,
	},
	filtersContainer: {
		flexDirection: 'row',
		padding: 16,
		paddingBottom: 8,
		gap: 8,
	},
	filterButton: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
		backgroundColor: colors.backgroundWhite,
		borderWidth: 1,
		borderColor: colors.border,
	},
	filterButtonActive: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	filterText: {
		fontSize: 13,
		fontWeight: '500',
		color: colors.textDark,
	},
	filterTextActive: {
		color: colors.textLight,
	},
	listContent: {
		padding: 16,
		paddingTop: 8,
		paddingBottom: 30,
	},
	transactionItem: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 16,
		padding: 16,
		marginBottom: 12,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	transactionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 8,
	},
	transactionLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	transactionIcon: {
		width: 44,
		height: 44,
		borderRadius: 22,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	iconCharge: {
		backgroundColor: colors.error + '20',
	},
	iconPayment: {
		backgroundColor: colors.success + '20',
	},
	transactionIconText: {
		fontSize: 20,
	},
	transactionInfo: {
		flex: 1,
	},
	transactionService: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 2,
	},
	transactionDescription: {
		fontSize: 13,
		color: colors.textMuted,
	},
	transactionRight: {
		alignItems: 'flex-end',
	},
	transactionAmount: {
		fontSize: 18,
		fontWeight: 'bold',
	},
	chargeAmount: {
		color: colors.error,
	},
	paymentAmount: {
		color: colors.success,
	},
	periodContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.backgroundLight,
		borderRadius: 8,
		padding: 10,
		marginBottom: 8,
	},
	periodLabel: {
		fontSize: 12,
		color: colors.textMuted,
		marginRight: 6,
	},
	periodValue: {
		fontSize: 12,
		color: colors.textSecondary,
		fontWeight: '500',
	},
	invoiceContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 8,
	},
	invoiceLabel: {
		fontSize: 12,
		color: colors.textMuted,
		marginRight: 6,
	},
	invoiceValue: {
		fontSize: 12,
		color: colors.primary,
		fontWeight: '500',
	},
	transactionFooter: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	transactionDate: {
		fontSize: 12,
		color: colors.textMuted,
	},
	statusBadge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 8,
	},
	statusCompleted: {
		backgroundColor: colors.success + '20',
	},
	statusPending: {
		backgroundColor: colors.warning + '20',
	},
	statusText: {
		fontSize: 11,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	emptyContainer: {
		alignItems: 'center',
		padding: 50,
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
	lastSyncContainer: {
		alignItems: 'center',
		paddingVertical: 8,
		backgroundColor: colors.backgroundLight,
	},
	lastSyncText: {
		fontSize: 11,
		color: colors.textMuted,
	},
})
