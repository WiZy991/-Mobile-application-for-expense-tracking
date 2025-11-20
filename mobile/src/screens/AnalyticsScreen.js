import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { api } from '../services/api';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [year]);

  const loadAnalytics = async () => {
    try {
      const response = await api.get(`/analytics/yearly/${year}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Нет данных за {year} год</Text>
      </View>
    );
  }

  const chartData = {
    labels: analytics.by_month.map((m) => {
      const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
      return monthNames[parseInt(m.month.split('-')[1]) - 1];
    }),
    datasets: [
      {
        data: analytics.by_month.map((m) => parseFloat(m.total_amount)),
        color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
        strokeWidth: 2,
      },
    ],
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.yearSelector}>
        <TouchableOpacity
          onPress={() => setYear(year - 1)}
          style={styles.yearButton}
        >
          <Text style={styles.yearButtonText}>{'< '}</Text>
        </TouchableOpacity>
        <Text style={styles.yearText}>{year}</Text>
        <TouchableOpacity
          onPress={() => setYear(year + 1)}
          style={styles.yearButton}
          disabled={year >= new Date().getFullYear()}
        >
          <Text
            style={[
              styles.yearButtonText,
              year >= new Date().getFullYear() && styles.yearButtonDisabled,
            ]}
          >
            {' >'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Всего потрачено за {year} год</Text>
        <Text style={styles.summaryAmount}>
          {analytics.total.toFixed(2)} ₽
        </Text>
        <Text style={styles.summaryCount}>
          {analytics.transaction_count} транзакций
        </Text>
      </View>

      {analytics.by_month.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Расходы по месяцам</Text>
          <LineChart
            data={chartData}
            width={screenWidth - 40}
            height={220}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              style: {
                borderRadius: 16,
              },
            }}
            bezier
            style={styles.chart}
          />
        </View>
      )}

      <View style={styles.servicesCard}>
        <Text style={styles.servicesTitle}>Расходы по услугам</Text>
        {analytics.by_service.map((service, index) => (
          <View key={index} style={styles.serviceItem}>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceName}>{service.service_name}</Text>
              <Text style={styles.serviceCount}>
                {service.transaction_count} транзакций
              </Text>
            </View>
            <Text style={styles.serviceAmount}>
              {service.total_amount.toFixed(2)} ₽
            </Text>
          </View>
        ))}
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
  yearSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  yearButton: {
    padding: 10,
  },
  yearButtonText: {
    fontSize: 20,
    color: '#007AFF',
  },
  yearButtonDisabled: {
    opacity: 0.3,
  },
  yearText: {
    fontSize: 20,
    fontWeight: '600',
    marginHorizontal: 20,
  },
  summaryCard: {
    backgroundColor: '#007AFF',
    margin: 20,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 8,
  },
  summaryAmount: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryCount: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
  },
  chartCard: {
    backgroundColor: '#fff',
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    padding: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  servicesCard: {
    backgroundColor: '#fff',
    margin: 20,
    marginTop: 0,
    borderRadius: 12,
    padding: 20,
  },
  servicesTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  serviceCount: {
    fontSize: 12,
    color: '#999',
  },
  serviceAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
});

