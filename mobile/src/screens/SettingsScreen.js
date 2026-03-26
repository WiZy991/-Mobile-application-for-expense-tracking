import React, { useContext, useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
	Platform,
} from 'react-native'
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons'
import { AuthContext } from '../context/AuthContext'
import { api } from '../services/api'
import colors from '../theme/colors'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Биометрия доступна только на мобильных устройствах
// На веб-платформе модуль не используется
let LocalAuthentication = null
let biometricModuleLoaded = false

// Функция для безопасной загрузки модуля биометрии
const getLocalAuthentication = () => {
	if (Platform.OS === 'web') {
		return null
	}
	
	// Если уже пытались загрузить и не получилось
	if (biometricModuleLoaded && LocalAuthentication === null) {
		return null
	}
	
	// Если уже загружен
	if (LocalAuthentication) {
		return LocalAuthentication
	}
	
	// Пытаемся загрузить модуль
	biometricModuleLoaded = true
	try {
		// Используем динамический require только на мобильных платформах
		// eslint-disable-next-line
		const module = eval('require')('expo-local-authentication')
		LocalAuthentication = module.default || module
		return LocalAuthentication
	} catch (e) {
		// Модуль недоступен - это нормально
		LocalAuthentication = null
		return null
	}
}

export default function SettingsScreen({ navigation }) {
	const authContext = useContext(AuthContext)
	const logout = authContext?.logout
	
	// Отладочная информация
	useEffect(() => {
		console.log('SettingsScreen mounted');
		console.log('AuthContext value:', authContext);
		console.log('Logout function:', logout, typeof logout);
	}, [authContext, logout])
	const [client, setClient] = useState(null)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [lastSync, setLastSync] = useState(null)
	const [notifications, setNotifications] = useState(true)
	const [pushEnabled, setPushEnabled] = useState(true)
	const [emailNotifications, setEmailNotifications] = useState(true)
	const [biometric, setBiometric] = useState(false)
	const [biometricAvailable, setBiometricAvailable] = useState(false)

	useEffect(() => {
		loadProfile()
		loadSettings()
		checkBiometricAvailability()
	}, [])

	const loadSettings = async () => {
		try {
			const pushSetting = await AsyncStorage.getItem('pushNotificationsEnabled')
			const emailSetting = await AsyncStorage.getItem('emailNotificationsEnabled')
			const biometricSetting = await AsyncStorage.getItem('biometricEnabled')

			if (pushSetting !== null) {
				setPushEnabled(pushSetting === 'true')
			}
			if (emailSetting !== null) {
				setEmailNotifications(emailSetting === 'true')
			}
			if (biometricSetting !== null) {
				setBiometric(biometricSetting === 'true')
			}
		} catch (error) {
			console.log('Error loading settings:', error)
		}
	}

	const checkBiometricAvailability = async () => {
		if (Platform.OS === 'web') {
			setBiometricAvailable(false)
			return
		}
		
		const authModule = getLocalAuthentication()
		if (!authModule) {
			setBiometricAvailable(false)
			return
		}
		
		try {
			const compatible = await authModule.hasHardwareAsync()
			const enrolled = await authModule.isEnrolledAsync()
			setBiometricAvailable(compatible && enrolled)
		} catch (error) {
			console.log('Biometric check error:', error)
			setBiometricAvailable(false)
		}
	}

	const handlePushToggle = async (value) => {
		setPushEnabled(value)
		try {
			await AsyncStorage.setItem('pushNotificationsEnabled', value.toString())
			// Здесь можно добавить регистрацию/отмену пуш токена
			if (value) {
				Alert.alert('Успех', 'Push-уведомления включены')
			} else {
				Alert.alert('Информация', 'Push-уведомления отключены')
			}
		} catch (error) {
			console.log('Error saving push setting:', error)
		}
	}

	const handleEmailToggle = async (value) => {
		setEmailNotifications(value)
		try {
			await AsyncStorage.setItem('emailNotificationsEnabled', value.toString())
			// Здесь можно добавить обновление настроек на сервере
		} catch (error) {
			console.log('Error saving email setting:', error)
		}
	}

	const handleBiometricToggle = async (value) => {
		if (Platform.OS === 'web') {
			Alert.alert(
				'Недоступно',
				'Биометрия доступна только на мобильных устройствах'
			)
			return
		}
		
		const authModule = getLocalAuthentication()
		if (!authModule) {
			Alert.alert(
				'Недоступно',
				'Биометрия недоступна на этом устройстве'
			)
			return
		}

		if (value && !biometricAvailable) {
			Alert.alert(
				'Биометрия недоступна',
				'На вашем устройстве не настроена биометрическая аутентификация. Настройте отпечаток пальца или Face ID в настройках устройства.'
			)
			return
		}

		if (value) {
			// Проверяем биометрию перед включением
			try {
				const result = await authModule.authenticateAsync({
					promptMessage: 'Подтвердите включение биометрии',
					fallbackLabel: 'Использовать пароль',
				})

				if (result.success) {
					setBiometric(true)
					await AsyncStorage.setItem('biometricEnabled', 'true')
					Alert.alert('Успех', 'Биометрия включена')
				} else {
					Alert.alert('Отменено', 'Биометрия не включена')
				}
			} catch (error) {
				console.log('Biometric auth error:', error)
				Alert.alert('Ошибка', 'Не удалось включить биометрию')
			}
		} else {
			setBiometric(false)
			await AsyncStorage.setItem('biometricEnabled', 'false')
			Alert.alert('Информация', 'Биометрия отключена')
		}
	}

	const loadProfile = async () => {
		try {
			const response = await api.get('/clients/me')
			setClient(response.data)
			setLastSync(new Date())
		} catch (error) {
			console.log('Error loading profile:', error.message)
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	const onRefresh = () => {
		setRefreshing(true)
		loadProfile()
	}

	const handleSync = async () => {
		setSyncing(true)
		try {
			await api.post('/clients/sync')
			await loadProfile()
			Alert.alert('Синхронизация', 'Данные успешно синхронизированы')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadProfile()
		} finally {
			setSyncing(false)
		}
	}

	const handleLogout = async () => {
		console.log('=== HANDLE LOGOUT CALLED ===');
		console.log('AuthContext:', authContext);
		console.log('Logout function:', logout, typeof logout);
		
		// Всегда делаем прямую очистку
		try {
			console.log('Step 1: Clearing AsyncStorage...');
			await AsyncStorage.multiRemove([
				'userToken',
				'userBalance', 
				'transactions', 
				'clientData'
			]);
			console.log('Step 2: AsyncStorage cleared');
			
			console.log('Step 3: Clearing API headers...');
			delete api.defaults.headers.common['Authorization'];
			console.log('Step 4: API headers cleared');
			
			// Пробуем вызвать logout из контекста если доступен
			if (logout && typeof logout === 'function') {
				console.log('Step 5: Calling logout from context...');
				await logout();
				console.log('Step 6: Logout from context completed');
			} else {
				console.log('Step 5: Logout not available in context, skipping');
			}
			
			// Перезагружаем приложение
			console.log('Step 7: Reloading application...');
			if (typeof window !== 'undefined') {
				console.log('Step 8: Window reload...');
				setTimeout(() => {
					window.location.reload();
				}, 100);
			} else {
				console.log('Step 8: Navigation reset...');
				navigation.reset({
					index: 0,
					routes: [{ name: 'Login' }],
				});
			}
		} catch (error) {
			console.error('Logout error:', error);
			Alert.alert('Ошибка', 'Не удалось выйти из аккаунта: ' + (error.message || 'Неизвестная ошибка'));
		}
	}

	const formatSyncTime = date => {
		if (!date) return 'Никогда'
		const now = new Date()
		const diff = Math.floor((now - date) / 1000 / 60)
		if (diff < 1) return 'Только что'
		if (diff < 60) return `${diff} мин назад`
		return date.toLocaleTimeString('ru-RU', {
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	const MenuItem = ({
		icon,
		iconLibrary = 'MaterialIcons',
		title,
		subtitle,
		onPress,
		showArrow = true,
		rightElement,
	}) => {
		const IconComponent = iconLibrary === 'Ionicons' ? Ionicons : 
		                      iconLibrary === 'FontAwesome5' ? FontAwesome5 :
		                      MaterialIcons;
		return (
			<TouchableOpacity
				style={styles.menuItem}
				onPress={onPress}
				activeOpacity={0.7}
			>
				<View style={styles.menuItemLeft}>
					<IconComponent name={icon} size={24} color={colors.textDark} style={styles.menuIcon} />
					<View style={styles.menuItemContent}>
						<Text style={styles.menuTitle}>{title}</Text>
						{subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
					</View>
				</View>
				{rightElement || (showArrow && <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />)}
			</TouchableOpacity>
		)
	}

	const SectionHeader = ({ title }) => (
		<Text style={styles.sectionHeader}>{title}</Text>
	)

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' color={colors.primary} />
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
			{/* Профиль */}
			<TouchableOpacity
				style={styles.profileCard}
				onPress={() => navigation.navigate('Profile')}
			>
				<View style={styles.profileAvatar}>
					<Text style={styles.profileAvatarText}>
						{client?.name?.charAt(0).toUpperCase() || 'П'}
					</Text>
				</View>
				<View style={styles.profileInfo}>
					<Text style={styles.profileName}>{client?.name || 'Клиент'}</Text>
					<Text style={styles.profileCompany}>
						{client?.company_name || client?.name || ''}
					</Text>
					{client?.inn && (
						<View style={styles.profileBadge}>
							<Text style={styles.profileBadgeText}>✓ ИНН: {client.inn}</Text>
						</View>
					)}
				</View>
				<MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
			</TouchableOpacity>

			{/* Кнопка синхронизации */}
			<TouchableOpacity
				style={[
					styles.syncMainButton,
					syncing && styles.syncMainButtonDisabled,
				]}
				onPress={handleSync}
				disabled={syncing}
			>
				{syncing ? (
					<ActivityIndicator size='small' color={colors.textLight} />
				) : (
					<>
						<MaterialIcons name="sync" size={24} color={colors.textLight} />
						<View style={styles.syncMainButtonContent}>
							<Text style={styles.syncMainButtonText}>
								Синхронизировать
							</Text>
							<Text style={styles.syncMainButtonSubtext}>
								Последняя: {formatSyncTime(lastSync)}
							</Text>
						</View>
					</>
				)}
			</TouchableOpacity>

			{/* Основные */}
			<SectionHeader title='Основные' />

			<View style={styles.section}>
				<MenuItem
					icon='person'
					title='Профиль'
					subtitle='Личные данные и информация'
					onPress={() => navigation.navigate('Profile')}
				/>
				<MenuItem
					icon='account-balance-wallet'
					title='Баланс'
					subtitle={`${Number(client?.balance || 0).toLocaleString('ru-RU')} ₽`}
					onPress={() => navigation.navigate('Balance')}
				/>
				<MenuItem
					icon='room-service'
					title='Мои услуги'
					subtitle='Активные подписки'
					onPress={() => navigation.navigate('Services')}
				/>
				<MenuItem
					icon='history'
					title='История операций'
					subtitle='Все транзакции'
					onPress={() => navigation.navigate('History')}
				/>
			</View>

			{/* Уведомления */}
			<SectionHeader title='Уведомления' />

			<View style={styles.section}>
				<MenuItem
					icon='notifications'
					title='Push-уведомления'
					subtitle='Мгновенные уведомления'
					showArrow={false}
					rightElement={
						<Switch
							value={pushEnabled}
							onValueChange={handlePushToggle}
							trackColor={{ false: colors.border, true: colors.primaryLight }}
							thumbColor={pushEnabled ? colors.primary : colors.textMuted}
						/>
					}
				/>
				<MenuItem
					icon='email'
					title='Email-уведомления'
					subtitle='Письма о счетах и оплатах'
					showArrow={false}
					rightElement={
						<Switch
							value={emailNotifications}
							onValueChange={handleEmailToggle}
							trackColor={{ false: colors.border, true: colors.primaryLight }}
							thumbColor={
								emailNotifications ? colors.primary : colors.textMuted
							}
						/>
					}
				/>
			</View>

			{/* Безопасность */}
			<SectionHeader title='Безопасность' />

			<View style={styles.section}>
				<MenuItem
					icon='lock'
					title='Изменить пароль'
					onPress={() => navigation.navigate('ChangePassword')}
				/>
				<MenuItem
					icon='fingerprint'
					title='Биометрия'
					subtitle={
						biometricAvailable
							? 'Вход по отпечатку или Face ID'
							: 'Недоступна на этом устройстве'
					}
					showArrow={false}
					rightElement={
						<Switch
							value={biometric && biometricAvailable}
							onValueChange={handleBiometricToggle}
							trackColor={{ false: colors.border, true: colors.primaryLight }}
							thumbColor={
								biometric && biometricAvailable ? colors.primary : colors.textMuted
							}
							disabled={!biometricAvailable}
						/>
					}
				/>
			</View>

			{/* Интеграции */}
			<SectionHeader title='Интеграции' />

			<View style={styles.section}>
				<MenuItem
					icon='api'
					title='Диагностика API'
					subtitle='Проверка доступных методов'
					onPress={() => navigation.navigate('SbisDiagnostics')}
				/>
			</View>

			{/* Информация */}
			<SectionHeader title='Информация' />

			<View style={styles.section}>
				<MenuItem
					icon='help-outline'
					title='Помощь и поддержка'
					onPress={() => navigation.navigate('Support')}
				/>
				<MenuItem
					icon='description'
					title='Пользовательское соглашение'
					onPress={() => navigation.navigate('Terms')}
				/>
				<MenuItem
					icon='privacy-tip'
					title='Политика конфиденциальности'
					onPress={() => navigation.navigate('PrivacyPolicy')}
				/>
				<MenuItem
					icon='info'
					title='О приложении'
					subtitle='Версия 1.0.0'
					onPress={() =>
						Alert.alert('WorldCashBox', 'Версия 1.0.0\n© 2025 WorldCashBox')
					}
				/>
			</View>

			{/* Выход */}
			<TouchableOpacity 
				style={styles.logoutButton} 
				onPress={() => {
					console.log('LOGOUT BUTTON CLICKED!');
					handleLogout();
				}}
				activeOpacity={0.7}
			>
				<Text style={styles.logoutIcon}>🚪</Text>
				<Text style={styles.logoutText}>Выйти из аккаунта</Text>
			</TouchableOpacity>

			{/* Футер */}
			<View style={styles.footer}>
				<Text style={styles.footerText}>WorldCashBox</Text>
				<Text style={styles.footerSubtext}>Автоматизация бизнеса</Text>
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
	profileCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.backgroundWhite,
		margin: 16,
		marginBottom: 8,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	profileAvatar: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.primary,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 14,
	},
	profileAvatarText: {
		fontSize: 24,
		fontWeight: 'bold',
		color: colors.textLight,
	},
	profileInfo: {
		flex: 1,
	},
	profileName: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 2,
	},
	profileCompany: {
		fontSize: 13,
		color: colors.textMuted,
		marginBottom: 6,
	},
	profileBadge: {
		backgroundColor: colors.success + '20',
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 10,
		alignSelf: 'flex-start',
	},
	profileBadgeText: {
		fontSize: 11,
		color: colors.success,
		fontWeight: '500',
	},
	profileArrow: {
		fontSize: 20,
		color: colors.textMuted,
	},
	syncMainButton: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.primary,
		marginHorizontal: 16,
		marginBottom: 8,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	syncMainButtonDisabled: {
		opacity: 0.7,
	},
	syncMainButtonIcon: {
		fontSize: 28,
		marginRight: 14,
	},
	syncMainButtonContent: {
		flex: 1,
	},
	syncMainButtonText: {
		color: colors.textLight,
		fontSize: 16,
		fontWeight: '600',
	},
	syncMainButtonSubtext: {
		color: 'rgba(255,255,255,0.8)',
		fontSize: 12,
		marginTop: 2,
	},
	sectionHeader: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textMuted,
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginHorizontal: 16,
		marginTop: 24,
		marginBottom: 8,
	},
	section: {
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		borderRadius: 16,
		overflow: 'hidden',
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	menuItem: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	menuItemLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	menuIcon: {
		fontSize: 22,
		marginRight: 14,
	},
	menuItemContent: {
		flex: 1,
	},
	menuTitle: {
		fontSize: 16,
		fontWeight: '500',
		color: colors.textDark,
	},
	menuSubtitle: {
		fontSize: 12,
		color: colors.textMuted,
		marginTop: 2,
	},
	menuArrow: {
		fontSize: 18,
		color: colors.textMuted,
	},
	logoutButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.backgroundWhite,
		marginHorizontal: 16,
		marginTop: 24,
		borderRadius: 16,
		padding: 16,
		borderWidth: 1.5,
		borderColor: colors.error,
	},
	logoutIcon: {
		fontSize: 20,
		marginRight: 10,
	},
	logoutText: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.error,
	},
	footer: {
		alignItems: 'center',
		paddingVertical: 30,
		paddingBottom: 40,
	},
	footerText: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.primary,
	},
	footerSubtext: {
		fontSize: 12,
		color: colors.textMuted,
		marginTop: 4,
	},
})
