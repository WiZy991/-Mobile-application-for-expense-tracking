import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { api } from '../services/api';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale/ru';

export default function HistoryScreen() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async (pageNum = 1) => {
    try {
      const response = await api.get(`/payments/history?page=${pageNum}&limit=20`);
      const newTransactions = response.data.transactions || [];
      
      if (pageNum === 1) {
        setTransactions(newTransactions);
      } else {
        setTransactions((prev) => [...prev, ...newTransactions]);
      }

      setHasMore(newTransactions.length === 20);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadTransactions(1);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadTransactions(nextPage);
    }
  };

  const renderTransaction = ({ item }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionHeader}>
        <Text style={styles.transactionService}>
          {item.service_name || 'Услуга'}
        </Text>
        <Text
          style={[
            styles.transactionAmount,
            item.type === 'charge' && styles.chargeAmount,
            item.type === 'payment' && styles.paymentAmount,
          ]}
        >
          {item.type === 'charge' ? '-' : '+'}
          {item.amount.toFixed(2)} ₽
        </Text>
      </View>
      <Text style={styles.transactionDescription}>{item.description}</Text>
      {item.period_start && item.period_end && (
        <Text style={styles.transactionPeriod}>
          Период: {format(new Date(item.period_start), 'dd.MM.yyyy', { locale: ru })} -{' '}
          {format(new Date(item.period_end), 'dd.MM.yyyy', { locale: ru })}
        </Text>
      )}
      <View style={styles.transactionFooter}>
        <Text style={styles.transactionDate}>
          {format(new Date(item.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
        </Text>
        <View
          style={[
            styles.statusBadge,
            item.status === 'completed' && styles.statusCompleted,
            item.status === 'pending' && styles.statusPending,
          ]}
        >
          <Text style={styles.statusText}>
            {item.status === 'completed' ? 'Оплачено' : 'Ожидает'}
          </Text>
        </View>
      </View>
    </View>
  );

  if (loading && transactions.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={transactions}
      renderItem={renderTransaction}
      keyExtractor={(item) => item.id.toString()}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Нет транзакций</Text>
        </View>
      }
    />
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
  transactionItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  transactionService: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  chargeAmount: {
    color: '#FF3B30',
  },
  paymentAmount: {
    color: '#34C759',
  },
  transactionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  transactionPeriod: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  transactionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusCompleted: {
    backgroundColor: '#34C759',
  },
  statusPending: {
    backgroundColor: '#FF9500',
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
});

