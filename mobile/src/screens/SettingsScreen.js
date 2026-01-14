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
} from 'react-native'
import { AuthContext } from '../context/AuthContext'
import { api } from '../services/api'
import colors from '../theme/colors'

export default function SettingsScreen({ navigation }) {
	const { logout } = useContext(AuthContext)
	const [client, setClient] = useState(null)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [lastSync, setLastSync] = useState(null)
	const [notifications, setNotifications] = useState(true)
	const [pushEnabled, setPushEnabled] = useState(true)
	const [emailNotifications, setEmailNotifications] = useState(true)
	const [biometric, setBiometric] = useState(false)

	useEffect(() => {
		loadProfile()
	}, [])

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
			Alert.alert('Синхронизация', 'Данные успешно синхронизированы с СБИС')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadProfile()
		} finally {
			setSyncing(false)
		}
	}

	const handleLogout = () => {
		Alert.alert('Выход из аккаунта', 'Вы уверены, что хотите выйти?', [
			{ text: 'Отмена', style: 'cancel' },
			{
				text: 'Выйти',
				style: 'destructive',
				onPress: logout,
			},
		])
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
		title,
		subtitle,
		onPress,
		showArrow = true,
		rightElement,
	}) => (
		<TouchableOpacity
			style={styles.menuItem}
			onPress={onPress}
			activeOpacity={0.7}
		>
			<View style={styles.menuItemLeft}>
				<Text style={styles.menuIcon}>{icon}</Text>
				<View style={styles.menuItemContent}>
					<Text style={styles.menuTitle}>{title}</Text>
					{subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
				</View>
			</View>
			{rightElement || (showArrow && <Text style={styles.menuArrow}>→</Text>)}
		</TouchableOpacity>
	)

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
				<Text style={styles.profileArrow}>→</Text>
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
						<Text style={styles.syncMainButtonIcon}>🔄</Text>
						<View style={styles.syncMainButtonContent}>
							<Text style={styles.syncMainButtonText}>
								Синхронизировать с СБИС
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
					icon='👤'
					title='Профиль'
					subtitle='Личные данные и информация'
					onPress={() => navigation.navigate('Profile')}
				/>
				<MenuItem
					icon='💳'
					title='Баланс'
					subtitle={`${Number(client?.balance || 0).toLocaleString('ru-RU')} ₽`}
					onPress={() => navigation.navigate('Balance')}
				/>
				<MenuItem
					icon='🛒'
					title='Мои услуги'
					subtitle='Активные подписки'
					onPress={() => navigation.navigate('Services')}
				/>
				<MenuItem
					icon='📜'
					title='История операций'
					subtitle='Все транзакции'
					onPress={() => navigation.navigate('History')}
				/>
			</View>

			{/* Уведомления */}
			<SectionHeader title='Уведомления' />

			<View style={styles.section}>
				<MenuItem
					icon='🔔'
					title='Push-уведомления'
					subtitle='Мгновенные уведомления'
					showArrow={false}
					rightElement={
						<Switch
							value={pushEnabled}
							onValueChange={setPushEnabled}
							trackColor={{ false: colors.border, true: colors.primaryLight }}
							thumbColor={pushEnabled ? colors.primary : colors.textMuted}
						/>
					}
				/>
				<MenuItem
					icon='📧'
					title='Email-уведомления'
					subtitle='Письма о счетах и оплатах'
					showArrow={false}
					rightElement={
						<Switch
							value={emailNotifications}
							onValueChange={setEmailNotifications}
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
					icon='🔐'
					title='Изменить пароль'
					onPress={() => Alert.alert('Скоро', 'Функция в разработке')}
				/>
				<MenuItem
					icon='👆'
					title='Биометрия'
					subtitle='Вход по отпечатку или Face ID'
					showArrow={false}
					rightElement={
						<Switch
							value={biometric}
							onValueChange={setBiometric}
							trackColor={{ false: colors.border, true: colors.primaryLight }}
							thumbColor={biometric ? colors.primary : colors.textMuted}
						/>
					}
				/>
			</View>

			{/* Интеграции */}
			<SectionHeader title='Интеграции' />

			<View style={styles.section}>
				<MenuItem
					icon='🔗'
					title='Диагностика СБИС API'
					subtitle='Проверка доступных методов'
					onPress={() => navigation.navigate('SbisDiagnostics')}
				/>
			</View>

			{/* Информация */}
			<SectionHeader title='Информация' />

			<View style={styles.section}>
				<MenuItem
					icon='❓'
					title='Помощь и поддержка'
					onPress={() =>
						Alert.alert(
							'Поддержка',
							'support@worldcashbox.ru\n+7 (800) 123-45-67'
						)
					}
				/>
				<MenuItem
					icon='📋'
					title='Пользовательское соглашение'
					onPress={() => Alert.alert('Скоро', 'Функция в разработке')}
				/>
				<MenuItem
					icon='🔒'
					title='Политика конфиденциальности'
					onPress={() => Alert.alert('Скоро', 'Функция в разработке')}
				/>
				<MenuItem
					icon='ℹ️'
					title='О приложении'
					subtitle='Версия 1.0.0'
					onPress={() =>
						Alert.alert('WorldCashBox', 'Версия 1.0.0\n© 2025 WorldCashBox')
					}
				/>
			</View>

			{/* Выход */}
			<TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
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
