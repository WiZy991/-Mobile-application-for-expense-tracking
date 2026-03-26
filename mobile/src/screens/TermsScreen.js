import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import colors from '../theme/colors'

export default function TermsScreen({ navigation }) {
	return (
		<ScrollView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Пользовательское соглашение</Text>
				<Text style={styles.date}>Дата последнего обновления: 01.01.2025</Text>

				<Text style={styles.sectionTitle}>1. Общие положения</Text>
				<Text style={styles.text}>
					Настоящее Пользовательское соглашение (далее — «Соглашение») регулирует
					отношения между WorldCashBox (далее — «Сервис», «мы») и пользователем
					(далее — «Пользователь», «вы») при использовании мобильного приложения
					WorldCashBox.
				</Text>

				<Text style={styles.sectionTitle}>2. Предмет соглашения</Text>
				<Text style={styles.text}>
					WorldCashBox предоставляет платформу для управления финансами,
					автоматизации бизнес-процессов и интеграции с системами учета, включая
					СБИС.
				</Text>

				<Text style={styles.sectionTitle}>3. Регистрация и аккаунт</Text>
				<Text style={styles.text}>
					• Вы несете ответственность за сохранность данных для входа{'\n'}
					• Вы обязуетесь предоставлять достоверную информацию{'\n'}
					• Запрещается передавать доступ к аккаунту третьим лицам
				</Text>

				<Text style={styles.sectionTitle}>4. Использование сервиса</Text>
				<Text style={styles.text}>
					• Вы обязуетесь использовать сервис в соответствии с законодательством
					РФ{'\n'}
					• Запрещается использование сервиса для незаконных целей{'\n'}
					• Мы оставляем за собой право ограничить доступ при нарушении правил
				</Text>

				<Text style={styles.sectionTitle}>5. Финансовые операции</Text>
				<Text style={styles.text}>
					• Все финансовые операции проходят через защищенные каналы{'\n'}
					• Вы несете ответственность за все операции, совершенные с вашего
					аккаунта{'\n'}
					• Возврат средств осуществляется в соответствии с законодательством
				</Text>

				<Text style={styles.sectionTitle}>6. Интеграция с СБИС</Text>
				<Text style={styles.text}>
					• Использование интеграции с СБИС требует наличия активного тарифа
					СБИС{'\n'}
					• Мы не несем ответственности за работу внешних сервисов{'\n'}
					• Данные синхронизируются в соответствии с настройками вашего аккаунта
					СБИС
				</Text>

				<Text style={styles.sectionTitle}>7. Ответственность</Text>
				<Text style={styles.text}>
					• Сервис предоставляется «как есть»{'\n'}
					• Мы не гарантируем бесперебойную работу сервиса{'\n'}
					• Мы не несем ответственности за косвенный ущерб
				</Text>

				<Text style={styles.sectionTitle}>8. Изменение соглашения</Text>
				<Text style={styles.text}>
					Мы оставляем за собой право изменять настоящее Соглашение. Изменения
					вступают в силу с момента публикации новой версии.
				</Text>

				<Text style={styles.sectionTitle}>9. Контакты</Text>
				<Text style={styles.text}>
					По всем вопросам обращайтесь в службу поддержки через приложение или
					на email: support@worldcashbox.ru
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
