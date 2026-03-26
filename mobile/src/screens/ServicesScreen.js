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
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons'
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
		icon: 'build',
		features: ['Телефонная поддержка', 'Email поддержка', 'База знаний'],
	},
	{
		id: 2,
		name: 'Расширенная техподдержка',
		description: 'Приоритетная поддержка с гарантией ответа в течение 2 часов',
		price: 15000,
		billing_period: 'monthly',
		category: 'support',
		icon: 'flash-on',
		features: [
			'Приоритетный ответ',
			'Выезд специалиста',
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
		icon: 'verified',
		features: ['Лицензия на 1 ПК', 'Обновления', 'Техподдержка 1С'],
	},
	{
		id: 4,
		name: 'Облачная 1С',
		description: 'Работа в 1С через интернет с любого устройства',
		price: 2500,
		billing_period: 'monthly',
		category: 'cloud',
		icon: 'cloud',
		features: ['Доступ 24/7', 'Автосохранение', 'Резервное копирование'],
	},
	{
		id: 5,
		name: 'Внедрение 1С',
		description: 'Полное внедрение и настройка системы под ваш бизнес',
		price: 50000,
		billing_period: 'one_time',
		category: 'service',
		icon: 'room-service',
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
		icon: 'assessment',
		features: ['Все виды отчётов', 'Электронная подпись', 'Автозаполнение'],
	},
]

