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

export default function StaffNotificationsScreen({ navigation, route }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();
  }, []);

  // Обновляем уведомления при возврате на экран
  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('focus', () => {
      loadNotifications();
      loadUnreadCount();
    });
    return unsubscribe;
  }, [navigation]);

  const loadNotifications = async () => {
    try {
      const response = await api.get('/staff/notifications?limit=100');
      const notificationsData = response.data || [];
      
      // Добавляем иконки к уведомлениям
      const notificationsWithIcons = notificationsData.map(notif => ({
        ...notif,
        icon: getNotificationIcon(notif.type),
      }));
      
      setNotifications(notificationsWithIcons);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const response = await api.get('/staff/notifications/unread-count');
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const getNotificationIcon = (type) => {
    const iconMap = {
      support: { name: 'support-agent', library: 'MaterialIcons' },
      ticket: { name: 'chat', library: 'MaterialIcons' },
      message: { name: 'message', library: 'MaterialIcons' },
      system: { name: 'settings', library: 'MaterialIcons' },
    };
    return iconMap[type] || { name: 'notifications', library: 'MaterialIcons' };
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
    loadUnreadCount();
  };

  const markAsRead = async (id) => {
    try {
      // Обновляем локально сразу для быстрой реакции
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
      
      await api.put(`/staff/notifications/${id}/read`);
      loadUnreadCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Откатываем локальное изменение при ошибке
      loadNotifications();
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/staff/notifications/read-all');
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
      return 'Только что';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} ${minutes === 1 ? 'мин' : minutes < 5 ? 'мин' : 'мин'} назад`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} ${hours === 1 ? 'ч' : hours < 5 ? 'ч' : 'ч'} назад`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} назад`;
    } else {
      return format(date, 'dd.MM.yyyy', { locale: ru });
    }
  };

  const handleNotificationPress = async (notification) => {
    // Отмечаем как прочитанное
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    
    // Переходим в нужное место в зависимости от типа
    if (notification.related_type === 'ticket' && notification.related_id) {
      navigation.navigate('TicketDetail', { ticketId: notification.related_id });
      return;
    }
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
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.textLight} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Уведомления</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={markAllAsRead}
          >
            <Text style={styles.markAllText}>Отметить все</Text>
          </TouchableOpacity>
        )}
      </View>

      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>
            У вас {unreadCount} {unreadCount === 1 ? 'непрочитанное' : unreadCount < 5 ? 'непрочитанных' : 'непрочитанных'} уведомление{unreadCount === 1 ? '' : unreadCount < 5 ? 'я' : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={item => item.id.toString()}
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
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textLight,
    flex: 1,
    marginLeft: 8,
  },
  markAllButton: {
    padding: 8,
  },
  markAllText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '500',
  },
  unreadBanner: {
    backgroundColor: colors.primaryLight + '20',
    padding: 12,
    alignItems: 'center',
  },
  unreadBannerText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
  },
  notificationItem: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notificationUnread: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primaryLight + '10',
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 16,
  },
});
