import React, { useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { api } from '../services/api'
import colors from '../theme/colors'

export default function ChangePasswordScreen({ navigation }) {
	const [currentPassword, setCurrentPassword] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [showCurrentPassword, setShowCurrentPassword] = useState(false)
	const [showNewPassword, setShowNewPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)

	const validatePassword = (password) => {
		if (password.length < 6) {
			return 'Пароль должен быть не менее 6 символов'
		}
		return null
	}

	const handleChangePassword = async () => {
		// Валидация
		if (!currentPassword || !newPassword || !confirmPassword) {
			Alert.alert('Ошибка', 'Заполните все поля')
			return
		}

		const passwordError = validatePassword(newPassword)
		if (passwordError) {
			Alert.alert('Ошибка', passwordError)
			return
		}

		if (newPassword !== confirmPassword) {
			Alert.alert('Ошибка', 'Новые пароли не совпадают')
			return
		}

		if (currentPassword === newPassword) {
			Alert.alert('Ошибка', 'Новый пароль должен отличаться от текущего')
			return
		}

		setLoading(true)
		try {
			const response = await api.put('/auth/change-password', {
				currentPassword,
				newPassword,
			})

			if (response.data.success) {
				Alert.alert('Успех', 'Пароль успешно изменен', [
					{
						text: 'OK',
						onPress: () => {
							// Очищаем поля
							setCurrentPassword('')
							setNewPassword('')
							setConfirmPassword('')
							navigation.goBack()
						},
					},
				])
			}
		} catch (error) {
			console.error('Change password error:', error)
			const errorMessage =
				error.response?.data?.error || 'Не удалось изменить пароль'
			Alert.alert('Ошибка', errorMessage)
		} finally {
			setLoading(false)
		}
	}

	return (
		<ScrollView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Изменение пароля</Text>
				<Text style={styles.subtitle}>
					Введите текущий пароль и новый пароль для изменения
				</Text>

				{/* Текущий пароль */}
				<View style={styles.inputContainer}>
					<Text style={styles.label}>Текущий пароль</Text>
					<View style={styles.passwordInput}>
						<TextInput
							style={styles.input}
							value={currentPassword}
							onChangeText={setCurrentPassword}
							placeholder='Введите текущий пароль'
							secureTextEntry={!showCurrentPassword}
							autoCapitalize='none'
							autoCorrect={false}
						/>
						<TouchableOpacity
							onPress={() => setShowCurrentPassword(!showCurrentPassword)}
							style={styles.eyeButton}
						>
							<Text style={styles.eyeIcon}>
								{showCurrentPassword ? '👁️' : '👁️‍🗨️'}
							</Text>
						</TouchableOpacity>
					</View>
				</View>

				{/* Новый пароль */}
				<View style={styles.inputContainer}>
					<Text style={styles.label}>Новый пароль</Text>
					<View style={styles.passwordInput}>
						<TextInput
							style={styles.input}
							value={newPassword}
							onChangeText={setNewPassword}
							placeholder='Введите новый пароль (мин. 6 символов)'
							secureTextEntry={!showNewPassword}
							autoCapitalize='none'
							autoCorrect={false}
						/>
						<TouchableOpacity
							onPress={() => setShowNewPassword(!showNewPassword)}
							style={styles.eyeButton}
						>
							<Text style={styles.eyeIcon}>
								{showNewPassword ? '👁️' : '👁️‍🗨️'}
							</Text>
						</TouchableOpacity>
					</View>
					<Text style={styles.hint}>
						Пароль должен содержать не менее 6 символов
					</Text>
				</View>

				{/* Подтверждение пароля */}
				<View style={styles.inputContainer}>
					<Text style={styles.label}>Подтвердите новый пароль</Text>
					<View style={styles.passwordInput}>
						<TextInput
							style={styles.input}
							value={confirmPassword}
							onChangeText={setConfirmPassword}
							placeholder='Повторите новый пароль'
							secureTextEntry={!showConfirmPassword}
							autoCapitalize='none'
							autoCorrect={false}
						/>
						<TouchableOpacity
							onPress={() => setShowConfirmPassword(!showConfirmPassword)}
							style={styles.eyeButton}
						>
							<Text style={styles.eyeIcon}>
								{showConfirmPassword ? '👁️' : '👁️‍🗨️'}
							</Text>
						</TouchableOpacity>
					</View>
				</View>

				{/* Кнопка сохранения */}
				<TouchableOpacity
					style={[styles.saveButton, loading && styles.saveButtonDisabled]}
					onPress={handleChangePassword}
					disabled={loading}
				>
					{loading ? (
						<ActivityIndicator size='small' color={colors.textLight} />
					) : (
						<Text style={styles.saveButtonText}>Изменить пароль</Text>
					)}
				</TouchableOpacity>

				{/* Информация */}
				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>💡 Советы по безопасности</Text>
					<Text style={styles.infoText}>
						• Используйте сложный пароль с буквами, цифрами и символами{'\n'}
						• Не используйте один пароль для разных сервисов{'\n'}
						• Регулярно меняйте пароль
					</Text>
				</View>
			</View>
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	content: {
		padding: 20,
	},
	title: {
		fontSize: 28,
		fontWeight: 'bold',
		color: colors.textDark,
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		color: colors.textMuted,
		marginBottom: 24,
	},
	inputContainer: {
		marginBottom: 20,
	},
	label: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textDark,
		marginBottom: 8,
	},
	passwordInput: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.backgroundWhite,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.border,
	},
	input: {
		flex: 1,
		padding: 16,
		fontSize: 16,
		color: colors.textDark,
	},
	eyeButton: {
		padding: 16,
	},
	eyeIcon: {
		fontSize: 20,
	},
	hint: {
		fontSize: 12,
		color: colors.textMuted,
		marginTop: 6,
	},
	saveButton: {
		backgroundColor: colors.primary,
		borderRadius: 12,
		padding: 16,
		alignItems: 'center',
		marginTop: 8,
		marginBottom: 24,
	},
	saveButtonDisabled: {
		opacity: 0.6,
	},
	saveButtonText: {
		color: colors.textLight,
		fontSize: 16,
		fontWeight: '600',
	},
	infoCard: {
		backgroundColor: colors.primaryLight + '15',
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: colors.primaryLight + '30',
	},
	infoTitle: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.primary,
		marginBottom: 8,
	},
	infoText: {
		fontSize: 13,
		color: colors.textDark,
		lineHeight: 20,
	},
})
