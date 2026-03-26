import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	FlatList,
	RefreshControl,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { api } from '../services/api'
import colors from '../theme/colors'
import { format } from 'date-fns'
import ru from 'date-fns/locale/ru'

export default function MyServicesScreen({ navigation }) {
	const [myServices, setMyServices] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)

	useEffect(() => {
		loadMyServices()
	}, [])

	const loadMyServices = async () => {
		try {
			const response = await api.get('/services/my-services')
			setMyServices(response.data || [])
		} catch (error) {
			console.log('Error loading my services:', error.message)
			setMyServices([])
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		loadMyServices()
	}

	const handleCancelService = async (serviceId, serviceName) => {
		Alert.alert(
			'Отключить услугу',
			`Вы уверены, что хотите отключить услугу "${serviceName}"?`,
			[
				{ text: 'Отмена', style: 'cancel' },
				{
					text: 'Отключить',
					style: 'destructive',
					onPress: async () => {
						try {
							const response = await api.post(`/services/${serviceId}/cancel`)
							if (response.data.success) {
								Alert.alert('Готово', `Услуга "${serviceName}" отключена`)
								await loadMyServices()
							}
						} catch (error) {
							console.error('Cancel service error:', error)
							Alert.alert(
								'Ошибка',
								error.response?.data?.error || 'Не удалось отключить услугу'
							)
						}
					},
				},
			]
		)
	}

	const getBillingPeriodText = period => {
		switch (period) {
			case 'monthly':
				return '/мес'
			case 'yearly':
				return '/год'
			case 'one_time':
				return 'разово'
			default:
				return ''
		}
	}

	const formatDate = dateString => {
		if (!dateString) return 'Не указано'
		try {
			return format(new Date(dateString), 'dd MMM yyyy', { locale: ru })
		} catch {
			return 'Не указано'
		}
	}

	const renderServiceCard = ({ item }) => {
		const isActive = item.is_active

		return (
			<View style={styles.serviceCard}>
				<View style={styles.serviceHeader}>
					<View style={styles.serviceIconContainer}>
						<MaterialIcons name="description" size={32} color={colors.primary} />
					</View>
					<View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
						<Text style={styles.statusText}>
							{isActive ? '✓ Активно' : '× Отключено'}
						</Text>
					</View>
				</View>

				<Text style={styles.serviceName}>{item.name}</Text>
				{item.description && (
					<Text style={styles.serviceDescription} numberOfLines={2}>
						{item.description}
					</Text>
				)}

				<View style={styles.serviceInfo}>
					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Стоимость:</Text>
						<Text style={styles.infoValue}>
							{parseFloat(item.price || 0).toLocaleString('ru-RU')} ₽{' '}
							{getBillingPeriodText(item.billing_period)}
						</Text>
					</View>
					{item.start_date && (
						<View style={styles.infoRow}>
							<Text style={styles.infoLabel}>Подключено:</Text>
							<Text style={styles.infoValue}>{formatDate(item.start_date)}</Text>
						</View>
					)}
					{item.end_date && (
						<View style={styles.infoRow}>
							<Text style={styles.infoLabel}>Действует до:</Text>
							<Text style={styles.infoValue}>{formatDate(item.end_date)}</Text>
						</View>
					)}
				</View>

				{isActive && (
					<TouchableOpacity
						style={styles.cancelButton}
						onPress={() => handleCancelService(item.service_id, item.name)}
					>
						<Text style={styles.cancelButtonText}>Отключить услугу</Text>
					</TouchableOpacity>
				)}
			</View>
		)
	}

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
				<Text style={styles.loadingText}>Загрузка услуг...</Text>
			</View>
		)
	}

	return (
		<View style={styles.container}>
			<FlatList
				data={myServices}
				renderItem={renderServiceCard}
				keyExtractor={item => `${item.id}-${item.service_id}`}
				contentContainerStyle={styles.listContent}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={colors.primary}
					/>
				}
				ListEmptyComponent={
					<View style={styles.emptyContainer}>
						<MaterialIcons name="shopping-cart" size={48} color={colors.textMuted} />
						<Text style={styles.emptyText}>У вас нет подключенных услуг</Text>
						<Text style={styles.emptySubtext}>
							Перейдите в каталог услуг, чтобы подключить услуги
						</Text>
						<TouchableOpacity
							style={styles.goToCatalogButton}
							onPress={() => navigation.navigate('Services')}
						>
							<Text style={styles.goToCatalogButtonText}>Перейти в каталог</Text>
						</TouchableOpacity>
					</View>
				}
			/>
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
	listContent: {
		padding: 16,
		paddingBottom: 30,
	},
	serviceCard: {
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
	serviceHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 12,
	},
	serviceIconContainer: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: colors.backgroundLight,
		justifyContent: 'center',
		alignItems: 'center',
	},
	serviceIcon: {
		fontSize: 24,
	},
	statusBadge: {
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 12,
	},
	statusActive: {
		backgroundColor: colors.success + '20',
	},
	statusInactive: {
		backgroundColor: colors.error + '20',
	},
	statusText: {
		fontSize: 12,
		fontWeight: '600',
		color: colors.textDark,
	},
	serviceName: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 6,
	},
	serviceDescription: {
		fontSize: 13,
		color: colors.textMuted,
		lineHeight: 18,
		marginBottom: 14,
	},
	serviceInfo: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 12,
		padding: 12,
		marginBottom: 12,
	},
	infoRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	infoRowLast: {
		marginBottom: 0,
	},
	infoLabel: {
		fontSize: 13,
		color: colors.textMuted,
	},
	infoValue: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textDark,
	},
	cancelButton: {
		backgroundColor: colors.error,
		borderRadius: 12,
		padding: 14,
		alignItems: 'center',
	},
	cancelButtonText: {
		color: colors.textLight,
		fontSize: 15,
		fontWeight: '600',
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
		marginBottom: 24,
	},
	goToCatalogButton: {
		backgroundColor: colors.primary,
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 24,
	},
	goToCatalogButtonText: {
		color: colors.textLight,
		fontSize: 15,
		fontWeight: '600',
	},
})
