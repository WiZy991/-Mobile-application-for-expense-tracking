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
  Modal,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';

const RESOURCE_TYPES = {
  fn: { name: 'Фискальный накопитель', icon: 'memory', color: '#4CAF50' },
  evotor: { name: 'Лицензия Эвотор', icon: 'devices', color: '#2196F3' },
  atol: { name: 'Лицензия Атол', icon: 'devices', color: '#FF9800' },
  ofd: { name: 'ОФД', icon: 'cloud', color: '#9C27B0' },
  license: { name: 'Лицензия', icon: 'verified', color: '#00BCD4' },
  subscription: { name: 'Подписка', icon: 'subscriptions', color: '#E91E63' },
  other: { name: 'Ресурс', icon: 'category', color: colors.textMuted },
};

export default function ResourcesScreen({ navigation }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all'); // all, active, expiring_soon, expired

  useEffect(() => {
    loadResources();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadResources();
    });
    return unsubscribe;
  }, [navigation]);

  const loadResources = async () => {
    try {
      setLoading(true);
      const response = await api.get('/resources');
      setResources(response.data?.resources || []);
    } catch (error) {
      console.error('Error loading resources:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить ресурсы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await api.post('/resources/sync');
      Alert.alert(
        'Синхронизация',
        `Синхронизировано ресурсов: ${response.data?.synced || 0}`
      );
      await loadResources();
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Ошибка', 'Не удалось синхронизировать ресурсы');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAutoRenewal = async (resourceId, currentValue) => {
    try {
      await api.put(`/resources/${resourceId}`, {
        auto_renewal: !currentValue,
      });
      await loadResources();
      Alert.alert('Успешно', `Автопродление ${!currentValue ? 'включено' : 'выключено'}`);
    } catch (error) {
      console.error('Toggle auto-renewal error:', error);
      Alert.alert('Ошибка', 'Не удалось изменить настройки');
    }
  };

  const getStatusColor = (resource) => {
    if (resource.status === 'expired') return colors.error;
    if (resource.status === 'expiring_soon') return colors.warning;
    if (resource.status === 'renewed') return colors.success;
    return colors.primary;
  };

  const getStatusText = (resource) => {
    if (resource.status === 'expired') return 'Истек';
    if (resource.status === 'expiring_soon') return 'Скоро истекает';
    if (resource.status === 'renewed') return 'Продлен';
    return 'Активен';
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

  const filteredResources = resources.filter((resource) => {
    if (filter === 'all') return true;
    if (filter === 'active') return resource.status === 'active';
    if (filter === 'expiring_soon') return resource.status === 'expiring_soon';
    if (filter === 'expired') return resource.status === 'expired';
    return true;
  });

  const expiringSoonCount = resources.filter((r) => r.status === 'expiring_soon').length;
  const expiredCount = resources.filter((r) => r.status === 'expired').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Загрузка ресурсов...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Заголовок с кнопками */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Мои ресурсы</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
            onPress={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="sync" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Статистика */}
      {(expiringSoonCount > 0 || expiredCount > 0) && (
        <View style={styles.statsContainer}>
          {expiringSoonCount > 0 && (
            <View style={[styles.statCard, { backgroundColor: colors.warning + '20' }]}>
              <Text style={[styles.statValue, { color: colors.warning }]}>
                {expiringSoonCount}
              </Text>
              <Text style={styles.statLabel}>Скоро истекают</Text>
            </View>
          )}
          {expiredCount > 0 && (
            <View style={[styles.statCard, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.statValue, { color: colors.error }]}>
                {expiredCount}
              </Text>
              <Text style={styles.statLabel}>Истекли</Text>
            </View>
          )}
        </View>
      )}

      {/* Фильтры */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {[
          { id: 'all', label: 'Все' },
          { id: 'active', label: 'Активные' },
          { id: 'expiring_soon', label: 'Скоро истекают' },
          { id: 'expired', label: 'Истекшие' },
        ].map((filterOption) => (
          <TouchableOpacity
            key={filterOption.id}
            style={[
              styles.filterButton,
              filter === filterOption.id && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(filterOption.id)}
          >
            <Text
              style={[
                styles.filterText,
                filter === filterOption.id && styles.filterTextActive,
              ]}
            >
              {filterOption.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Список ресурсов */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadResources} />
        }
      >
        {filteredResources.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="inventory" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Нет ресурсов</Text>
            <Text style={styles.emptySubtext}>
              Нажмите кнопку синхронизации для загрузки ресурсов из СБИС
            </Text>
            <TouchableOpacity style={styles.syncButtonLarge} onPress={handleSync}>
              <MaterialIcons name="sync" size={24} color={colors.textLight} />
              <Text style={styles.syncButtonText}>Синхронизировать</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredResources.map((resource) => {
            const resourceType = RESOURCE_TYPES[resource.resource_type] || RESOURCE_TYPES.other;
            const daysUntilExpiry = resource.days_until_expiry || 0;
            const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry > 0;

            return (
              <TouchableOpacity
                key={resource.id}
                style={[
                  styles.resourceCard,
                  isExpiringSoon && styles.resourceCardWarning,
                  resource.status === 'expired' && styles.resourceCardExpired,
                ]}
                onPress={() => {
                  setSelectedResource(resource);
                  setShowModal(true);
                }}
              >
                <View style={styles.resourceHeader}>
                  <View style={[styles.resourceIcon, { backgroundColor: resourceType.color + '20' }]}>
                    <MaterialIcons
                      name={resourceType.icon}
                      size={24}
                      color={resourceType.color}
                    />
                  </View>
                  <View style={styles.resourceInfo}>
                    <Text style={styles.resourceName}>{resource.resource_name}</Text>
                    <Text style={styles.resourceType}>{resourceType.name}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(resource) + '20' },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: getStatusColor(resource) }]}>
                      {getStatusText(resource)}
                    </Text>
                  </View>
                </View>

                <View style={styles.resourceDetails}>
                  {resource.serial_number && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Серийный номер:</Text>
                      <Text style={styles.detailValue}>{resource.serial_number}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Срок действия:</Text>
                    <Text
                      style={[
                        styles.detailValue,
                        isExpiringSoon && { color: colors.warning },
                        resource.status === 'expired' && { color: colors.error },
                      ]}
                    >
                      {formatDate(resource.expiry_date)}
                    </Text>
                  </View>
                  {daysUntilExpiry > 0 && daysUntilExpiry <= 60 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Осталось дней:</Text>
                      <Text
                        style={[
                          styles.detailValue,
                          daysUntilExpiry <= 7 && { color: colors.error, fontWeight: 'bold' },
                          daysUntilExpiry > 7 && daysUntilExpiry <= 30 && { color: colors.warning },
                        ]}
                      >
                        {daysUntilExpiry} {daysUntilExpiry === 1 ? 'день' : daysUntilExpiry < 5 ? 'дня' : 'дней'}
                      </Text>
                    </View>
                  )}
                  {resource.renewal_price > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Стоимость продления:</Text>
                      <Text style={[styles.detailValue, styles.priceValue]}>
                        {resource.renewal_price.toLocaleString('ru-RU')} ₽
                      </Text>
                    </View>
                  )}
                </View>

                {resource.renewal_price > 0 && (
                  <View style={styles.autoRenewalContainer}>
                    <Text style={styles.autoRenewalLabel}>Автоматическое продление</Text>
                    <Switch
                      value={resource.auto_renewal || false}
                      onValueChange={() =>
                        handleToggleAutoRenewal(resource.id, resource.auto_renewal)
                      }
                      trackColor={{
                        false: colors.border,
                        true: resourceType.color + '80',
                      }}
                      thumbColor={resource.auto_renewal ? resourceType.color : colors.textMuted}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Модальное окно с деталями ресурса */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedResource && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedResource.resource_name}</Text>
                  <TouchableOpacity
                    style={styles.modalClose}
                    onPress={() => setShowModal(false)}
                  >
                    <MaterialIcons name="close" size={24} color={colors.textDark} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Информация</Text>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Тип:</Text>
                      <Text style={styles.modalDetailValue}>
                        {RESOURCE_TYPES[selectedResource.resource_type]?.name || 'Ресурс'}
                      </Text>
                    </View>
                    {selectedResource.serial_number && (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Серийный номер:</Text>
                        <Text style={styles.modalDetailValue}>
                          {selectedResource.serial_number}
                        </Text>
                      </View>
                    )}
                    {selectedResource.model && (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Модель:</Text>
                        <Text style={styles.modalDetailValue}>{selectedResource.model}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Сроки действия</Text>
                    {selectedResource.start_date && (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Дата начала:</Text>
                        <Text style={styles.modalDetailValue}>
                          {formatDate(selectedResource.start_date)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Дата окончания:</Text>
                      <Text
                        style={[
                          styles.modalDetailValue,
                          selectedResource.status === 'expired' && { color: colors.error },
                          selectedResource.status === 'expiring_soon' && { color: colors.warning },
                        ]}
                      >
                        {formatDate(selectedResource.expiry_date)}
                      </Text>
                    </View>
                    {selectedResource.days_until_expiry !== undefined && (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Осталось дней:</Text>
                        <Text
                          style={[
                            styles.modalDetailValue,
                            selectedResource.days_until_expiry <= 7 && {
                              color: colors.error,
                              fontWeight: 'bold',
                            },
                          ]}
                        >
                          {selectedResource.days_until_expiry}
                        </Text>
                      </View>
                    )}
                  </View>

                  {selectedResource.renewal_price > 0 && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Продление</Text>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Стоимость:</Text>
                        <Text style={[styles.modalDetailValue, styles.priceValue]}>
                          {selectedResource.renewal_price.toLocaleString('ru-RU')} ₽
                        </Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Автопродление:</Text>
                        <Switch
                          value={selectedResource.auto_renewal || false}
                          onValueChange={() => {
                            handleToggleAutoRenewal(
                              selectedResource.id,
                              selectedResource.auto_renewal
                            );
                            setShowModal(false);
                          }}
                          trackColor={{
                            false: colors.border,
                            true: colors.primary + '80',
                          }}
                          thumbColor={
                            selectedResource.auto_renewal ? colors.primary : colors.textMuted
                          }
                        />
                      </View>
                    </View>
                  )}
                </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  syncButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  filtersContainer: {
    backgroundColor: colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.backgroundLight,
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
  filterTextActive: {
    color: colors.textLight,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  syncButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  syncButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '600',
  },
  resourceCard: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 16,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    marginTop: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  resourceCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  resourceCardExpired: {
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    opacity: 0.8,
  },
  resourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resourceInfo: {
    flex: 1,
  },
  resourceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 4,
  },
  resourceType: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  resourceDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
  priceValue: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  autoRenewalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  autoRenewalLabel: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
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
  modalSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 12,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalDetailLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  modalDetailValue: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
});
