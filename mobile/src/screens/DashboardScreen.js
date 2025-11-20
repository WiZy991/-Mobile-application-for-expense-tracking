import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { api } from '../services/api';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale/ru';

export default function DashboardScreen({ navigation }) {
  const [client, setClient] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientRes, transactionsRes, notificationsRes] = await Promise.all([
        api.get('/clients/me'),
        api.get('/payments/history?limit=5'),
        api.get('/notifications?is_read=false&limit=1'),
      ]);

      setClient(clientRes.data);
      setRecentTransactions(transactionsRes.data.transactions || []);
      setUnreadNotifications(notificationsRes.data.length || 0);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Добро пожаловать, {client?.name}!</Text>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Текущий баланс</Text>
          <Text style={styles.balanceAmount}>
            {client?.balance?.toFixed(2) || '0.00'} ₽
          </Text>
        </View>
      </View>

      {unreadNotifications > 0 && (
        <TouchableOpacity
          style={styles.notificationBanner}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Text style={styles.notificationText}>
            У вас {unreadNotifications} непрочитанных уведомлений
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Последние транзакции</Text>
          <TouchableOpacity onPress={() => navigation.navigate('History')}>
            <Text style={styles.seeAll}>Все</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length === 0 ? (
          <Text style={styles.emptyText}>Нет транзакций</Text>
        ) : (
          recentTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionItem}>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionService}>
                  {transaction.service_name || 'Услуга'}
                </Text>
                <Text style={styles.transactionDate}>
                  {format(new Date(transaction.created_at), 'dd MMM yyyy', {
                    locale: ru,
                  })}
                </Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  transaction.type === 'charge' && styles.chargeAmount,
                  transaction.type === 'payment' && styles.paymentAmount,
                ]}
              >
                {transaction.type === 'charge' ? '-' : '+'}
                {transaction.amount.toFixed(2)} ₽
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Analytics')}
        >
          <Text style={styles.actionButtonText}>Аналитика</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Services')}
        >
          <Text style={styles.actionButtonText}>Мои услуги</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  balanceCard: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 20,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  notificationBanner: {
    backgroundColor: '#FF9500',
    padding: 16,
    margin: 20,
    borderRadius: 8,
  },
  notificationText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 10,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  seeAll: {
    color: '#007AFF',
    fontSize: 14,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionService: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  chargeAmount: {
    color: '#FF3B30',
  },
  paymentAmount: {
    color: '#34C759',
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