const CATEGORIES = [
	{ id: 'all', name: 'Все', icon: 'apps', iconLibrary: 'MaterialIcons' },
	{ id: 'support', name: 'Поддержка', icon: 'support-agent', iconLibrary: 'MaterialIcons' },
	{ id: 'license', name: 'Лицензии', icon: 'verified', iconLibrary: 'MaterialIcons' },
	{ id: 'cloud', name: 'Облако', icon: 'cloud', iconLibrary: 'MaterialIcons' },
	{ id: 'service', name: 'Услуги', icon: 'room-service', iconLibrary: 'MaterialIcons' },
	{ id: 'reporting', name: 'Отчётность', icon: 'assessment', iconLibrary: 'MaterialIcons' },
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
	const [recommendations, setRecommendations] = useState([])
	const [showRecommendations, setShowRecommendations] = useState(false)

	useEffect(() => {
		loadServices()
		loadRecommendations()
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

			// Объединяем услуги из API с дефолтными, чтобы добавить features и другие поля
			const apiServices = servicesRes.data?.services || []
			
			// Если услуг из API нет или их мало, добавляем дефолтные
			if (apiServices.length === 0) {
				// Используем только дефолтные услуги
				setServices(DEFAULT_SERVICES)
			} else {
				// Обогащаем услуги из API данными из дефолтных
				const enrichedServices = apiServices.map(apiService => {
					// Ищем соответствующий дефолтный сервис для добавления features
					const defaultService = DEFAULT_SERVICES.find(ds => 
						ds.id === parseInt(apiService.id) || 
						ds.name === apiService.name ||
						apiService.code?.includes(`service_${ds.id}`)
					)
					
					return {
						...apiService,
						// Используем ID как число
						id: parseInt(apiService.id) || apiService.id,
						// Добавляем features, icon, category из дефолтного сервиса
						features: defaultService?.features || apiService.features || [],
						icon: defaultService?.icon || apiService.icon || 'description',
						category: defaultService?.category || apiService.category || 'other',
						popular: defaultService?.popular || apiService.popular || false,
						// Убеждаемся, что price есть
						price: parseFloat(apiService.price) || defaultService?.price || 0,
					}
				})
				
				// Добавляем дефолтные услуги, которых нет в API
				const defaultServiceIds = enrichedServices.map(s => s.id)
				const missingDefaults = DEFAULT_SERVICES.filter(ds => !defaultServiceIds.includes(ds.id))
				
				// Объединяем обогащенные услуги из API с недостающими дефолтными
				const finalServices = [...enrichedServices, ...missingDefaults]
				
				setServices(finalServices)
			}

			setMyServices(servicesRes.data?.activeServices || [])
			setBalance(parseFloat(clientRes.data?.balance) || 0)
		} catch (error) {
			console.log('Error loading services:', error.message)
			// В случае ошибки используем дефолтные услуги
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
		loadRecommendations()
	}

	const loadRecommendations = async () => {
		try {
			const response = await api.get('/recommendations')
			setRecommendations(response.data?.recommendations || [])
		} catch (error) {
			console.log('Error loading recommendations:', error.message)
			setRecommendations([])
		}
	}

	const handleSync = async () => {
		setSyncing(true)
		try {
			await api.post('/services/sync')
			await loadServices()
			Alert.alert('Синхронизация', 'Каталог услуг обновлён')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadServices()
		} finally {
			setSyncing(false)
		}
	}

	// Фильтруем услуги: показываем все услуги из каталога (независимо от того, подключены они или нет)
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
				try {
					const cancelResponse = await api.post(`/services/${selectedService.id}/cancel`)
					if (cancelResponse.data.success) {
						setMyServices(prev => prev.filter(id => id !== selectedService.id))
						// Обновляем данные после отключения
						await loadServices()
						Alert.alert('Готово', `Услуга "${selectedService.name}" отключена`)
						setShowModal(false)
					} else {
						Alert.alert('Ошибка', cancelResponse.data?.error || 'Не удалось отключить услугу')
					}
				} catch (cancelError) {
					console.error('Cancel service error:', cancelError)
					Alert.alert(
						'Ошибка',
						cancelError.response?.data?.error || 'Не удалось отключить услугу'
					)
				}
			} else {
				// Подключение услуги через API
				const subscribeResponse = await api.post(`/services/${selectedService.id}/subscribe`, {
					price: selectedService.price,
				})
				
				if (subscribeResponse.data.success) {
					// Обновляем состояние
					setMyServices(prev => [...prev, selectedService.id])
					
					// Обновляем баланс из ответа
					if (subscribeResponse.data.balance !== undefined) {
						setBalance(subscribeResponse.data.balance)
					} else {
						setBalance(prev => prev - selectedService.price)
					}
					
					// Загружаем обновленные данные
					await loadServices()
					
					// Загружаем рекомендации после покупки
					await loadRecommendations()
					setShowRecommendations(true)
					
					Alert.alert(
						'🎉 Услуга подключена!',
						`"${selectedService.name}" успешно активирована.\n\n` +
						`Списано: ${selectedService.price.toLocaleString('ru-RU')} ₽\n` +
						(subscribeResponse.data.balance !== undefined 
							? `Новый баланс: ${subscribeResponse.data.balance.toLocaleString('ru-RU')} ₽`
							: '')
					)
				}
			}

			setShowModal(false)
		} catch (error) {
			console.log('Purchase error:', error)
			
			const errorMessage = error.response?.data?.error || error.message || 'Не удалось выполнить операцию'
			
			if (error.response?.status === 400 && error.response?.data?.error === 'Недостаточно средств') {
				Alert.alert(
					'Недостаточно средств',
					`Для подключения услуги необходимо ${selectedService.price.toLocaleString('ru-RU')} ₽\n\n` +
					`Ваш баланс: ${balance.toLocaleString('ru-RU')} ₽`,
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
			} else {
				Alert.alert('Ошибка', errorMessage)
			}
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
						<MaterialIcons name={item.icon || 'description'} size={32} color={colors.primary} />
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
							{isSubscribed ? 'Подключено' : 'Подключить'}
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
			{/* Кнопка "Мои услуги" */}
			<TouchableOpacity
				style={styles.myServicesButton}
				onPress={() => navigation.navigate('MyServices')}
			>
				<MaterialIcons name="chevron-right" size={20} color={colors.primary} />
				<Text style={styles.myServicesButtonText}>Мои услуги</Text>
				{myServices.length > 0 && (
					<View style={styles.myServicesBadge}>
						<Text style={styles.myServicesBadgeText}>{myServices.length}</Text>
					</View>
				)}
				<MaterialIcons name="chevron-right" size={20} color={colors.primary} />
			</TouchableOpacity>

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
						<MaterialIcons name="sync" size={20} color={colors.primary} />
						<Text style={styles.syncButtonTextSmall}>Обновить каталог</Text>
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
			<View style={styles.categoriesWrapper}>
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
							activeOpacity={0.7}
						>
							<View style={[
								styles.categoryIconContainer,
								selectedCategory === category.id && styles.categoryIconContainerActive
							]}>
								{category.iconLibrary === 'Ionicons' ? (
									<Ionicons 
										name={category.icon} 
										size={20} 
										color={selectedCategory === category.id ? colors.primary : colors.textMuted} 
									/>
								) : (
									<MaterialIcons 
										name={category.icon} 
										size={20} 
										color={selectedCategory === category.id ? colors.primary : colors.textMuted} 
									/>
								)}
							</View>
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
			</View>

			{/* Рекомендации */}
			{recommendations.length > 0 && (
				<View style={styles.recommendationsSection}>
					<View style={styles.recommendationsHeader}>
						<Text style={styles.recommendationsTitle}>
							Вам подходят следующие товары/услуги
						</Text>
					</View>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.recommendationsList}
					>
						{recommendations.map(item => (
							<TouchableOpacity
								key={item.id}
								style={styles.recommendationCard}
								onPress={() => handleSelectService(item)}
							>
								{item.category === 'support' ? (
									<MaterialIcons name="support-agent" size={24} color={colors.primary} />
								) : item.category === 'license' ? (
									<MaterialIcons name="verified" size={24} color={colors.primary} />
								) : item.category === 'cloud' ? (
									<MaterialIcons name="cloud" size={24} color={colors.primary} />
								) : item.category === 'service' ? (
									<MaterialIcons name="room-service" size={24} color={colors.primary} />
								) : item.category === 'reporting' ? (
									<MaterialIcons name="assessment" size={24} color={colors.primary} />
								) : (
									<MaterialIcons name="description" size={24} color={colors.primary} />
								)}
								<Text style={styles.recommendationName} numberOfLines={2}>
									{item.name}
								</Text>
								<Text style={styles.recommendationPrice}>
									{item.price.toLocaleString('ru-RU')} ₽
								</Text>
								<Text style={styles.recommendationReason} numberOfLines={1}>
									{item.reason}
								</Text>
							</TouchableOpacity>
						))}
					</ScrollView>
				</View>
			)}

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
						<MaterialIcons name="shopping-cart" size={48} color={colors.textMuted} />
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
									<MaterialIcons name={selectedService.icon || 'description'} size={48} color={colors.primary} />
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
								{selectedService.features && Array.isArray(selectedService.features) && selectedService.features.length > 0 ? (
									selectedService.features.map((feature, index) => (
										<View key={index} style={styles.featureItem}>
											<Text style={styles.featureCheck}>✓</Text>
											<Text style={styles.featureText}>{feature}</Text>
										</View>
									))
								) : (
									<Text style={[styles.featureText, { fontStyle: 'italic', color: colors.textMuted }]}>
										Описание функций услуги будет добавлено позже
									</Text>
								)}
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
									Будет сформирован счёт
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
	myServicesButton: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		marginTop: 12,
		marginBottom: 8,
		padding: 16,
		borderRadius: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	myServicesButtonIcon: {
		fontSize: 24,
		marginRight: 12,
	},
	myServicesButtonText: {
		flex: 1,
		fontSize: 16,
		fontWeight: '600',
		color: colors.textDark,
	},
	myServicesBadge: {
		backgroundColor: colors.primary,
		borderRadius: 12,
		paddingVertical: 4,
		paddingHorizontal: 10,
		marginRight: 8,
	},
	myServicesBadgeText: {
		color: colors.textLight,
		fontSize: 12,
		fontWeight: '600',
	},
	myServicesArrow: {
		fontSize: 18,
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
	categoriesWrapper: {
		backgroundColor: colors.backgroundWhite,
		paddingVertical: 8,
		marginTop: 8,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	categoriesContainer: {
		maxHeight: 50,
	},
	categoriesContent: {
		paddingHorizontal: 16,
		paddingVertical: 4,
		alignItems: 'center',
	},
	categoryButton: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'transparent',
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 16,
		marginHorizontal: 3,
		minHeight: 36,
	},
	categoryButtonActive: {
		backgroundColor: colors.primary + '15',
	},
	categoryIconContainer: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: colors.backgroundLight,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 6,
	},
	categoryIconContainerActive: {
		backgroundColor: colors.primary,
	},
	categoryIcon: {
		fontSize: 16,
	},
	categoryIconActive: {
		fontSize: 16,
	},
	categoryText: {
		fontSize: 13,
		fontWeight: '500',
		color: colors.textMuted,
	},
	categoryTextActive: {
		color: colors.primary,
		fontWeight: '600',
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
	recommendationsSection: {
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		marginTop: 8,
		marginBottom: 8,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	recommendationsHeader: {
		marginBottom: 12,
	},
	recommendationsTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.textDark,
	},
	recommendationsList: {
		paddingVertical: 4,
	},
	recommendationCard: {
		width: 160,
		backgroundColor: colors.backgroundLight,
		borderRadius: 12,
		padding: 12,
		marginRight: 12,
		borderWidth: 1,
		borderColor: colors.primary + '30',
	},
	recommendationIcon: {
		fontSize: 32,
		marginBottom: 8,
		textAlign: 'center',
	},
	recommendationName: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 6,
		minHeight: 36,
	},
	recommendationPrice: {
		fontSize: 16,
		fontWeight: 'bold',
		color: colors.primary,
		marginBottom: 4,
	},
	recommendationReason: {
		fontSize: 11,
		color: colors.textMuted,
		fontStyle: 'italic',
	},
})
