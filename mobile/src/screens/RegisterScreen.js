import React, { useContext, useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Animated,
	Easing,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SBIS_CONFIG } from '../config/sbisConfig'
import { AuthContext } from '../context/AuthContext'
import {
	api,
	sbisAuth,
	sbisGetClientFromCRM,
	sbisGetCompanyInfo,
	sbisGetPaymentHistory,
	sbisSearchByInn,
} from '../services/api'
import colors from '../theme/colors'

// Этапы регистрации
const STEPS = {
	CREDENTIALS: 1,
	INN: 2,
	SEARCHING: 3,
	SUCCESS: 4,
}

export default function RegisterScreen({ navigation }) {
	// Данные формы
	const [phone, setPhone] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [inn, setInn] = useState('')
	const [companyName, setCompanyName] = useState('')

	// Состояние
	const [currentStep, setCurrentStep] = useState(STEPS.CREDENTIALS)
	const [loading, setLoading] = useState(false)
	const [searchProgress, setSearchProgress] = useState(0)
	const [companyData, setCompanyData] = useState(null)

	const { signUp } = useContext(AuthContext)

	// Анимация для поиска
	const spinValue = new Animated.Value(0)
	const pulseValue = new Animated.Value(1)

	useEffect(() => {
		if (currentStep === STEPS.SEARCHING) {
			startSearchAnimation()
			simulateSearch()
		}
	}, [currentStep])

	const startSearchAnimation = () => {
		// Анимация вращения
		Animated.loop(
			Animated.timing(spinValue, {
				toValue: 1,
				duration: 2000,
				easing: Easing.linear,
				useNativeDriver: true,
			})
		).start()

		// Анимация пульсации
		Animated.loop(
			Animated.sequence([
				Animated.timing(pulseValue, {
					toValue: 1.2,
					duration: 1000,
					easing: Easing.ease,
					useNativeDriver: true,
				}),
				Animated.timing(pulseValue, {
					toValue: 1,
					duration: 1000,
					easing: Easing.ease,
					useNativeDriver: true,
				}),
			])
		).start()
	}

	const simulateSearch = async () => {
		try {
			// Шаг 1: Авторизация в СБИС
			setSearchProgress(20)
			console.log('🔐 Авторизация в СБИС...')

			const authResult = await sbisAuth(SBIS_CONFIG.login, SBIS_CONFIG.password)
			if (!authResult.success) {
				console.error('❌ Ошибка авторизации в СБИС:', authResult.error)
				Alert.alert(
					'Ошибка подключения к СБИС',
					'Не удалось авторизоваться в системе СБИС. Проверьте настройки в sbisConfig.js',
					[{ text: 'OK' }]
				)
				setCurrentStep(STEPS.INN)
				return
			}

			console.log('✅ Авторизация в СБИС успешна')
			await new Promise(resolve => setTimeout(resolve, 500))

			// Шаг 2: Поиск клиента в CRM СБИС (ПРИОРИТЕТ!)
			setSearchProgress(40)
			console.log('🔍 Поиск клиента в CRM СБИС по ИНН:', inn)

			let companyResult = { success: false, data: null }
			let crmData = null
			let totalSpent = 0
			let invoicesCount = 0

			// НОВЫЙ ПОДХОД: Сначала ищем в вашей CRM СБИС
			const crmResult = await sbisGetClientFromCRM(inn)

			if (crmResult.success && crmResult.data?.found) {
				console.log('✅ Клиент найден в CRM СБИС!')
				crmData = crmResult.data

				// Используем данные из CRM
				companyResult.success = true
				companyResult.data = {
					inn: crmData.contractor.inn,
					kpp: crmData.contractor.kpp,
					ogrn: crmData.contractor.ogrn,
					name: crmData.contractor.name || crmData.contractor.shortName,
					fullName: crmData.contractor.name,
					address: crmData.contractor.address,
					phone: crmData.contractor.phone,
					email: crmData.contractor.email,
					director: crmData.contractor.director,
					// Данные из CRM
					deals: crmData.deals || [],
					documents: crmData.documents || [],
				}

				// Считаем общую сумму из сделок и документов
				totalSpent = crmData.deals.reduce(
					(sum, deal) => sum + (parseFloat(deal.amount) || 0),
					0
				)
				invoicesCount = crmData.documents.length

				console.log(
					`📊 Найдено сделок: ${crmData.deals.length}, документов: ${crmData.documents.length}`
				)
				console.log(`💰 Общая сумма сделок: ${totalSpent}`)
			} else {
				console.log('⚠️ Клиент не найден в CRM, ищем в публичной базе ЕГРЮЛ...')

				// FALLBACK: Если не найдено в CRM - ищем в публичной базе "Все о компаниях"
				companyResult = await sbisSearchByInn(inn)

				if (!companyResult.success) {
					// Если не нашли через поиск, пробуем получить информацию напрямую
					const infoResult = await sbisGetCompanyInfo(inn)
					if (!infoResult.success) {
						// Если всё равно не нашли - используем моковые данные для демо
						console.log(
							'❌ Компания не найдена ни в CRM, ни в ЕГРЮЛ, используем демо-данные'
						)
					} else {
						companyResult.data = infoResult.data
						companyResult.success = true
					}
				}

				// Если нашли в ЕГРЮЛ - пытаемся получить историю платежей
				if (companyResult.success) {
					try {
						const paymentsResult = await sbisGetPaymentHistory(inn)
						if (paymentsResult.success) {
							totalSpent = paymentsResult.data.totalSpent || 0
							invoicesCount = paymentsResult.data.payments?.length || 0
						}
					} catch (e) {
						console.log('Не удалось получить историю платежей:', e)
					}
				}
			}

			// Шаг 3: Загрузка данных компании
			setSearchProgress(60)
			await new Promise(resolve => setTimeout(resolve, 500))

			// Шаг 4: Проверка счетов и платежей (уже подсчитано выше)
			setSearchProgress(80)

			// Шаг 5: Завершение
			setSearchProgress(100)
			await new Promise(resolve => setTimeout(resolve, 300))

			// Устанавливаем данные компании
			if (companyResult.success && companyResult.data) {
				// Формируем имя компании
				let displayName = companyResult.data.name || companyResult.data.fullName
				const isIP = inn.length === 12

				// Если имя отсутствует или слишком короткое - используем введенное пользователем
				if (
					!displayName ||
					displayName.length < 3 ||
					displayName === 'ИП' ||
					displayName === 'Организация' ||
					displayName === `Контрагент ${inn}`
				) {
					// Используем название из формы, если оно есть
					displayName =
						companyName ||
						(isIP ? `ИП (ИНН: ${inn})` : `Организация (ИНН: ${inn})`)
				}

				setCompanyData({
					name: displayName,
					fullName: companyResult.data.fullName || displayName,
					inn: companyResult.data.inn || inn,
					kpp: companyResult.data.kpp,
					ogrn: companyResult.data.ogrn,
					address: companyResult.data.address,
					director: companyResult.data.director,
					type: companyResult.data.type || (isIP ? 'INDIVIDUAL' : 'LEGAL'),
					totalSpent: totalSpent,
					invoicesCount: invoicesCount,
					source: crmData ? 'crm' : companyResult.source || 'api', // Помечаем источник данных
					isVerified:
						companyResult.data.name && companyResult.data.name.length > 3,
					// Дополнительные данные из CRM СБИС
					phone: companyResult.data.phone,
					email: companyResult.data.email,
					deals: companyResult.data.deals || [],
					documents: companyResult.data.documents || [],
					dealsCount: companyResult.data.deals?.length || 0,
					documentsCount: companyResult.data.documents?.length || 0,
					fromCRM: !!crmData, // Флаг, что данные из CRM
				})

				console.log('✅ Данные компании установлены:', {
					name: companyName,
					source: crmData ? 'CRM СБИС' : 'ЕГРЮЛ',
					deals: companyResult.data.deals?.length || 0,
					documents: companyResult.data.documents?.length || 0,
					totalSpent: totalSpent,
				})
			} else {
				// Данные не найдены - используем введенные пользователем
				const isIP = inn.length === 12
				setCompanyData({
					name:
						companyName ||
						(isIP ? `ИП (ИНН: ${inn})` : `Организация (ИНН: ${inn})`),
					inn: inn,
					type: isIP ? 'INDIVIDUAL' : 'LEGAL',
					totalSpent: 0,
					invoicesCount: 0,
					isDemo: true,
					isVerified: false,
					fromCRM: false,
					message: 'Данные введены вручную',
				})
			}

			setCurrentStep(STEPS.SUCCESS)
		} catch (error) {
			console.error('Ошибка поиска в СБИС:', error)
			// В случае ошибки показываем демо-данные
			setCompanyData({
				name: `Организация ИНН ${inn}`,
				inn: inn,
				totalSpent: 0,
				invoicesCount: 0,
				isDemo: true,
				error: error.message,
			})
			setCurrentStep(STEPS.SUCCESS)
		}
	}

	const formatPhone = text => {
		// Убираем все нецифровые символы
		const cleaned = text.replace(/\D/g, '')

		// Форматируем номер
		let formatted = ''
		if (cleaned.length > 0) {
			formatted = '+7'
			if (cleaned.length > 1) {
				formatted += ' (' + cleaned.substring(1, 4)
			}
			if (cleaned.length > 4) {
				formatted += ') ' + cleaned.substring(4, 7)
			}
			if (cleaned.length > 7) {
				formatted += '-' + cleaned.substring(7, 9)
			}
			if (cleaned.length > 9) {
				formatted += '-' + cleaned.substring(9, 11)
			}
		}
		return formatted
	}

	const handlePhoneChange = text => {
		const formatted = formatPhone(text)
		setPhone(formatted)
	}

	const validateStep1 = () => {
		if (!phone || phone.length < 18) {
			Alert.alert('Ошибка', 'Введите корректный номер телефона')
			return false
		}
		if (!email || !email.includes('@')) {
			Alert.alert('Ошибка', 'Введите корректный email')
			return false
		}
		if (password.length < 6) {
			Alert.alert('Ошибка', 'Пароль должен содержать минимум 6 символов')
			return false
		}
		if (password !== confirmPassword) {
			Alert.alert('Ошибка', 'Пароли не совпадают')
			return false
		}
		return true
	}

	const validateStep2 = () => {
		if (!inn || inn.length < 10) {
			Alert.alert('Ошибка', 'Введите корректный ИНН (10 или 12 цифр)')
			return false
		}
		if (!companyName || companyName.trim().length < 3) {
			Alert.alert('Ошибка', 'Введите название организации')
			return false
		}
		return true
	}

	const handleNextStep = () => {
		if (currentStep === STEPS.CREDENTIALS) {
			if (validateStep1()) {
				setCurrentStep(STEPS.INN)
			}
		} else if (currentStep === STEPS.INN) {
			if (validateStep2()) {
				setCurrentStep(STEPS.SEARCHING)
			}
		}
	}

	const handleComplete = async () => {
		setLoading(true)
		try {
			// Регистрация с API
			const response = await api.post('/auth/register', {
				phone: phone.replace(/\D/g, ''),
				email: email.trim().toLowerCase(),
				password,
				name: companyData?.name || companyData?.fullName || `Клиент ${inn}`,
				inn: inn,
			})
			await signUp(response.data.token)
			Alert.alert(
				'Успешно!',
				'Регистрация завершена. Добро пожаловать в WorldCashBox!',
				[{ text: 'OK' }]
			)
		} catch (error) {
			console.error('Registration error:', error.response?.data)
			const errorMsg =
				error.response?.data?.errors?.[0]?.msg ||
				error.response?.data?.error ||
				'Ошибка при регистрации'
			Alert.alert('Ошибка регистрации', errorMsg)
		} finally {
			setLoading(false)
		}
	}

	const spin = spinValue.interpolate({
		inputRange: [0, 1],
		outputRange: ['0deg', '360deg'],
	})

	const renderStepIndicator = () => (
		<View style={styles.stepIndicator}>
			{[1, 2, 3].map(step => (
				<View key={step} style={styles.stepWrapper}>
					<View
						style={[
							styles.stepCircle,
							currentStep >= step && styles.stepCircleActive,
							currentStep > step && styles.stepCircleCompleted,
						]}
					>
						{currentStep > step ? (
							<Text style={styles.stepCheckmark}>✓</Text>
						) : (
							<Text
								style={[
									styles.stepNumber,
									currentStep >= step && styles.stepNumberActive,
								]}
							>
								{step}
							</Text>
						)}
					</View>
					{step < 3 && (
						<View
							style={[
								styles.stepLine,
								currentStep > step && styles.stepLineActive,
							]}
						/>
					)}
				</View>
			))}
		</View>
	)

	const renderCredentialsStep = () => (
		<View style={styles.stepContent}>
			<Text style={styles.stepTitle}>Создание аккаунта</Text>
			<Text style={styles.stepSubtitle}>
				Введите ваши данные для регистрации
			</Text>

			<View style={styles.inputContainer}>
				<Text style={styles.inputLabel}>Номер телефона</Text>
				<TextInput
					style={styles.input}
					placeholder='+7 (___) ___-__-__'
					placeholderTextColor={colors.textMuted}
					value={phone}
					onChangeText={handlePhoneChange}
					keyboardType='phone-pad'
					maxLength={18}
				/>
			</View>

			<View style={styles.inputContainer}>
				<Text style={styles.inputLabel}>Email</Text>
				<TextInput
					style={styles.input}
					placeholder='example@company.ru'
					placeholderTextColor={colors.textMuted}
					value={email}
					onChangeText={setEmail}
					keyboardType='email-address'
					autoCapitalize='none'
					autoComplete='email'
				/>
			</View>

			<View style={styles.inputContainer}>
				<Text style={styles.inputLabel}>Пароль</Text>
				<TextInput
					style={styles.input}
					placeholder='Минимум 6 символов'
					placeholderTextColor={colors.textMuted}
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					autoCapitalize='none'
				/>
			</View>

			<View style={styles.inputContainer}>
				<Text style={styles.inputLabel}>Подтвердите пароль</Text>
				<TextInput
					style={styles.input}
					placeholder='Повторите пароль'
					placeholderTextColor={colors.textMuted}
					value={confirmPassword}
					onChangeText={setConfirmPassword}
					secureTextEntry
					autoCapitalize='none'
				/>
			</View>
		</View>
	)

	const renderInnStep = () => (
		<View style={styles.stepContent}>
			<Text style={styles.stepTitle}>Данные организации</Text>
			<Text style={styles.stepSubtitle}>
				Введите ИНН и название вашей организации
			</Text>

			<View style={styles.innIconContainer}>
				<View style={styles.innIcon}>
					<Text style={styles.innIconText}>🏢</Text>
				</View>
			</View>

			<View style={styles.inputContainer}>
				<Text style={styles.inputLabel}>ИНН организации</Text>
				<TextInput
					style={[styles.input, styles.innInput]}
					placeholder='10 или 12 цифр'
					placeholderTextColor={colors.textMuted}
					value={inn}
					onChangeText={text => setInn(text.replace(/\D/g, ''))}
					keyboardType='numeric'
					maxLength={12}
				/>
			</View>

			<View style={styles.inputContainer}>
				<Text style={styles.inputLabel}>Название организации</Text>
				<TextInput
					style={[styles.input]}
					placeholder='ООО "Ваша Компания" или ИП Иванов'
					placeholderTextColor={colors.textMuted}
					value={companyName}
					onChangeText={setCompanyName}
					autoCapitalize='words'
				/>
			</View>

			<View style={styles.innHint}>
				<Text style={styles.innHintText}>
					💡 Мы попробуем найти вашу компанию в CRM СБИС. Если не найдем - будет
					использовано введенное вами название
				</Text>
			</View>
		</View>
	)

	const renderSearchingStep = () => (
		<View style={styles.searchingContent}>
			<Animated.View
				style={[
					styles.searchingIconContainer,
					{
						transform: [{ rotate: spin }, { scale: pulseValue }],
					},
				]}
			>
				<View style={styles.searchingIcon}>
					<Text style={styles.searchingIconText}>🔍</Text>
				</View>
			</Animated.View>

			<Text style={styles.searchingTitle}>Ищем вас в системе...</Text>
			<Text style={styles.searchingSubtitle}>ИНН: {inn}</Text>

			<View style={styles.progressContainer}>
				<View style={styles.progressBar}>
					<View
						style={[styles.progressFill, { width: `${searchProgress}%` }]}
					/>
				</View>
				<Text style={styles.progressText}>{searchProgress}%</Text>
			</View>

			<View style={styles.searchSteps}>
				<Text
					style={[
						styles.searchStep,
						searchProgress >= 20 && styles.searchStepActive,
					]}
				>
					✓ Авторизация в СБИС
				</Text>
				<Text
					style={[
						styles.searchStep,
						searchProgress >= 40 && styles.searchStepActive,
					]}
				>
					✓ Поиск в вашей CRM
				</Text>
				<Text
					style={[
						styles.searchStep,
						searchProgress >= 60 && styles.searchStepActive,
					]}
				>
					✓ Загрузка данных
				</Text>
				<Text
					style={[
						styles.searchStep,
						searchProgress >= 80 && styles.searchStepActive,
					]}
				>
					✓ Загрузка сделок и документов
				</Text>
				<Text
					style={[
						styles.searchStep,
						searchProgress >= 100 && styles.searchStepActive,
					]}
				>
					✓ Завершение
				</Text>
			</View>
		</View>
	)

	const renderSuccessStep = () => (
		<View style={styles.successContent}>
			<View style={styles.successIconContainer}>
				<Text style={styles.successIcon}>🎉</Text>
			</View>

			<Text style={styles.successTitle}>Мы нашли вас!</Text>
			<Text style={styles.successSubtitle}>
				Добро пожаловать в WorldCashBox
			</Text>

			<View style={styles.companyCard}>
				<Text style={styles.companyName}>{companyData?.name}</Text>
				<Text style={styles.companyInn}>ИНН: {companyData?.inn}</Text>
				{companyData?.kpp && (
					<Text style={styles.companyInn}>КПП: {companyData?.kpp}</Text>
				)}
				{companyData?.ogrn && (
					<Text style={styles.companyInn}>
						{companyData?.type === 'INDIVIDUAL' ? 'ОГРНИП' : 'ОГРН'}:{' '}
						{companyData?.ogrn}
					</Text>
				)}
				{companyData?.address && (
					<Text style={styles.companyAddress}>{companyData?.address}</Text>
				)}
				{companyData?.director && (
					<Text style={styles.companyInn}>
						Руководитель: {companyData?.director}
					</Text>
				)}

				{/* Показываем бейдж в зависимости от источника данных */}
				{companyData?.fromCRM ? (
					<View style={styles.verifiedBadge}>
						<Text style={styles.verifiedBadgeText}>
							✓ Данные загружены из вашей CRM СБИС
						</Text>
					</View>
				) : companyData?.isVerified && !companyData?.isDemo ? (
					<View style={styles.verifiedBadge}>
						<Text style={styles.verifiedBadgeText}>
							✓ Данные подтверждены из ЕГРЮЛ
						</Text>
					</View>
				) : null}

				{/* Показываем статистику по сделкам и документам */}
				{companyData?.fromCRM &&
					(companyData?.dealsCount > 0 || companyData?.documentsCount > 0) && (
						<View style={styles.companyStats}>
							<View style={styles.companyStat}>
								<Text style={styles.companyStatValue}>
									{companyData.dealsCount}
								</Text>
								<Text style={styles.companyStatLabel}>
									{companyData.dealsCount === 1 ? 'Сделка' : 'Сделок'}
								</Text>
							</View>
							<View style={styles.companyStatDivider} />
							<View style={styles.companyStat}>
								<Text style={styles.companyStatValue}>
									{companyData.documentsCount}
								</Text>
								<Text style={styles.companyStatLabel}>
									{companyData.documentsCount === 1 ? 'Документ' : 'Документов'}
								</Text>
							</View>
							{companyData.totalSpent > 0 && (
								<>
									<View style={styles.companyStatDivider} />
									<View style={styles.companyStat}>
										<Text style={styles.companyStatValue}>
											{Math.round(companyData.totalSpent).toLocaleString(
												'ru-RU'
											)}{' '}
											₽
										</Text>
										<Text style={styles.companyStatLabel}>Сумма сделок</Text>
									</View>
								</>
							)}
						</View>
					)}

				{/* Демо бейдж для данных не из CRM */}
				{companyData?.isDemo && (
					<View style={styles.demoBadge}>
						<Text style={styles.demoBadgeText}>
							{companyData.message ||
								'Данные будут загружены после настройки интеграции'}
						</Text>
					</View>
				)}
			</View>

			<Text style={styles.successHint}>
				{companyData?.fromCRM
					? 'Все данные из вашей CRM успешно загружены!'
					: 'Нажмите "Завершить регистрацию" чтобы создать аккаунт'}
			</Text>
		</View>
	)

	const renderCurrentStep = () => {
		switch (currentStep) {
			case STEPS.CREDENTIALS:
				return renderCredentialsStep()
			case STEPS.INN:
				return renderInnStep()
			case STEPS.SEARCHING:
				return renderSearchingStep()
			case STEPS.SUCCESS:
				return renderSuccessStep()
			default:
				return null
		}
	}

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={styles.container}
		>
			<ScrollView
				contentContainerStyle={styles.scrollContent}
				keyboardShouldPersistTaps='handled'
			>
				{/* Логотип */}
				<View style={styles.logoContainer}>
					<View style={styles.logo}>
						<Text style={styles.logoText}>W</Text>
					</View>
					<Text style={styles.brandName}>WorldCashBox</Text>
				</View>

				{/* Индикатор шагов */}
				{currentStep !== STEPS.SEARCHING && renderStepIndicator()}

				{/* Содержимое текущего шага */}
				{renderCurrentStep()}

				{/* Кнопки */}
				{currentStep !== STEPS.SEARCHING && (
					<View style={styles.buttonContainer}>
						{currentStep === STEPS.SUCCESS ? (
							<TouchableOpacity
								style={[styles.button, loading && styles.buttonDisabled]}
								onPress={handleComplete}
								disabled={loading}
							>
								{loading ? (
									<ActivityIndicator color='#fff' />
								) : (
									<Text style={styles.buttonText}>Завершить регистрацию</Text>
								)}
							</TouchableOpacity>
						) : (
							<TouchableOpacity style={styles.button} onPress={handleNextStep}>
								<Text style={styles.buttonText}>
									{currentStep === STEPS.CREDENTIALS
										? 'Далее'
										: 'Найти компанию'}
								</Text>
							</TouchableOpacity>
						)}

						{currentStep === STEPS.INN && (
							<TouchableOpacity
								style={styles.backButton}
								onPress={() => setCurrentStep(STEPS.CREDENTIALS)}
							>
								<Text style={styles.backButtonText}>← Назад</Text>
							</TouchableOpacity>
						)}

						{currentStep === STEPS.CREDENTIALS && (
							<TouchableOpacity
								style={styles.linkButton}
								onPress={() => navigation.navigate('Login')}
							>
								<Text style={styles.linkText}>Уже есть аккаунт? Войти</Text>
							</TouchableOpacity>
						)}
					</View>
				)}
			</ScrollView>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	scrollContent: {
		flexGrow: 1,
		padding: 20,
		paddingTop: 60,
	},
	logoContainer: {
		alignItems: 'center',
		marginBottom: 30,
	},
	logo: {
		width: 70,
		height: 70,
		borderRadius: 35,
		backgroundColor: colors.primary,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 12,
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 8,
	},
	logoText: {
		fontSize: 32,
		fontWeight: 'bold',
		color: colors.textLight,
	},
	brandName: {
		fontSize: 24,
		fontWeight: 'bold',
		color: colors.primary,
	},
	stepIndicator: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 30,
	},
	stepWrapper: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	stepCircle: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: colors.backgroundWhite,
		borderWidth: 2,
		borderColor: colors.border,
		justifyContent: 'center',
		alignItems: 'center',
	},
	stepCircleActive: {
		borderColor: colors.primary,
		backgroundColor: colors.primary,
	},
	stepCircleCompleted: {
		backgroundColor: colors.success,
		borderColor: colors.success,
	},
	stepNumber: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textMuted,
	},
	stepNumberActive: {
		color: colors.textLight,
	},
	stepCheckmark: {
		fontSize: 16,
		color: colors.textLight,
		fontWeight: 'bold',
	},
	stepLine: {
		width: 40,
		height: 2,
		backgroundColor: colors.border,
		marginHorizontal: 8,
	},
	stepLineActive: {
		backgroundColor: colors.success,
	},
	stepContent: {
		flex: 1,
	},
	stepTitle: {
		fontSize: 26,
		fontWeight: 'bold',
		color: colors.textDark,
		textAlign: 'center',
		marginBottom: 8,
	},
	stepSubtitle: {
		fontSize: 15,
		color: colors.textMuted,
		textAlign: 'center',
		marginBottom: 30,
		lineHeight: 22,
	},
	inputContainer: {
		marginBottom: 16,
	},
	inputLabel: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textSecondary,
		marginBottom: 8,
	},
	input: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 12,
		padding: 16,
		fontSize: 16,
		borderWidth: 1.5,
		borderColor: colors.border,
		color: colors.textDark,
	},
	innIconContainer: {
		alignItems: 'center',
		marginBottom: 30,
	},
	innIcon: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: colors.backgroundLight,
		justifyContent: 'center',
		alignItems: 'center',
	},
	innIconText: {
		fontSize: 40,
	},
	innInput: {
		fontSize: 22,
		textAlign: 'center',
		letterSpacing: 2,
		fontWeight: '600',
	},
	innHint: {
		backgroundColor: colors.backgroundLight,
		borderRadius: 12,
		padding: 16,
		marginTop: 20,
	},
	innHintText: {
		fontSize: 14,
		color: colors.textSecondary,
		lineHeight: 20,
	},
	searchingContent: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 40,
	},
	searchingIconContainer: {
		marginBottom: 30,
	},
	searchingIcon: {
		width: 100,
		height: 100,
		borderRadius: 50,
		backgroundColor: colors.primaryLight,
		justifyContent: 'center',
		alignItems: 'center',
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 8,
	},
	searchingIconText: {
		fontSize: 50,
	},
	searchingTitle: {
		fontSize: 24,
		fontWeight: 'bold',
		color: colors.textDark,
		marginBottom: 8,
	},
	searchingSubtitle: {
		fontSize: 16,
		color: colors.textMuted,
		marginBottom: 30,
	},
	progressContainer: {
		width: '100%',
		marginBottom: 30,
	},
	progressBar: {
		height: 8,
		backgroundColor: colors.border,
		borderRadius: 4,
		overflow: 'hidden',
		marginBottom: 8,
	},
	progressFill: {
		height: '100%',
		backgroundColor: colors.primary,
		borderRadius: 4,
	},
	progressText: {
		textAlign: 'center',
		fontSize: 14,
		color: colors.textSecondary,
		fontWeight: '600',
	},
	searchSteps: {
		width: '100%',
		paddingHorizontal: 20,
	},
	searchStep: {
		fontSize: 14,
		color: colors.textMuted,
		paddingVertical: 6,
	},
	searchStepActive: {
		color: colors.success,
		fontWeight: '500',
	},
	successContent: {
		flex: 1,
		alignItems: 'center',
		paddingVertical: 20,
	},
	successIconContainer: {
		marginBottom: 20,
	},
	successIcon: {
		fontSize: 60,
	},
	successTitle: {
		fontSize: 26,
		fontWeight: 'bold',
		color: colors.success,
		marginBottom: 8,
	},
	successSubtitle: {
		fontSize: 16,
		color: colors.textSecondary,
		marginBottom: 24,
	},
	verifiedBadge: {
		backgroundColor: colors.success + '20',
		borderRadius: 8,
		padding: 10,
		marginTop: 16,
		alignItems: 'center',
	},
	verifiedBadgeText: {
		fontSize: 14,
		color: colors.success,
		fontWeight: '600',
	},
	companyCard: {
		backgroundColor: colors.backgroundWhite,
		borderRadius: 16,
		padding: 24,
		width: '100%',
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 4,
		marginBottom: 20,
	},
	companyName: {
		fontSize: 20,
		fontWeight: 'bold',
		color: colors.textDark,
		marginBottom: 8,
		textAlign: 'center',
	},
	companyInn: {
		fontSize: 14,
		color: colors.textMuted,
		textAlign: 'center',
		marginBottom: 4,
	},
	companyAddress: {
		fontSize: 12,
		color: colors.textMuted,
		textAlign: 'center',
		marginTop: 8,
		marginBottom: 16,
		lineHeight: 18,
	},
	demoBadge: {
		backgroundColor: colors.warning + '20',
		borderRadius: 8,
		padding: 12,
		marginTop: 16,
	},
	demoBadgeText: {
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: 'center',
		lineHeight: 18,
	},
	companyStats: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		paddingTop: 16,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	companyStat: {
		alignItems: 'center',
		flex: 1,
	},
	companyStatValue: {
		fontSize: 22,
		fontWeight: 'bold',
		color: colors.primary,
		marginBottom: 4,
	},
	companyStatLabel: {
		fontSize: 12,
		color: colors.textMuted,
	},
	companyStatDivider: {
		width: 1,
		backgroundColor: colors.borderLight,
	},
	successHint: {
		fontSize: 14,
		color: colors.textMuted,
		textAlign: 'center',
		lineHeight: 20,
	},
	buttonContainer: {
		marginTop: 20,
	},
	button: {
		backgroundColor: colors.primary,
		borderRadius: 12,
		padding: 18,
		alignItems: 'center',
		shadowColor: colors.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 4,
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	buttonText: {
		color: colors.textLight,
		fontSize: 17,
		fontWeight: '600',
	},
	backButton: {
		marginTop: 16,
		alignItems: 'center',
		padding: 12,
	},
	backButtonText: {
		color: colors.textSecondary,
		fontSize: 15,
		fontWeight: '500',
	},
	linkButton: {
		marginTop: 20,
		alignItems: 'center',
		padding: 12,
	},
	linkText: {
		color: colors.primary,
		fontSize: 15,
		fontWeight: '500',
	},
})
