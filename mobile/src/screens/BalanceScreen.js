import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { api, createTopUpInvoice } from '../services/api';
import colors from '../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRESET_AMOUNTS = [1000, 3000, 5000, 10000, 25000, 50000];

export default function BalanceScreen({ navigation }) {
  const [balance, setBalance] = useState(15000);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [successAnimation] = useState(new Animated.Value(0));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Симуляция загрузки данных
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Моковые данные (будут заменены на реальные после интеграции)
      setBalance(15000);
      setTransactions([
        {
          id: 1,
          type: 'top_up',
          amount: 10000,
          date: new Date(Date.now() - 86400000).toISOString(),
          status: 'completed',
          description: 'Пополнение баланса',
        },
        {
          id: 2,
          type: 'service',
          amount: -5000,
          date: new Date(Date.now() - 172800000).toISOString(),
          status: 'completed',
          description: 'Оплата услуги: Техподдержка',
        },
        {
          id: 3,
          type: 'top_up',
          amount: 25000,
          date: new Date(Date.now() - 259200000).toISOString(),
          status: 'completed',
          description: 'Пополнение баланса',
        },
      ]);
    } catch (error) {
      console.error('Error loading balance:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handlePresetAmount = (amount) => {
    setTopUpAmount(amount.toString());
  };

  const formatAmount = (text) => {
    // Убираем все нецифровые символы
    const cleaned = text.replace(/\D/g, '');
    setTopUpAmount(cleaned);
  };

  const handleTopUp = async () => {
    const amount = parseInt(topUpAmount);
    
    if (!amount || amount < 100) {
      Alert.alert('Ошибка', 'Минимальная сумма пополнения - 100 ₽');
      return;
    }

    if (amount > 1000000) {
      Alert.alert('Ошибка', 'Максимальная сумма пополнения - 1 000 000 ₽');
      return;
    }

    setProcessing(true);

    try {
      // Получаем данные клиента из хранилища
      const clientDataStr = await AsyncStorage.getItem('clientData');
      const clientData = clientDataStr ? JSON.parse(clientDataStr) : null;
      
      let invoiceNumber = `WCB-${Date.now()}`;
      let sbisInvoiceCreated = false;

      // Пробуем создать счет в СБИС
      if (clientData?.inn) {
        try {
          const invoiceResult = await createTopUpInvoice({
            buyerINN: clientData.inn,
            buyerName: clientData.companyName || clientData.name,
            buyerKPP: clientData.kpp,
            sellerINN: 'YOUR_COMPANY_INN', // Замените на ваш ИНН
            amount: amount,
          });
          
          if (invoiceResult.success) {
            invoiceNumber = invoiceResult.data.number;
            sbisInvoiceCreated = true;
            console.log('Счет создан в СБИС:', invoiceNumber);
          }
        } catch (sbisError) {
          console.log('Не удалось создать счет в СБИС (демо-режим):', sbisError);
        }
      }

      // Обновляем баланс (в демо-режиме - мгновенно)
      setBalance(prev => prev + amount);
      
      // Сохраняем новый баланс
      await AsyncStorage.setItem('userBalance', String(balance + amount));
      
      // Добавляем транзакцию
      const newTransaction = {
        id: Date.now(),
        type: 'top_up',
        amount: amount,
        date: new Date().toISOString(),
        status: 'completed',
        description: 'Пополнение баланса',
        invoiceNumber: invoiceNumber,
        sbisSync: sbisInvoiceCreated,
      };
      setTransactions(prev => [newTransaction, ...prev]);

      // Сохраняем транзакции
      const updatedTransactions = [newTransaction, ...transactions];
      await AsyncStorage.setItem('transactions', JSON.stringify(updatedTransactions));

      // Анимация успеха
      Animated.sequence([
        Animated.timing(successAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(successAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setShowTopUpModal(false);
      setTopUpAmount('');

      Alert.alert(
        '🎉 Успешно!',
        `Баланс пополнен на ${amount.toLocaleString('ru-RU')} ₽\n\n` +
        (sbisInvoiceCreated 
          ? `В СБИС создан счет ${invoiceNumber}`
          : `Номер операции: ${invoiceNumber}\n\n⚠️ Демо-режим: для создания счетов в СБИС настройте интеграцию`),
        [{ text: 'Отлично!' }]
      );
    } catch (error) {
      console.error('Top up error:', error);
      Alert.alert('Ошибка', 'Не удалось пополнить баланс. Попробуйте позже.');
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
<<<<<<< HEAD
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Текущий баланс</Text>
        <Text style={styles.balanceAmount}>
          {typeof balance === 'number' 
            ? balance.toFixed(2) 
            : parseFloat(balance || 0).toFixed(2)} ₽
        </Text>
      </View>
=======
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Карточка баланса */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Текущий баланс</Text>
            <View style={styles.sbisSync}>
              <Text style={styles.sbisSyncText}>🔄 СБИС</Text>
            </View>
          </View>
          <Text style={[styles.balanceAmount, balance < 0 && styles.balanceNegative]}>
            {balance.toLocaleString('ru-RU')} ₽
          </Text>
          <TouchableOpacity
            style={styles.topUpMainButton}
            onPress={() => setShowTopUpModal(true)}
          >
            <Text style={styles.topUpMainButtonIcon}>💳</Text>
            <Text style={styles.topUpMainButtonText}>Пополнить баланс</Text>
          </TouchableOpacity>
        </View>
>>>>>>> 86fa44cdf55de05b6875cdfda4f46151993974b2

        {/* Информация */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Как это работает?</Text>
            <Text style={styles.infoText}>
              При пополнении баланса в СБИС автоматически формируется счет на вашу организацию. 
              После оплаты средства зачисляются на ваш баланс.
            </Text>
          </View>
        </View>

        {/* История операций */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>История операций</Text>
          
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>Нет операций</Text>
            </View>
          ) : (
            transactions.map(transaction => (
              <View key={transaction.id} style={styles.transactionItem}>
                <View style={styles.transactionLeft}>
                  <View
                    style={[
                      styles.transactionIcon,
                      transaction.amount > 0 
                        ? styles.transactionIconPositive 
                        : styles.transactionIconNegative,
                    ]}
                  >
                    <Text style={styles.transactionIconText}>
                      {transaction.amount > 0 ? '📥' : '📤'}
                    </Text>
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionDescription}>
                      {transaction.description}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(transaction.date)}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    transaction.amount > 0 
                      ? styles.amountPositive 
                      : styles.amountNegative,
                  ]}
                >
                  {transaction.amount > 0 ? '+' : ''}
                  {transaction.amount.toLocaleString('ru-RU')} ₽
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Модальное окно пополнения */}
      <Modal
        visible={showTopUpModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTopUpModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowTopUpModal(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Пополнение баланса</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowTopUpModal(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Выберите сумму или введите свою
            </Text>

            {/* Предустановленные суммы */}
            <View style={styles.presetGrid}>
              {PRESET_AMOUNTS.map(amount => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.presetButton,
                    topUpAmount === amount.toString() && styles.presetButtonActive,
                  ]}
                  onPress={() => handlePresetAmount(amount)}
                >
                  <Text
                    style={[
                      styles.presetButtonText,
                      topUpAmount === amount.toString() && styles.presetButtonTextActive,
                    ]}
                  >
                    {amount.toLocaleString('ru-RU')} ₽
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Ввод своей суммы */}
            <View style={styles.customAmountContainer}>
              <Text style={styles.customAmountLabel}>Своя сумма</Text>
              <View style={styles.customAmountInput}>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  value={topUpAmount}
                  onChangeText={formatAmount}
                  keyboardType="numeric"
                  maxLength={7}
                />
                <Text style={styles.currencySymbol}>₽</Text>
              </View>
            </View>

            {/* Информация о счете */}
            <View style={styles.invoiceInfo}>
              <Text style={styles.invoiceIcon}>📄</Text>
              <Text style={styles.invoiceText}>
                В СБИС будет сформирован счет на сумму{' '}
                <Text style={styles.invoiceAmount}>
                  {topUpAmount ? parseInt(topUpAmount).toLocaleString('ru-RU') : 0} ₽
                </Text>
              </Text>
            </View>

            {/* Кнопка пополнения */}
            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!topUpAmount || processing) && styles.confirmButtonDisabled,
              ]}
              onPress={handleTopUp}
              disabled={!topUpAmount || processing}
            >
              {processing ? (
                <View style={styles.processingContainer}>
                  <ActivityIndicator color={colors.textLight} size="small" />
                  <Text style={styles.processingText}>Обработка...</Text>
                </View>
              ) : (
                <Text style={styles.confirmButtonText}>
                  Пополнить на {topUpAmount ? parseInt(topUpAmount).toLocaleString('ru-RU') : 0} ₽
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              ⚡ Демо-режим: деньги зачисляются мгновенно
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    margin: 16,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginRight: 10,
  },
  sbisSync: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sbisSyncText: {
    color: colors.textLight,
    fontSize: 11,
    fontWeight: '500',
  },
  balanceAmount: {
    color: colors.textLight,
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  balanceNegative: {
    color: '#FFD93D',
  },
  topUpMainButton: {
    flexDirection: 'row',
    backgroundColor: colors.textLight,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  topUpMainButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  topUpMainButtonText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundLight,
    margin: 16,
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  historySection: {
    backgroundColor: colors.backgroundWhite,
    margin: 16,
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 30,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionIconPositive: {
    backgroundColor: colors.success + '20',
  },
  transactionIconNegative: {
    backgroundColor: colors.error + '20',
  },
  transactionIconText: {
    fontSize: 20,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textDark,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountPositive: {
    color: colors.success,
  },
  amountNegative: {
    color: colors.error,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.backgroundWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textDark,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: colors.textMuted,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  presetButton: {
    width: '31%',
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  presetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
  },
  presetButtonTextActive: {
    color: colors.primary,
  },
  customAmountContainer: {
    marginBottom: 20,
  },
  customAmountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  customAmountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.border,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textDark,
    paddingVertical: 16,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textMuted,
  },
  invoiceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  invoiceIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  invoiceText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  invoiceAmount: {
    fontWeight: '600',
    color: colors.primary,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: colors.textLight,
    fontSize: 17,
    fontWeight: '600',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  processingText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 10,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
});
