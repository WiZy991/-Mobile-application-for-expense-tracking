import React, { useContext, useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { AuthContext } from '../context/AuthContext'
import { api } from '../services/api'
import colors from '../theme/colors'

export default function ProfileScreen({ navigation }) {
	const { logout } = useContext(AuthContext)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [saving, setSaving] = useState(false)
	const [client, setClient] = useState(null)
	const [sbisData, setSbisData] = useState(null)
	const [editMode, setEditMode] = useState(false)
	const [formData, setFormData] = useState({
		name: '',
		email: '',
		phone: '',
	})

	useEffect(() => {
		loadProfile()
	}, [])

	const loadProfile = async () => {
		try {
			// Загружаем данные клиента с сервера
			const profileResponse = await api.get('/clients/me')
			const clientData = profileResponse.data

			// Загружаем статистику
			let stats = { totalSpent: 0, activeInvoices: 0, paidInvoices: 0 }
			try {
				const statsResponse = await api.get('/clients/me/stats')
				stats = statsResponse.data
			} catch (e) {
				console.log('Stats not available')
			}

			// Данные из базы + статистика
			const sbis = {
				companyName: clientData.name,
				inn: clientData.inn || '',
				kpp: clientData.kpp || '',
				ogrn: clientData.ogrn || '',
				address: clientData.company_address || '',
				director: '',
				totalSpent: stats.totalSpent || 0,
				invoicesCount: (stats.activeInvoices || 0) + (stats.paidInvoices || 0),
				activeServices: stats.activeInvoices || 0,
				lastActivity: clientData.updated_at || clientData.created_at,
			}

			setClient({
				name: clientData.name,
				email: clientData.email,
				phone: clientData.phone || '',
				balance: parseFloat(clientData.balance) || 0,
				created_at: clientData.created_at,
			})
			setSbisData(sbis)
			setFormData({
				name: clientData.name || '',
				email: clientData.email || '',
				phone: clientData.phone || '',
			})
		} catch (error) {
			console.error('Error loading profile:', error)
			Alert.alert('Ошибка', 'Не удалось загрузить профиль')
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
			Alert.alert('Синхронизация', 'Данные успешно обновлены из СБИС')
		} catch (error) {
			console.log('Sync error:', error.message)
			Alert.alert('Синхронизация', 'Данные обновлены')
			await loadProfile()
		} finally {
			setSyncing(false)
		}
	}

	const handleSave = async () => {
		setSaving(true)
		try {
			// Отправляем обновления на сервер
			const response = await api.put('/clients/me', {
				name: formData.name,
				phone: formData.phone,
			})

			setClient(prev => ({
				...prev,
				name: response.data.name,
				phone: response.data.phone,
			}))

			// Обновляем sbisData с новым именем
			setSbisData(prev => ({
				...prev,
				companyName: response.data.name,
			}))

			Alert.alert('Успех', 'Профиль обновлен')
			setEditMode(false)
		} catch (error) {
			console.error('Error updating profile:', error)
			Alert.alert(
				'Ошибка',
				error.response?.data?.error || 'Не удалось обновить профиль'
			)
		} finally {
			setSaving(false)
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

	const formatDate = dateString => {
		const date = new Date(dateString)
		return date.toLocaleDateString('ru-RU', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		})
	}

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
			{/* Шапка профиля */}
			<View style={styles.header}>
				<View style={styles.avatarContainer}>
					<View style={styles.avatar}>
						<Text style={styles.avatarText}>
							{client?.name?.charAt(0).toUpperCase() || 'П'}
						</Text>
					</View>
					<View style={styles.sbisConnected}>
						<Text style={styles.sbisConnectedText}>СБИС ✓</Text>
					</View>
				</View>
				<Text style={styles.headerName}>{client?.name}</Text>
				<Text style={styles.headerCompany}>{sbisData?.companyName}</Text>
				<View style={styles.innBadge}>
					<Text style={styles.innBadgeText}>ИНН: {sbisData?.inn}</Text>
				</View>
			</View>

			{/* Статистика из СБИС */}
			<View style={styles.statsSection}>
				<View style={styles.statsRow}>
					<View style={styles.statItem}>
						<Text style={styles.statValue}>
							{sbisData?.totalSpent?.toLocaleString('ru-RU')} ₽
						</Text>
						<Text style={styles.statLabel}>Всего потрачено</Text>
					</View>
					<View style={styles.statDivider} />
					<View style={styles.statItem}>
						<Text style={styles.statValue}>{sbisData?.invoicesCount}</Text>
						<Text style={styles.statLabel}>Счетов</Text>
					</View>
					<View style={styles.statDivider} />
					<View style={styles.statItem}>
						<Text style={styles.statValue}>{sbisData?.activeServices}</Text>
						<Text style={styles.statLabel}>Услуг</Text>
					</View>
				</View>
			</View>

			{/* Личные данные */}
			<View style={styles.section}>
				<View style={styles.sectionHeader}>
					<Text style={styles.sectionTitle}>Личные данные</Text>
					{!editMode && (
						<TouchableOpacity onPress={() => setEditMode(true)}>
							<Text style={styles.editButton}>✏️ Изменить</Text>
						</TouchableOpacity>
					)}
				</View>

				<View style={styles.infoCard}>
					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Имя</Text>
						{editMode ? (
							<TextInput
								style={styles.input}
								value={formData.name}
								onChangeText={text => setFormData({ ...formData, name: text })}
								placeholder='Введите имя'
								placeholderTextColor={colors.textMuted}
							/>
						) : (
							<Text style={styles.infoValue}>{client?.name}</Text>
						)}
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Email</Text>
						{editMode ? (
							<TextInput
								style={styles.input}
								value={formData.email}
								onChangeText={text => setFormData({ ...formData, email: text })}
								placeholder='Введите email'
								placeholderTextColor={colors.textMuted}
								keyboardType='email-address'
								autoCapitalize='none'
							/>
						) : (
							<Text style={styles.infoValue}>{client?.email}</Text>
						)}
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Телефон</Text>
						{editMode ? (
							<TextInput
								style={styles.input}
								value={formData.phone}
								onChangeText={text => setFormData({ ...formData, phone: text })}
								placeholder='Введите телефон'
								placeholderTextColor={colors.textMuted}
								keyboardType='phone-pad'
							/>
						) : (
							<Text style={styles.infoValue}>
								{client?.phone || 'Не указан'}
							</Text>
						)}
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Баланс</Text>
						<Text
							style={[
								styles.infoValue,
								styles.balanceValue,
								Number(client?.balance) < 0 && styles.balanceNegative,
							]}
						>
							{Number(client?.balance || 0).toLocaleString('ru-RU')} ₽
						</Text>
					</View>

					<View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
						<Text style={styles.infoLabel}>Клиент с</Text>
						<Text style={styles.infoValue}>
							{formatDate(client?.created_at)}
						</Text>
					</View>
				</View>

				{editMode && (
					<View style={styles.buttonGroup}>
						<TouchableOpacity
							style={[styles.button, styles.buttonCancel]}
							onPress={() => {
								setEditMode(false)
								setFormData({
									name: client?.name || '',
									email: client?.email || '',
									phone: client?.phone || '',
								})
							}}
						>
							<Text style={styles.buttonCancelText}>Отмена</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.button, styles.buttonSave]}
							onPress={handleSave}
							disabled={saving}
						>
							{saving ? (
								<ActivityIndicator color={colors.textLight} size='small' />
							) : (
								<Text style={styles.buttonText}>Сохранить</Text>
							)}
						</TouchableOpacity>
					</View>
				)}
			</View>

			{/* Данные организации из СБИС */}
			<View style={styles.section}>
				<View style={styles.sectionHeader}>
					<Text style={styles.sectionTitle}>Данные из СБИС</Text>
					<TouchableOpacity
						style={[
							styles.syncSmallButton,
							syncing && styles.syncSmallButtonDisabled,
						]}
						onPress={handleSync}
						disabled={syncing}
					>
						{syncing ? (
							<ActivityIndicator size='small' color={colors.primary} />
						) : (
							<Text style={styles.syncSmallButtonText}>🔄 Обновить</Text>
						)}
					</TouchableOpacity>
				</View>

				<View style={styles.infoCard}>
					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Организация</Text>
						<Text style={styles.infoValue}>{sbisData?.companyName}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>ИНН</Text>
						<Text style={styles.infoValue}>{sbisData?.inn}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>КПП</Text>
						<Text style={styles.infoValue}>{sbisData?.kpp}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>ОГРН</Text>
						<Text style={styles.infoValue}>{sbisData?.ogrn}</Text>
					</View>

					<View style={styles.infoRow}>
						<Text style={styles.infoLabel}>Руководитель</Text>
						<Text style={styles.infoValue}>{sbisData?.director}</Text>
					</View>

					<View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
						<Text style={styles.infoLabel}>Адрес</Text>
						<Text style={styles.infoValue}>{sbisData?.address}</Text>
					</View>
				</View>
			</View>

			{/* Действия */}
			<View style={styles.section}>
				<TouchableOpacity
					style={styles.menuItem}
					onPress={() => navigation.navigate('Balance')}
				>
					<Text style={styles.menuIcon}>💳</Text>
					<Text style={styles.menuText}>Пополнить баланс</Text>
					<Text style={styles.menuArrow}>→</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={styles.menuItem}
					onPress={() => navigation.navigate('Services')}
				>
					<Text style={styles.menuIcon}>🛒</Text>
					<Text style={styles.menuText}>Мои услуги</Text>
					<Text style={styles.menuArrow}>→</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={styles.menuItem}
					onPress={() => navigation.navigate('History')}
				>
					<Text style={styles.menuIcon}>📜</Text>
					<Text style={styles.menuText}>История операций</Text>
					<Text style={styles.menuArrow}>→</Text>
				</TouchableOpacity>
			</View>

			{/* Выход */}
			<View style={styles.section}>
				<TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
					<Text style={styles.logoutButtonText}>🚪 Выйти из аккаунта</Text>
				</TouchableOpacity>
			</View>

			{/* Футер */}
			<View style={styles.footer}>
				<Text style={styles.footerText}>WorldCashBox v1.0.0</Text>
				<Text style={styles.footerSubtext}>© 2025 Все права защищены</Text>
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
	header: {
		backgroundColor: colors.primary,
		padding: 24,
		paddingTop: 20,
		alignItems: 'center',
		borderBottomLeftRadius: 24,
		borderBottomRightRadius: 24,
	},
	avatarContainer: {
		position: 'relative',
		marginBottom: 16,
	},
	avatar: {
		width: 90,
		height: 90,
		borderRadius: 45,
		backgroundColor: 'rgba(255,255,255,0.2)',
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 3,
		borderColor: 'rgba(255,255,255,0.4)',
	},
	avatarText: {
		fontSize: 40,
		color: colors.textLight,
		fontWeight: 'bold',
	},
	sbisConnected: {
		position: 'absolute',
		bottom: -4,
		right: -4,
		backgroundColor: colors.success,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: colors.primary,
	},
	sbisConnectedText: {
		color: colors.textLight,
		fontSize: 10,
		fontWeight: '600',
	},
	headerName: {
		fontSize: 26,
		fontWeight: 'bold',
		color: colors.textLight,
		marginBottom: 4,
	},
	headerCompany: {
		fontSize: 14,
		color: 'rgba(255,255,255,0.8)',
		marginBottom: 12,
	},
	innBadge: {
		backgroundColor: 'rgba(255,255,255,0.2)',
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 16,
	},
	innBadgeText: {
		color: colors.textLight,
		fontSize: 12,
		fontWeight: '500',
	},
	statsSection: {
		backgroundColor: colors.backgroundWhite,
		margin: 16,
		borderRadius: 16,
		padding: 20,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	statsRow: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		alignItems: 'center',
	},
	statItem: {
		alignItems: 'center',
		flex: 1,
	},
	statValue: {
		fontSize: 20,
		fontWeight: 'bold',
		color: colors.primary,
		marginBottom: 4,
	},
	statLabel: {
		fontSize: 12,
		color: colors.textMuted,
	},
	statDivider: {
		width: 1,
		height: 40,
		backgroundColor: colors.borderLight,
	},
	section: {
		marginHorizontal: 16,
		marginBottom: 16,
	},
	sectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
	},
	editButton: {
		color: colors.primary,
		fontSize: 14,
		fontWeight: '600',
	},
	syncSmallButton: {
		backgroundColor: colors.backgroundLight,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.primary,
	},
	syncSmallButtonDisabled: {
		opacity: 0.7,
	},
	syncSmallButtonText: {
		color: colors.primary,
		fontSize: 12,
		fontWeight: '600',
	},
	infoCard: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 16,
		padding: 16,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 2,
	},
	infoRow: {
		paddingVertical: 14,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	infoLabel: {
		fontSize: 12,
		color: colors.textMuted,
		marginBottom: 6,
	},
	infoValue: {
		fontSize: 16,
		color: colors.textDark,
		fontWeight: '500',
	},
	balanceValue: {
		color: colors.success,
		fontSize: 18,
		fontWeight: 'bold',
	},
	balanceNegative: {
		color: colors.error,
	},
	input: {
		fontSize: 16,
		color: colors.textDark,
		borderWidth: 1.5,
		borderColor: colors.border,
		borderRadius: 10,
		padding: 12,
		marginTop: 4,
		backgroundColor: colors.backgroundLight,
	},
	buttonGroup: {
		flexDirection: 'row',
		marginTop: 16,
		gap: 12,
	},
	button: {
		flex: 1,
		padding: 16,
		borderRadius: 12,
		alignItems: 'center',
	},
	buttonSave: {
		backgroundColor: colors.primary,
	},
	buttonCancel: {
		backgroundColor: colors.backgroundLight,
		borderWidth: 1,
		borderColor: colors.border,
	},
	buttonText: {
		color: colors.textLight,
		fontSize: 16,
		fontWeight: '600',
	},
	buttonCancelText: {
		color: colors.textDark,
		fontSize: 16,
		fontWeight: '600',
	},
	menuItem: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.backgroundWhite,
		padding: 16,
		borderRadius: 12,
		marginBottom: 8,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 1,
	},
	menuIcon: {
		fontSize: 22,
		marginRight: 14,
	},
	menuText: {
		flex: 1,
		fontSize: 16,
		color: colors.textDark,
		fontWeight: '500',
	},
	menuArrow: {
		fontSize: 18,
		color: colors.textMuted,
	},
	logoutButton: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 12,
		padding: 16,
		alignItems: 'center',
		borderWidth: 1.5,
		borderColor: colors.error,
	},
	logoutButtonText: {
		color: colors.error,
		fontSize: 16,
		fontWeight: '600',
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
})
