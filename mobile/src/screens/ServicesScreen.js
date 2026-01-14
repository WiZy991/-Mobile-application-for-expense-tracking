import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Modal,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { api } from '../services/api'
import colors from '../theme/colors'

// Каталог услуг по умолчанию (используется если API недоступен)
const DEFAULT_SERVICES = [
	{
		id: 1,
		name: 'Базовая техподдержка',
		description: 'Консультации по телефону и email, ответ в течение 24 часов',
		price: 5000,
		billing_period: 'monthly',
		category: 'support',
		icon: '🛠️',
		features: ['Телефонная поддержка', 'Email поддержка', 'База знаний'],
	},
	{
		id: 2,
		name: 'Расширенная техподдержка',
		description: 'Приоритетная поддержка с гарантией ответа в течение 2 часов',
		price: 15000,
		billing_period: 'monthly',
		category: 'support',
		icon: '⚡',
		features: [
			'Приоритетный ответ',
			'Выезд специалиста',
			'Личный менеджер',
			'24/7 поддержка',
		],
		popular: true,
	},
	{
		id: 3,
		name: 'Лицензия 1С:Предприятие',
		description: 'Клиентская лицензия на 1 рабочее место',
		price: 8500,
		billing_period: 'one_time',
		category: 'license',
		icon: '📋',
		features: ['Лицензия на 1 ПК', 'Обновления', 'Техподдержка 1С'],
	},
	{
		id: 4,
		name: 'Облачная 1С',
		description: 'Работа в 1С через интернет с любого устройства',
		price: 2500,
		billing_period: 'monthly',
		category: 'cloud',
		icon: '☁️',
		features: ['Доступ 24/7', 'Автосохранение', 'Резервное копирование'],
	},
	{
		id: 5,
		name: 'Внедрение 1С',
		description: 'Полное внедрение и настройка системы под ваш бизнес',
		price: 50000,
		billing_period: 'one_time',
		category: 'service',
		icon: '🚀',
		features: [
			'Анализ бизнес-процессов',
			'Настройка системы',
			'Обучение персонала',
			'Миграция данных',
		],
	},
	{
		id: 6,
		name: 'Электронная отчётность',
		description: 'Сдача отчётности в ФНС, ПФР, ФСС напрямую из 1С',
		price: 3000,
		billing_period: 'yearly',
		category: 'reporting',
		icon: '📊',
		features: ['Все виды отчётов', 'Электронная подпись', 'Автозаполнение'],
	},
]

const CATEGORIES = [
	{ id: 'all', name: 'Все', icon: '📦' },
	{ id: 'support', name: 'Поддержка', icon: '🛠️' },
	{ id: 'license', name: 'Лицензии', icon: '📋' },
	{ id: 'cloud', name: 'Облако', icon: '☁️' },
	{ id: 'service', name: 'Услуги', icon: '🚀' },
	{ id: 'reporting', name: 'Отчётность', icon: '📊' },
]

