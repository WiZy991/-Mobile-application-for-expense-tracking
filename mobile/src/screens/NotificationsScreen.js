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
<<<<<<< HEAD
import { api } from '../services/api';
import { format } from 'date-fns';
import ru from 'date-fns/locale/ru';
=======
import colors from '../theme/colors';
>>>>>>> 86fa44cdf55de05b6875cdfda4f46151993974b2

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      // Симуляция загрузки
      await new Promise(resolve => setTimeout(resolve, 500));

      // Моковые уведомления
      setNotifications([
        {
          id: 1,
          type: 'invoice',
          title: 'Новый счёт',
          message: 'Выставлен счёт СЧ-2024-046 на сумму 15 000 ₽',
          created_at: new Date().toISOString(),
          is_read: false,
          icon: '📄',
        },
        {
          id: 2,
          type: 'payment',
          title: 'Оплата получена',
          message: 'Ваш платёж на сумму 10 000 ₽ успешно зачислен',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          is_read: false,
          icon: '✅',
        },
        {
          id: 3,
          type: 'service',
          title: 'Услуга активирована',
          message: 'Подключена услуга "Расширенная техподдержка"',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          is_read: true,
          icon: '⚡',
        },
        {
          id: 4,
          type: 'reminder',
          title: 'Напоминание об оплате',
          message: 'До истечения срока оплаты счёта СЧ-2024-042 осталось 3 дня',
          created_at: new Date(Date.now() - 172800000).toISOString(),
          is_read: true,
          icon: '⏰',
        },
        {
          id: 5,
          type: 'info',
          title: 'Обновление каталога',
          message: 'В каталоге появились новые услуги. Ознакомьтесь!',
          created_at: new Date(Date.now() - 259200000).toISOString(),
          is_read: true,
          icon: '🆕',
        },
        {
          id: 6,
          type: 'sync',
          title: 'Синхронизация СБИС',
          message: 'Данные успешно синхронизированы с системой СБИС',
          created_at: new Date(Date.now() - 345600000).toISOString(),
          is_read: true,
          icon: '🔄',
        },
      ]);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
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

  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.is_read && styles.notificationUnread]}
      onPress={() => markAsRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationIcon}>
        <Text style={styles.iconText}>{item.icon}</Text>
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
            <Text style={styles.emptyIcon}>🔔</Text>
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
