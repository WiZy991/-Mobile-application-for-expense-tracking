import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';
import { AuthContext } from '../context/AuthContext';

export default function StaffDashboardScreen({ navigation, route }) {
  const { signOut } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    closed: 0,
  });
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  useEffect(() => {
    loadData();
    loadUnreadNotificationsCount();
  }, []);

  // Обновляем данные при возврате на экран
  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('[StaffDashboard] Screen focused, reloading data...');
      loadData();
      loadUnreadNotificationsCount();
    });
    return unsubscribe;
  }, [navigation]);

  // Также обновляем данные при изменении параметров навигации (например, после изменения статуса)
  useEffect(() => {
    if (route?.params?.statusUpdated) {
      console.log('[StaffDashboard] Status was updated, reloading data...');
      loadData();
      // Сбрасываем параметр
      if (navigation) {
        navigation.setParams({ statusUpdated: false });
      }
    }
  }, [route?.params?.statusUpdated, navigation]);

  const loadData = async () => {
    try {
      // Загружаем тикеты поддержки
      const response = await api.get('/staff/support/tickets?limit=50');
      setTickets(response.data.tickets || []);
      
      // Подсчитываем статистику
      const allTickets = response.data.tickets || [];
      setStats({
        total: allTickets.length,
        open: allTickets.filter(t => t.status === 'open').length,
        inProgress: allTickets.filter(t => t.status === 'in_progress').length,
        closed: allTickets.filter(t => t.status === 'closed').length,
      });
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadUnreadNotificationsCount = async () => {
    try {
      const response = await api.get('/staff/notifications/unread-count');
      setUnreadNotificationsCount(response.data.count || 0);
    } catch (error) {
      console.error('Error loading unread notifications count:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadUnreadNotificationsCount();
  };

  const handleAssign = async (id) => {
    try {
      await api.post(`/staff/support/tickets/${id}/assign`);
      Alert.alert('Успешно', 'Заявка назначена на вас');
      loadData();
    } catch (error) {
      console.error('Error assigning:', error);
      Alert.alert('Ошибка', 'Не удалось назначить заявку');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#ff4444';
      case 'high': return '#ff8800';
      case 'normal': return colors.primary;
      case 'low': return colors.textMuted;
      default: return colors.primary;
    }
  };

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Кабинет поддержки
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.notificationsButton}
            onPress={() => navigation.navigate('StaffNotifications')}
          >
            <MaterialIcons name="notifications" size={24} color={colors.textLight} />
            {unreadNotificationsCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.analyticsButton}
            onPress={() => navigation.navigate('StaffAnalytics', { staffRole: 'support' })}
          >
            <MaterialIcons name="bar-chart" size={24} color={colors.textLight} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={async () => {
              // Выход из кабинета
              try {
                await signOut();
              } catch (error) {
                console.error('Logout error:', error);
                Alert.alert('Ошибка', 'Не удалось выйти из системы');
              }
            }}
          >
            <Text style={styles.logoutText}>Выйти</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Статистика */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Всего</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#ff8800' }]}>{stats.open}</Text>
            <Text style={styles.statLabel}>Новых</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>В работе</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.textMuted }]}>{stats.closed}</Text>
            <Text style={styles.statLabel}>Закрыто</Text>
          </View>
        </View>

        {/* Список заявок */}
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>
            Тикеты поддержки
          </Text>

          {tickets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет тикетов</Text>
            </View>
          ) : (
            tickets.map((ticket) => (
              <TouchableOpacity
                key={ticket.id}
                style={styles.itemCard}
                onPress={() => navigation.navigate('TicketDetail', { ticketId: ticket.id })}
              >
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>#{ticket.id} {ticket.subject}</Text>
                  <View
                    style={[
                      styles.priorityBadge,
                      { backgroundColor: getPriorityColor(ticket.priority) + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.priorityText,
                        { color: getPriorityColor(ticket.priority) },
                      ]}
                    >
                      {ticket.priority === 'urgent' ? 'Срочно' :
                       ticket.priority === 'high' ? 'Высокий' :
                       ticket.priority === 'normal' ? 'Обычный' : 'Низкий'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.itemClient}>
                  Клиент: {ticket.client_name} ({ticket.client_email})
                </Text>
                <View style={styles.itemFooter}>
                  <Text style={styles.itemDate}>
                    {new Date(ticket.created_at).toLocaleDateString('ru-RU')}
                  </Text>
                  <View style={styles.itemFooterRight}>
                    {ticket.status === 'open' && !ticket.assigned_to && (
                      <TouchableOpacity
                        style={styles.assignButton}
                        onPress={() => handleAssign(ticket.id)}
                      >
                        <Text style={styles.assignButtonText}>Взять в работу</Text>
                      </TouchableOpacity>
                    )}
                    {ticket.status !== 'open' && (
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              ticket.status === 'in_progress' ? colors.primary + '20' :
                              ticket.status === 'resolved' ? '#4caf50' + '20' :
                              ticket.status === 'closed' ? colors.textMuted + '20' :
                              colors.primary + '20',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            {
                              color:
                                ticket.status === 'in_progress' ? colors.primary :
                                ticket.status === 'resolved' ? '#4caf50' :
                                ticket.status === 'closed' ? colors.textMuted :
                                colors.primary,
                            },
                          ]}
                        >
                          {ticket.status === 'in_progress' ? 'В работе' :
                           ticket.status === 'resolved' ? 'Решен' :
                           ticket.status === 'closed' ? 'Закрыт' :
                           ticket.status}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
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
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textLight,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: colors.textLight,
    fontSize: 10,
    fontWeight: 'bold',
  },
  analyticsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyticsButtonText: {
    fontSize: 20,
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundWhite,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  listContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 16,
  },
  itemCard: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    flex: 1,
  },
  itemAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemClient: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  itemService: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 8,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  assignButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  assignButtonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  assignedText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
  },
});
