import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { format } from 'date-fns';
import ru from 'date-fns/locale/ru';
import colors from '../theme/colors';

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  // Обновляем уведомления при возврате на экран
  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('focus', () => {
      loadNotifications();
    });
    return unsubscribe;
  }, [navigation]);

  // Обновляем уведомления при возврате на экран
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadNotifications();
    });
    return unsubscribe;
  }, [navigation]);

  const loadNotifications = async () => {
    try {
      // Загружаем уведомления с сервера
      const response = await api.get('/notifications?limit=50');
      const notificationsData = response.data || [];
      
      // Логируем уведомления для отладки
      console.log('Loaded notifications:', notificationsData.map(n => ({
        id: n.id,
        type: n.type,
        related_type: n.related_type,
        related_id: n.related_id,
        message: n.message?.substring(0, 50)
      })));
      
      // Добавляем иконки в зависимости от типа
      const notificationsWithIcons = notificationsData.map(notif => ({
        ...notif,
        icon: getNotificationIcon(notif.type),
      }));
      
      setNotifications(notificationsWithIcons);
    } catch (error) {
      console.error('Error loading notifications:', error);
      // В случае ошибки показываем пустой список
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getNotificationIcon = (type) => {
    const iconMap = {
      invoice: { name: 'description', library: 'MaterialIcons' },
      payment: { name: 'check-circle', library: 'MaterialIcons' },
      service: { name: 'room-service', library: 'MaterialIcons' },
      reminder: { name: 'alarm', library: 'MaterialIcons' },
      info: { name: 'info', library: 'MaterialIcons' },
      sync: { name: 'sync', library: 'MaterialIcons' },
      order: { name: 'shopping-cart', library: 'MaterialIcons' },
      support: { name: 'support-agent', library: 'MaterialIcons' },
    };
    return iconMap[type] || { name: 'notifications', library: 'MaterialIcons' };
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (id) => {
    try {
      // Обновляем локально сразу для быстрой реакции
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
      
      // Отправляем запрос на сервер
      await api.put(`/notifications/${id}/read`);
      console.log('Notification marked as read:', id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Откатываем изменение при ошибке
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: false } : n))
      );
    }
  };

  const markAllAsRead = async () => {
    try {
      // Обновляем локально сразу
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      
      // Отправляем запрос на сервер
      await api.put('/notifications/read-all');
      console.log('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      // Перезагружаем уведомления при ошибке
      loadNotifications();
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} дн назад`;
    
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleNotificationPress = async (notification) => {
    // Отмечаем как прочитанное
    await markAsRead(notification.id);
    
    console.log('Notification pressed:', {
      id: notification.id,
      type: notification.type,
      related_type: notification.related_type,
      related_id: notification.related_id,
      message: notification.message
    });
    
    // Переходим в нужное место в зависимости от типа
    // Приоритет 1: related_id и related_type (самый надежный способ)
    if (notification.related_type === 'ticket' && notification.related_id) {
      console.log('Navigating to ticket:', notification.related_id);
      navigation.navigate('ClientTicketDetail', { ticketId: notification.related_id });
      return;
    }
    
    // Приоритет 2: Парсим ticket ID из сообщения для уведомлений типа support
    if (notification.type === 'support') {
      // Пробуем разные варианты парсинга ID тикета
      // Вариант 1: "тикет #14" или "тикет: 14" или "тикет 14"
      let ticketMatch = notification.message.match(/тикет[:\s#]*(\d+)/i);
      // Вариант 2: "тикет: тест" - ищем ID в базе по subject
      if (!ticketMatch) {
        ticketMatch = notification.message.match(/тикет[:\s#]*([^:]+)/i);
      }
      // Вариант 3: ищем просто число в начале или конце сообщения
      if (!ticketMatch) {
        ticketMatch = notification.message.match(/(\d+)/);
      }
      
      if (ticketMatch) {
        const ticketId = parseInt(ticketMatch[1]);
        if (!isNaN(ticketId) && ticketId > 0) {
          console.log('Parsed ticket ID from message:', ticketId);
          navigation.navigate('ClientTicketDetail', { ticketId });
          return;
        }
      }
      
      // Если не удалось найти ID, идем в общий раздел поддержки
      console.log('Could not parse ticket ID, navigating to Support');
      navigation.navigate('Support');
      return;
    }
    
    // Обработка других типов уведомлений
    if (notification.related_type === 'order' && notification.related_id) {
      navigation.navigate('Services');
      return;
    }
    
    if (notification.type === 'order') {
      navigation.navigate('Services');
      return;
    }
    
    if (notification.type === 'payment' || notification.type === 'charge') {
      navigation.navigate('Balance');
      return;
    }
    
    if (notification.type === 'invoice') {
      navigation.navigate('History');
      return;
    }
    
    // По умолчанию - ничего не делаем или показываем уведомление
    console.log('No navigation handler for notification type:', notification.type);
  };

  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.is_read && styles.notificationUnread]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationIcon}>
        {item.icon.library === 'Ionicons' ? (
          <Ionicons name={item.icon.name} size={24} color={colors.primary} />
        ) : (
          <MaterialIcons name={item.icon.name} size={24} color={colors.primary} />
        )}
      </View>
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <Text style={styles.notificationTitle}>{item.title}</Text>
          {!item.is_read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.notificationMessage}>{item.message}</Text>
        <Text style={styles.notificationTime}>{formatDate(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Заголовок */}
      {unreadCount > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {unreadCount} непрочитанных
          </Text>
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markAllButton}>Прочитать все</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Список уведомлений */}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
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
            <MaterialIcons name="notifications-none" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Нет уведомлений</Text>
            <Text style={styles.emptySubtext}>
              Здесь будут появляться уведомления о счетах, платежах и услугах
            </Text>
          </View>
        }
      />
    </View>
  );
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.primaryLight + '15',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  markAllButton: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  notificationItem: {
    flexDirection: 'row',
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
  notificationUnread: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primaryLight + '08',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 22,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    flex: 1,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 50,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
