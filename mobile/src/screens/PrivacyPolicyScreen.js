import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import colors from '../theme/colors'

export default function PrivacyPolicyScreen({ navigation }) {
	return (
		<ScrollView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Политика конфиденциальности</Text>
				<Text style={styles.date}>Дата последнего обновления: 01.01.2025</Text>

				<Text style={styles.sectionTitle}>1. Общие положения</Text>
				<Text style={styles.text}>
					Настоящая Политика конфиденциальности определяет порядок обработки и
					защиты персональных данных пользователей сервиса WorldCashBox.
				</Text>

				<Text style={styles.sectionTitle}>2. Какие данные мы собираем</Text>
				<Text style={styles.text}>
					Мы собираем следующие данные:{'\n'}
					• Имя, email, телефон{'\n'}
					• Данные организации (ИНН, КПП, ОГРН){'\n'}
					• Финансовые транзакции{'\n'}
					• Данные для интеграции с СБИС{'\n'}
					• Технические данные устройства
				</Text>

				<Text style={styles.sectionTitle}>3. Как мы используем данные</Text>
				<Text style={styles.text}>
					• Предоставление услуг сервиса{'\n'}
					• Обработка финансовых операций{'\n'}
					• Интеграция с внешними сервисами (СБИС){'\n'}
					• Улучшение качества сервиса{'\n'}
					• Отправка уведомлений
				</Text>

				<Text style={styles.sectionTitle}>4. Защита данных</Text>
				<Text style={styles.text}>
					• Все данные передаются по защищенным каналам (HTTPS){'\n'}
					• Пароли хранятся в зашифрованном виде{'\n'}
					• Доступ к данным имеют только авторизованные сотрудники{'\n'}
					• Регулярное резервное копирование данных
				</Text>

				<Text style={styles.sectionTitle}>5. Передача данных третьим лицам</Text>
				<Text style={styles.text}>
					Мы не передаем ваши персональные данные третьим лицам, за исключением:{'\n'}
					• Интеграции с СБИС (только с вашего согласия){'\n'}
					• Требований законодательства{'\n'}
					• Защиты прав и безопасности
				</Text>

				<Text style={styles.sectionTitle}>6. Ваши права</Text>
				<Text style={styles.text}>
					Вы имеете право:{'\n'}
					• Получить доступ к своим данным{'\n'}
					• Исправить неточные данные{'\n'}
					• Удалить свой аккаунт{'\n'}
					• Отозвать согласие на обработку данных
				</Text>

				<Text style={styles.sectionTitle}>7. Cookies и технологии отслеживания</Text>
				<Text style={styles.text}>
					Мы используем cookies и аналогичные технологии для:{'\n'}
					• Сохранения сессий{'\n'}
					• Улучшения работы приложения{'\n'}
					• Аналитики использования
				</Text>

				<Text style={styles.sectionTitle}>8. Хранение данных</Text>
				<Text style={styles.text}>
					• Данные хранятся на защищенных серверах{'\n'}
					• После удаления аккаунта данные удаляются в течение 30 дней{'\n'}
					• Некоторые данные могут храниться дольше в соответствии с
					законодательством
				</Text>

				<Text style={styles.sectionTitle}>9. Изменения в политике</Text>
				<Text style={styles.text}>
					Мы можем изменять настоящую Политику конфиденциальности. О значимых
					изменениях мы уведомим вас через приложение или email.
				</Text>

				<Text style={styles.sectionTitle}>10. Контакты</Text>
				<Text style={styles.text}>
					По вопросам конфиденциальности обращайтесь:{'\n'}
					Email: privacy@worldcashbox.ru{'\n'}
					Через службу поддержки в приложении
				</Text>

				<View style={styles.footer}>
					<Text style={styles.footerText}>
						© 2025 WorldCashBox. Все права защищены.
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
		fontSize: 24,
		fontWeight: 'bold',
		color: colors.textDark,
		marginBottom: 8,
	},
	date: {
		fontSize: 12,
		color: colors.textMuted,
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.textDark,
		marginTop: 20,
		marginBottom: 12,
	},
	text: {
		fontSize: 14,
		color: colors.textDark,
		lineHeight: 22,
		marginBottom: 16,
	},
	footer: {
		marginTop: 32,
		marginBottom: 40,
		paddingTop: 20,
		borderTopWidth: 1,
		borderTopColor: colors.borderLight,
	},
	footerText: {
		fontSize: 12,
		color: colors.textMuted,
		textAlign: 'center',
	},
})
