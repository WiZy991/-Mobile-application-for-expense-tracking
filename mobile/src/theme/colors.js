// Цветовая схема WorldCashBox - светло-зеленые тона
export const colors = {
  // Основные цвета
  primary: '#2E7D32',           // Основной зеленый
  primaryLight: '#4CAF50',      // Светлый зеленый
  primaryDark: '#1B5E20',       // Темный зеленый
  primarySoft: '#81C784',       // Мягкий зеленый
  
  // Акцентные цвета
  accent: '#00C853',            // Яркий акцент
  accentLight: '#69F0AE',       // Светлый акцент
  
  // Фоны
  background: '#F1F8E9',        // Основной фон (светло-зеленый)
  backgroundWhite: '#FFFFFF',   // Белый фон
  backgroundCard: '#FFFFFF',    // Фон карточек
  backgroundLight: '#E8F5E9',   // Легкий зеленоватый фон
  
  // Текст
  textPrimary: '#1B5E20',       // Основной текст
  textSecondary: '#558B2F',     // Вторичный текст
  textDark: '#212121',          // Темный текст
  textMuted: '#757575',         // Приглушенный текст
  textLight: '#FFFFFF',         // Светлый текст
  
  // Статусы
  success: '#4CAF50',           // Успех
  warning: '#FFC107',           // Предупреждение
  error: '#F44336',             // Ошибка
  info: '#2196F3',              // Информация
  
  // Границы и разделители
  border: '#C8E6C9',            // Граница
  borderLight: '#E8F5E9',       // Легкая граница
  divider: '#DCEDC8',           // Разделитель
  
  // Тени и оверлеи
  shadow: 'rgba(46, 125, 50, 0.15)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  
  // Градиенты (для использования в LinearGradient)
  gradientStart: '#4CAF50',
  gradientEnd: '#2E7D32',
};

// Тени для разных платформ
export const shadows = {
  small: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
};

export default colors;