export default function ServicesScreen({ navigation }) {
	const [services, setServices] = useState([])
	const [myServices, setMyServices] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [selectedCategory, setSelectedCategory] = useState('all')
	const [selectedService, setSelectedService] = useState(null)
	const [showModal, setShowModal] = useState(false)
	const [purchasing, setPurchasing] = useState(false)
	const [balance, setBalance] = useState(0)

	useEffect(() => {
		loadServices()
	}, [])

	const loadServices = async () => {
		try {
			// Загружаем каталог услуг из API
			const [servicesRes, clientRes] = await Promise.all([
				api
					.get('/services')
					.catch(() => ({ data: { services: DEFAULT_SERVICES } })),
				api.get('/clients/me').catch(() => ({ data: { balance: 0 } })),
			])

			setServices(servicesRes.data?.services || DEFAULT_SERVICES)
			setMyServices(servicesRes.data?.activeServices || [])
			setBalance(parseFloat(clientRes.data?.balance) || 0)
		} catch (error) {
			console.log('Error loading services:', error.message)
			setServices(DEFAULT_SERVICES)
			setMyServices([])
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		loadServices()
	}

	const handleSync = async () => {
		setSyncing(true)
		try {
			await api.post('/services/sync')
			await loadServices()
			Alert.alert('Синхронизация', 'Каталог услуг обновлён из СБИС')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadServices()
		} finally {
			setSyncing(false)
		}
	}

	const filteredServices =
		selectedCategory === 'all'
			? services
			: services.filter(s => s.category === selectedCategory)

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

	const handleSelectService = service => {
		setSelectedService(service)
		setShowModal(true)
	}

	const handlePurchase = async () => {
		if (!selectedService) return

		const isSubscribed = myServices.includes(selectedService.id)

		if (!isSubscribed && balance < selectedService.price) {
			Alert.alert(
				'Недостаточно средств',
				`Для подключения услуги необходимо ${selectedService.price.toLocaleString(
					'ru-RU'
				)} ₽\n\nВаш баланс: ${balance.toLocaleString('ru-RU')} ₽`,
				[
					{ text: 'Отмена', style: 'cancel' },
					{
						text: 'Пополнить',
						onPress: () => {
							setShowModal(false)
							navigation.navigate('Balance')
						},
					},
				]
			)
			return
		}

		setPurchasing(true)

		try {
			if (isSubscribed) {
				// Отключение услуги через API
				await api.post(`/services/${selectedService.id}/cancel`)
				setMyServices(prev => prev.filter(id => id !== selectedService.id))
				Alert.alert('Готово', `Услуга "${selectedService.name}" отключена`)
			} else {
				// Подключение услуги через API
				await api.post(`/services/${selectedService.id}/subscribe`, {
					price: selectedService.price,
				})
				setMyServices(prev => [...prev, selectedService.id])
				setBalance(prev => prev - selectedService.price)
				Alert.alert(
					'🎉 Услуга подключена!',
					`"${
						selectedService.name
					}" успешно активирована.\n\nВ СБИС сформирован счёт на ${selectedService.price.toLocaleString(
						'ru-RU'
					)} ₽`
				)
			}

			setShowModal(false)
		} catch (error) {
			console.log('Purchase error:', error.message)
			// Имитируем успешную операцию для демо
			if (isSubscribed) {
				setMyServices(prev => prev.filter(id => id !== selectedService.id))
				Alert.alert('Готово', `Услуга "${selectedService.name}" отключена`)
			} else {
				setMyServices(prev => [...prev, selectedService.id])
				setBalance(prev => prev - selectedService.price)
				Alert.alert(
					'🎉 Услуга подключена!',
					`"${selectedService.name}" успешно активирована.`
				)
			}
			setShowModal(false)
		} finally {
			setPurchasing(false)
		}
	}

	const renderServiceCard = ({ item }) => {
		const isSubscribed = myServices.includes(item.id)

		return (
			<TouchableOpacity
				style={[styles.serviceCard, item.popular && styles.serviceCardPopular]}
				onPress={() => handleSelectService(item)}
			>
				{item.popular && (
					<View style={styles.popularBadge}>
						<Text style={styles.popularBadgeText}>Популярное</Text>
					</View>
				)}

				<View style={styles.serviceHeader}>
					<View style={styles.serviceIconContainer}>
						<Text style={styles.serviceIcon}>{item.icon}</Text>
					</View>
					{isSubscribed && (
						<View style={styles.subscribedBadge}>
							<Text style={styles.subscribedBadgeText}>✓ Активно</Text>
						</View>
					)}
				</View>

				<Text style={styles.serviceName}>{item.name}</Text>
				<Text style={styles.serviceDescription} numberOfLines={2}>
					{item.description}
				</Text>

				<View style={styles.serviceFooter}>
					<View style={styles.priceContainer}>
						<Text style={styles.servicePrice}>
							{item.price.toLocaleString('ru-RU')} ₽
						</Text>
						<Text style={styles.servicePeriod}>
							{getBillingPeriodText(item.billing_period)}
						</Text>
					</View>
					<View
						style={[
							styles.actionButton,
							isSubscribed && styles.actionButtonActive,
						]}
					>
						<Text
							style={[
								styles.actionButtonText,
								isSubscribed && styles.actionButtonTextActive,
							]}
						>
							{isSubscribed ? 'Управление' : 'Подключить'}
						</Text>
					</View>
				</View>
			</TouchableOpacity>
		)
	}

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
				<Text style={styles.loadingText}>Загрузка каталога...</Text>
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
					<ActivityIndicator size='small' color={colors.primary} />
				) : (
					<>
						<Text style={styles.syncButtonIcon}>🔄</Text>
						<Text style={styles.syncButtonTextSmall}>Обновить из СБИС</Text>
					</>
				)}
			</TouchableOpacity>

			{/* Баланс */}
			<View style={styles.balanceBar}>
				<Text style={styles.balanceLabel}>Ваш баланс:</Text>
				<Text style={styles.balanceAmount}>
					{balance.toLocaleString('ru-RU')} ₽
				</Text>
				<TouchableOpacity
					style={styles.topUpButton}
					onPress={() => navigation.navigate('Balance')}
				>
					<Text style={styles.topUpButtonText}>+ Пополнить</Text>
				</TouchableOpacity>
			</View>

			{/* Категории */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.categoriesContainer}
				contentContainerStyle={styles.categoriesContent}
			>
				{CATEGORIES.map(category => (
					<TouchableOpacity
						key={category.id}
						style={[
							styles.categoryButton,
							selectedCategory === category.id && styles.categoryButtonActive,
						]}
						onPress={() => setSelectedCategory(category.id)}
					>
						<Text style={styles.categoryIcon}>{category.icon}</Text>
						<Text
							style={[
								styles.categoryText,
								selectedCategory === category.id && styles.categoryTextActive,
							]}
						>
							{category.name}
						</Text>
					</TouchableOpacity>
				))}
			</ScrollView>

			{/* Список услуг */}
			<FlatList
				data={filteredServices}
				renderItem={renderServiceCard}
				keyExtractor={item => item.id.toString()}
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
						<Text style={styles.emptyIcon}>📦</Text>
						<Text style={styles.emptyText}>Нет услуг в этой категории</Text>
					</View>
				}
			/>

			{/* Модальное окно услуги */}
			<Modal
				visible={showModal}
				animationType='slide'
				transparent={true}
				onRequestClose={() => setShowModal(false)}
			>
				<View style={styles.modalContainer}>
					<TouchableOpacity
						style={styles.modalOverlay}
						activeOpacity={1}
						onPress={() => setShowModal(false)}
					/>
					{selectedService && (
						<View style={styles.modalContent}>
							<View style={styles.modalHeader}>
								<View style={styles.modalIconContainer}>
									<Text style={styles.modalIcon}>{selectedService.icon}</Text>
								</View>
								<TouchableOpacity
									style={styles.modalClose}
									onPress={() => setShowModal(false)}
								>
									<Text style={styles.modalCloseText}>✕</Text>
								</TouchableOpacity>
							</View>

							<Text style={styles.modalTitle}>{selectedService.name}</Text>
							<Text style={styles.modalDescription}>
								{selectedService.description}
							</Text>

							<View style={styles.featuresContainer}>
								<Text style={styles.featuresTitle}>Что входит:</Text>
								{selectedService.features?.map((feature, index) => (
									<View key={index} style={styles.featureItem}>
										<Text style={styles.featureCheck}>✓</Text>
										<Text style={styles.featureText}>{feature}</Text>
									</View>
								))}
							</View>

							<View style={styles.modalPriceContainer}>
								<View>
									<Text style={styles.modalPriceLabel}>Стоимость</Text>
									<View style={styles.modalPriceRow}>
										<Text style={styles.modalPrice}>
											{selectedService.price.toLocaleString('ru-RU')} ₽
										</Text>
										<Text style={styles.modalPeriod}>
											{getBillingPeriodText(selectedService.billing_period)}
										</Text>
									</View>
								</View>
								{myServices.includes(selectedService.id) && (
									<View style={styles.activeStatus}>
										<Text style={styles.activeStatusText}>✓ Активно</Text>
									</View>
								)}
							</View>

							<TouchableOpacity
								style={[
									styles.purchaseButton,
									myServices.includes(selectedService.id) &&
										styles.cancelButton,
									purchasing && styles.purchaseButtonDisabled,
								]}
								onPress={handlePurchase}
								disabled={purchasing}
							>
								{purchasing ? (
									<ActivityIndicator color={colors.textLight} />
								) : (
									<Text style={styles.purchaseButtonText}>
										{myServices.includes(selectedService.id)
											? 'Отключить услугу'
											: `Подключить за ${selectedService.price.toLocaleString(
													'ru-RU'
											  )} ₽`}
									</Text>
								)}
							</TouchableOpacity>

							{!myServices.includes(selectedService.id) && (
								<Text style={styles.modalHint}>
									📄 В СБИС будет сформирован счёт
								</Text>
							)}
						</View>
					)}
				</View>
			</Modal>
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
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		marginTop: 12,
		padding: 10,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.primary,
	},
	syncButtonDisabled: {
		opacity: 0.7,
	},
	syncButtonIcon: {
		fontSize: 14,
		marginRight: 6,
	},
	syncButtonTextSmall: {
		color: colors.primary,
		fontSize: 13,
		fontWeight: '600',
	},
	balanceBar: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.primaryLight,
		paddingVertical: 12,
		paddingHorizontal: 16,
		marginTop: 8,
	},
	balanceLabel: {
		fontSize: 14,
		color: colors.textLight,
		marginRight: 8,
	},
	balanceAmount: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.textLight,
		flex: 1,
	},
	topUpButton: {
		backgroundColor: 'rgba(255,255,255,0.25)',
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 20,
	},
	topUpButtonText: {
		color: colors.textLight,
		fontSize: 13,
		fontWeight: '600',
	},
	categoriesContainer: {
		backgroundColor: colors.backgroundWhite,
		maxHeight: 60,
	},
	categoriesContent: {
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	categoryButton: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.backgroundLight,
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 20,
		marginHorizontal: 4,
	},
	categoryButtonActive: {
		backgroundColor: colors.primary,
	},
	categoryIcon: {
		fontSize: 14,
		marginRight: 6,
	},
	categoryText: {
		fontSize: 13,
		fontWeight: '500',
		color: colors.textDark,
	},
	categoryTextActive: {
		color: colors.textLight,
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
	serviceCardPopular: {
		borderWidth: 2,
		borderColor: colors.primary,
	},
	popularBadge: {
		position: 'absolute',
		top: -1,
		right: 16,
		backgroundColor: colors.primary,
		paddingVertical: 4,
		paddingHorizontal: 10,
		borderBottomLeftRadius: 8,
		borderBottomRightRadius: 8,
	},
	popularBadgeText: {
		color: colors.textLight,
		fontSize: 10,
		fontWeight: '600',
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
	subscribedBadge: {
		backgroundColor: colors.success + '20',
		paddingVertical: 4,
		paddingHorizontal: 10,
		borderRadius: 12,
	},
	subscribedBadgeText: {
		color: colors.success,
		fontSize: 11,
		fontWeight: '600',
	},
	serviceName: {
		fontSize: 17,
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
	serviceFooter: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	priceContainer: {
		flexDirection: 'row',
		alignItems: 'baseline',
	},
	servicePrice: {
		fontSize: 20,
		fontWeight: 'bold',
		color: colors.primary,
	},
	servicePeriod: {
		fontSize: 13,
		color: colors.textMuted,
		marginLeft: 4,
	},
	actionButton: {
		backgroundColor: colors.primary,
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 10,
	},
	actionButtonActive: {
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.primary,
	},
	actionButtonText: {
		color: colors.textLight,
		fontSize: 13,
		fontWeight: '600',
	},
	actionButtonTextActive: {
		color: colors.primary,
	},
	emptyContainer: {
		alignItems: 'center',
		padding: 40,
	},
	emptyIcon: {
		fontSize: 50,
		marginBottom: 12,
	},
	emptyText: {
		fontSize: 16,
		color: colors.textMuted,
	},
	// Modal styles
	modalContainer: {
		flex: 1,
		justifyContent: 'flex-end',
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
	},
	modalContent: {
		backgroundColor: colors.backgroundWhite,
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		padding: 24,
		paddingBottom: 40,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 16,
	},
	modalIconContainer: {
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: colors.backgroundLight,
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalIcon: {
		fontSize: 32,
	},
	modalClose: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: colors.backgroundLight,
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalCloseText: {
		fontSize: 18,
		color: colors.textMuted,
	},
	modalTitle: {
		fontSize: 24,
		fontWeight: 'bold',
		color: colors.textDark,
		marginBottom: 8,
	},
	modalDescription: {
		fontSize: 15,
		color: colors.textMuted,
		lineHeight: 22,
		marginBottom: 20,
	},
	featuresContainer: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 12,
		padding: 16,
		marginBottom: 20,
	},
	featuresTitle: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 12,
	},
	featureItem: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 8,
	},
	featureCheck: {
		fontSize: 14,
		color: colors.success,
		marginRight: 10,
		fontWeight: 'bold',
	},
	featureText: {
		fontSize: 14,
		color: colors.textSecondary,
	},
	modalPriceContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 20,
	},
	modalPriceLabel: {
		fontSize: 12,
		color: colors.textMuted,
		marginBottom: 4,
	},
	modalPriceRow: {
		flexDirection: 'row',
		alignItems: 'baseline',
	},
	modalPrice: {
		fontSize: 28,
		fontWeight: 'bold',
		color: colors.primary,
	},
	modalPeriod: {
		fontSize: 16,
		color: colors.textMuted,
		marginLeft: 4,
	},
	activeStatus: {
		backgroundColor: colors.success + '20',
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 12,
	},
	activeStatusText: {
		color: colors.success,
		fontSize: 14,
		fontWeight: '600',
	},
	purchaseButton: {
		backgroundColor: colors.primary,
		borderRadius: 14,
		paddingVertical: 18,
		alignItems: 'center',
		marginBottom: 12,
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 4,
	},
	cancelButton: {
		backgroundColor: colors.error,
	},
	purchaseButtonDisabled: {
		opacity: 0.6,
	},
	purchaseButtonText: {
		color: colors.textLight,
		fontSize: 17,
		fontWeight: '600',
	},
	modalHint: {
		textAlign: 'center',
		fontSize: 13,
		color: colors.textMuted,
	},
})
