import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';

export default function SubscriptionsScreen({ navigation }) {
  const [plans, setPlans] = useState([]);
  const [mySubscriptions, setMySubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Загружаем тарифы
      const plansResponse = await api.get('/subscriptions/plans');
      setPlans(plansResponse.data?.plans || []);
      
      // Загружаем активные подписки
      const subscriptionsResponse = await api.get('/subscriptions/my');
      setMySubscriptions(subscriptionsResponse.data?.subscriptions || []);
      
      // Загружаем баланс
      const profileResponse = await api.get('/clients/me');
      setBalance(parseFloat(profileResponse.data?.balance) || 0);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSubscribe = async (plan) => {
    if (balance < plan.price) {
      Alert.alert(
        'Недостаточно средств',
        `Для подписки на тариф "${plan.name}" необходимо ${plan.price.toLocaleString('ru-RU')} ₽\n\nВаш баланс: ${balance.toLocaleString('ru-RU')} ₽`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Пополнить',
            onPress: () => navigation.navigate('Balance'),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Подтверждение',
      `Вы хотите подписаться на тариф "${plan.name}" за ${plan.price.toLocaleString('ru-RU')} ₽?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Подписаться',
          onPress: async () => {
            try {
              setSubscribing(true);
              const response = await api.post('/subscriptions/subscribe', {
                plan_id: plan.id,
              });

              Alert.alert(
                'Успешно',
                `Вы успешно подписались на тариф "${plan.name}"!`,
                [{ text: 'OK', onPress: () => loadData() }]
              );
            } catch (error) {
              console.error('Subscribe error:', error);
              Alert.alert(
                'Ошибка',
                error.response?.data?.error || 'Не удалось оформить подписку'
              );
            } finally {
              setSubscribing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelSubscription = async (subscription) => {
    Alert.alert(
      'Отмена подписки',
      `Вы уверены, что хотите отменить подписку "${subscription.plan_name}"?`,
      [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Да, отменить',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.put(`/subscriptions/${subscription.id}/cancel`);
              Alert.alert('Успешно', 'Подписка отменена');
              await loadData();
            } catch (error) {
              console.error('Cancel subscription error:', error);
              Alert.alert('Ошибка', 'Не удалось отменить подписку');
            }
          },
        },
      ]
    );
  };

  const handleToggleAutoRenewal = async (subscription) => {
    try {
      await api.put(`/subscriptions/${subscription.id}/auto-renewal`, {
        auto_renewal: !subscription.auto_renewal,
      });
      await loadData();
    } catch (error) {
      console.error('Toggle auto-renewal error:', error);
      Alert.alert('Ошибка', 'Не удалось изменить настройки');
    }
  };

  const getBillingPeriodText = (period) => {
    switch (period) {
      case 'yearly':
        return '/год';
      case 'half_yearly':
        return '/полгода';
      case 'quarterly':
        return '/квартал';
      case 'monthly':
      default:
        return '/мес';
    }
  };

  const getPeriodDescription = (period) => {
    switch (period) {
      case 'yearly':
        return '12 месяцев';
      case 'half_yearly':
        return '6 месяцев';
      case 'quarterly':
        return '3 месяца';
      case 'monthly':
      default:
        return '1 месяц';
    }
  };

  const getPricePerMonth = (plan) => {
    switch (plan.billing_period) {
      case 'yearly':
        return Math.round(plan.price / 12);
      case 'half_yearly':
        return Math.round(plan.price / 6);
      case 'quarterly':
        return Math.round(plan.price / 3);
      case 'monthly':
      default:
        return plan.price;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Не указано';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Загрузка подписок...</Text>
      </View>
    );
  }

  const activeSubscription = mySubscriptions.find((s) => s.status === 'active');

  return (
    <View style={styles.container}>
      {/* Заголовок */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Тарифы и подписки</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadData} />
        }
      >
        {/* Активная подписка */}
        {activeSubscription && (
          <View style={styles.activeSubscriptionCard}>
            <View style={styles.activeSubscriptionHeader}>
              <MaterialIcons name="check-circle" size={24} color={colors.success} />
              <Text style={styles.activeSubscriptionTitle}>
                Активная подписка
              </Text>
            </View>
            <Text style={styles.activeSubscriptionName}>
              {activeSubscription.plan_name}
            </Text>
            <Text style={styles.activeSubscriptionDescription}>
              {activeSubscription.plan_description}
            </Text>
            <View style={styles.activeSubscriptionDates}>
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Действует до:</Text>
                <Text style={styles.dateValue}>
                  {formatDate(activeSubscription.end_date)}
                </Text>
              </View>
              {activeSubscription.days_until_renewal > 0 && (
                <View style={styles.dateRow}>
                  <Text style={styles.dateLabel}>До продления:</Text>
                  <Text style={styles.dateValue}>
                    {activeSubscription.days_until_renewal}{' '}
                    {activeSubscription.days_until_renewal === 1
                      ? 'день'
                      : activeSubscription.days_until_renewal < 5
                      ? 'дня'
                      : 'дней'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.autoRenewalContainer}>
              <Text style={styles.autoRenewalLabel}>Автоматическое продление</Text>
              <Switch
                value={activeSubscription.auto_renewal || false}
                onValueChange={() => handleToggleAutoRenewal(activeSubscription)}
                trackColor={{
                  false: colors.border,
                  true: colors.primary + '80',
                }}
                thumbColor={
                  activeSubscription.auto_renewal ? colors.primary : colors.textMuted
                }
              />
            </View>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => handleCancelSubscription(activeSubscription)}
            >
              <Text style={styles.cancelButtonText}>Отменить подписку</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Доступные тарифы */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeSubscription ? 'Другие тарифы' : 'Выберите тариф'}
          </Text>

          {plans.map((plan) => {
            const isActive = activeSubscription?.plan_id === plan.id;
            const features =
              typeof plan.features === 'string'
                ? JSON.parse(plan.features)
                : plan.features || [];

            return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  plan.is_popular && styles.planCardPopular,
                  isActive && styles.planCardActive,
                ]}
                onPress={() => {
                  setSelectedPlan(plan);
                  setShowPlanModal(true);
                }}
                disabled={isActive || subscribing}
              >
                {plan.is_popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Популярный</Text>
                  </View>
                )}
                {isActive && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Активна</Text>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <View style={styles.planNameContainer}>
                    <Text style={styles.planName}>{plan.name}</Text>
                  </View>
                  <View style={styles.planPriceContainer}>
                    <Text style={styles.planPrice}>
                      {plan.price.toLocaleString('ru-RU')} ₽
                    </Text>
                    {plan.billing_period !== 'monthly' && (
                      <Text style={styles.planPricePerMonth}>
                        ({getPricePerMonth(plan).toLocaleString('ru-RU')}/мес.)
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={styles.planDescription}>{plan.description}</Text>
                <View style={styles.planFeatures}>
                  {features.map((feature, index) => {
                    const [title, description] = feature.split(': ');
                    return (
                      <View key={index} style={styles.featureItem}>
                        <MaterialIcons
                          name="check"
                          size={16}
                          color={colors.success}
                        />
                        <View style={styles.featureTextContainer}>
                          <Text style={styles.featureTitle}>{title}:</Text>
                          {description && (
                            <Text style={styles.featureDescription}>{description}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
                {!isActive && (
                  <TouchableOpacity
                    style={[
                      styles.subscribeButton,
                      balance < plan.price && styles.subscribeButtonDisabled,
                    ]}
                    onPress={() => handleSubscribe(plan)}
                    disabled={subscribing || balance < plan.price}
                  >
                    {subscribing ? (
                      <ActivityIndicator size="small" color={colors.textLight} />
                    ) : (
                      <Text style={styles.subscribeButtonText}>
                        {balance < plan.price ? 'Недостаточно средств' : 'Подписаться'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Модальное окно с деталями тарифа */}
      <Modal
        visible={showPlanModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPlanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedPlan && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedPlan.name}</Text>
                  <TouchableOpacity
                    style={styles.modalClose}
                    onPress={() => setShowPlanModal(false)}
                  >
                    <MaterialIcons name="close" size={24} color={colors.textDark} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.modalPriceContainer}>
                    <Text style={styles.modalPrice}>
                      {selectedPlan.price.toLocaleString('ru-RU')} ₽
                    </Text>
                    <Text style={styles.modalPeriod}>
                      {getBillingPeriodText(selectedPlan.billing_period)}
                    </Text>
                  </View>

                  <Text style={styles.modalDescription}>
                    {selectedPlan.description}
                  </Text>

                  <Text style={styles.modalSectionTitle}>Что входит в подписку:</Text>
                  {(
                    typeof selectedPlan.features === 'string'
                      ? JSON.parse(selectedPlan.features)
                      : selectedPlan.features || []
                  ).map((feature, index) => {
                    const [title, description] = feature.split(': ');
                    return (
                      <View key={index} style={styles.modalFeatureItem}>
                        <MaterialIcons
                          name="check-circle"
                          size={20}
                          color={colors.success}
                        />
                        <View style={styles.modalFeatureTextContainer}>
                          <Text style={styles.modalFeatureTitle}>{title}:</Text>
                          {description && (
                            <Text style={styles.modalFeatureDescription}>{description}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={[
                      styles.modalSubscribeButton,
                      balance < selectedPlan.price && styles.modalSubscribeButtonDisabled,
                    ]}
                    onPress={() => {
                      setShowPlanModal(false);
                      handleSubscribe(selectedPlan);
                    }}
                    disabled={subscribing || balance < selectedPlan.price}
                  >
                    {subscribing ? (
                      <ActivityIndicator size="small" color={colors.textLight} />
                    ) : (
                      <Text style={styles.modalSubscribeButtonText}>
                        {balance < selectedPlan.price
                          ? 'Недостаточно средств'
                          : 'Подписаться'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
  header: {
    padding: 16,
    backgroundColor: colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textDark,
  },
  content: {
    flex: 1,
  },
  activeSubscriptionCard: {
    backgroundColor: colors.backgroundWhite,
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.success,
  },
  activeSubscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeSubscriptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.success,
    marginLeft: 8,
  },
  activeSubscriptionName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 8,
  },
  activeSubscriptionDescription: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
  },
  activeSubscriptionDates: {
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  autoRenewalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginBottom: 16,
  },
  autoRenewalLabel: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
  cancelButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.error + '20',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardPopular: {
    borderColor: colors.primary,
  },
  planCardActive: {
    borderColor: colors.success,
    opacity: 0.7,
  },
  popularBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: colors.textLight,
    fontSize: 11,
    fontWeight: '600',
  },
  activeBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    color: colors.textLight,
    fontSize: 11,
    fontWeight: '600',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planNameContainer: {
    flex: 1,
    marginRight: 12,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
  },
  planPeriodDesc: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  planPricePerMonth: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  planDescription: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
  },
  planFeatures: {
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureTextContainer: {
    flex: 1,
    marginLeft: 8,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  featureDescription: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  moreFeatures: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  subscribeButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  subscribeButtonDisabled: {
    backgroundColor: colors.border,
  },
  subscribeButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    flex: 1,
  },
  modalClose: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  modalPriceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  modalPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
  },
  modalPeriod: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 8,
  },
  modalDescription: {
    fontSize: 16,
    color: colors.textDark,
    marginBottom: 24,
    lineHeight: 24,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 16,
  },
  modalFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalFeatureTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  modalFeatureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
  },
  modalFeatureDescription: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  modalSubscribeButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSubscribeButtonDisabled: {
    backgroundColor: colors.border,
  },
  modalSubscribeButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '600',
  },
});
