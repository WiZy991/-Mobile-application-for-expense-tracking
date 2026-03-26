import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';

export default function TicketDetailScreen({ route, navigation }) {
  const { ticketId } = route.params;
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadTicketDetails();
    
    // Автообновление каждые 5 секунд для синхронизации сообщений (без показа загрузки)
    const interval = setInterval(() => {
      loadTicketDetails(false);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [ticketId]);

  const loadTicketDetails = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await api.get(`/staff/support/tickets/${ticketId}`);
      console.log(`[Staff TicketDetail] Loaded ticket ${ticketId}:`, {
        ticketFiles: response.data.ticket?.files?.length || 0,
        messagesCount: response.data.messages?.length || 0,
        firstMessageFiles: response.data.messages?.[0]?.files?.length || 0,
        ticketFilesDetails: response.data.ticket?.files?.map(f => ({ id: f.id, name: f.file_name, message_id: f.message_id })) || [],
        firstMessageFilesDetails: response.data.messages?.[0]?.files?.map(f => ({ id: f.id, name: f.file_name, message_id: f.message_id })) || [],
        fullResponse: JSON.stringify(response.data, null, 2).substring(0, 500)
      });
      setTicket(response.data.ticket);
      setMessages(response.data.messages || []);
      setClient(response.data.client);
      setStatus(response.data.ticket.status);
    } catch (error) {
      console.error('Error loading ticket details:', error);
      if (showLoading) {
        Alert.alert('Ошибка', 'Не удалось загрузить детали тикета');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTicketDetails();
  };


  const handleStatusChange = async (newStatus) => {
    try {
      const response = await api.put(`/staff/support/tickets/${ticketId}/status`, {
        status: newStatus,
      });
      setStatus(newStatus);
      setTicket(prev => prev ? { ...prev, status: newStatus } : null);
      await loadTicketDetails(false);
      
      console.log('[TicketDetail] Status changed to', newStatus, 'Response:', response.data);
      
      // Передаем параметр для обновления списка при возврате
      navigation.setParams({ statusUpdated: true });
      
      Alert.alert('Успешно', 'Статус тикета обновлен');
      
      // Если статус изменился на resolved или closed, отправляем событие для обновления аналитики
      if (newStatus === 'resolved' || newStatus === 'closed') {
        // Можно добавить навигацию к аналитике или просто обновить данные при следующем открытии
        console.log('[TicketDetail] Task completed, analytics should update on next view');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Ошибка', 'Не удалось обновить статус');
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      open: 'Открыт',
      in_progress: 'В работе',
      resolved: 'Решен',
      closed: 'Закрыт',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const statusColors = {
      open: '#ff8800',
      in_progress: colors.primary,
      resolved: '#4caf50',
      closed: colors.textMuted,
    };
    return statusColors[status] || colors.textMuted;
  };

  const getPriorityLabel = (priority) => {
    const labels = {
      urgent: 'Срочно',
      high: 'Высокий',
      normal: 'Обычный',
      low: 'Низкий',
    };
    return labels[priority] || priority;
  };

  const getPriorityColor = (priority) => {
    const priorityColors = {
      urgent: '#ff4444',
      high: '#ff8800',
      normal: colors.primary,
      low: colors.textMuted,
    };
    return priorityColors[priority] || colors.primary;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openFile = (file) => {
    // Формируем правильный URL для файла
    // baseURL содержит /api, поэтому нужно убрать его для статических файлов
    const apiBaseUrl = api.defaults.baseURL || 'http://localhost:3000/api';
    const baseUrl = apiBaseUrl.replace('/api', '');
    // Убираем лишние слеши и формируем путь
    const filePath = file.file_path.startsWith('/') ? file.file_path : `/${file.file_path}`;
    const fileUrl = `${baseUrl}${filePath}`;
    
    console.log('[TicketDetail] Opening file:', {
      file_path: file.file_path,
      fileUrl,
      baseUrl,
      apiBaseUrl,
      fileName: file.file_name
    });
    
    Linking.openURL(fileUrl).catch(err => {
      console.error('Error opening file:', err);
      Alert.alert('Ошибка', `Не удалось открыть файл: ${file.file_name}`);
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Тикет не найден</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Заголовок */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Тикет #{ticket.id}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Карточка тикета */}
        <View style={styles.ticketCard}>
          <View style={styles.ticketCardHeader}>
            <Text style={styles.ticketSubject}>{ticket.subject}</Text>
            <View style={styles.badges}>
              <View
                style={[
                  styles.badge,
                  styles.priorityBadge,
                  { backgroundColor: getPriorityColor(ticket.priority) + '30' },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: colors.textLight },
                  ]}
                >
                  {getPriorityLabel(ticket.priority)}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  styles.statusBadge,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    styles.statusBadgeText,
                    { color: colors.textLight },
                  ]}
                >
                  {getStatusLabel(status)}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.ticketCardMeta}>
            <Text style={styles.ticketMetaText}>
              Создан: {formatDate(ticket.created_at)}
            </Text>
            {ticket.updated_at && (
              <Text style={styles.ticketMetaText}>
                Обновлен: {formatDate(ticket.updated_at)}
              </Text>
            )}
          </View>
        </View>

        {/* Описание запроса */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Описание запроса</Text>
          <View style={styles.requestDescription}>
            <Text style={styles.requestDescriptionText}>{ticket.subject}</Text>
            {ticket.message && (
              <Text style={styles.requestDescriptionDetails}>{ticket.message}</Text>
            )}
          </View>
        </View>

        {/* Информация о клиенте */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Информация о клиенте</Text>
          <View style={styles.clientInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Организация:</Text>
              <Text style={styles.infoValue}>{client?.name || 'Не указано'}</Text>
            </View>
            {client?.inn && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>ИНН:</Text>
                <Text style={styles.infoValue}>{client.inn}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email:</Text>
              <Text style={styles.infoValue}>{client?.email || 'Не указано'}</Text>
            </View>
            {client?.phone && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Телефон:</Text>
                <Text style={styles.infoValue}>{client.phone}</Text>
              </View>
            )}
            {client?.kpp && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>КПП:</Text>
                <Text style={styles.infoValue}>{client.kpp}</Text>
              </View>
            )}
            {client?.ogrn && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>ОГРН:</Text>
                <Text style={styles.infoValue}>{client.ogrn}</Text>
              </View>
            )}
            {client?.company_address && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Адрес:</Text>
                <Text style={styles.infoValue}>{client.company_address}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Файлы тикета - показываем файлы из тикета и из первого сообщения */}
        {(() => {
          // Собираем все файлы: из тикета и из первого сообщения (если есть)
          const ticketFiles = Array.isArray(ticket?.files) ? ticket.files : [];
          const firstMessageFiles = messages.length > 0 && Array.isArray(messages[0]?.files) ? messages[0].files : [];
          
          console.log(`[Staff TicketDetail] Files check:`, {
            ticketFilesCount: ticketFiles.length,
            firstMessageFilesCount: firstMessageFiles.length,
            ticketFiles: ticketFiles.map(f => ({ id: f.id, name: f.file_name, message_id: f.message_id })),
            firstMessageFiles: firstMessageFiles.map(f => ({ id: f.id, name: f.file_name, message_id: f.message_id })),
            ticketObject: ticket ? { hasFiles: !!ticket.files, filesType: typeof ticket.files, filesIsArray: Array.isArray(ticket.files) } : null
          });
          
          // Объединяем файлы, убирая дубликаты по id
          const allFiles = [...ticketFiles];
          firstMessageFiles.forEach(file => {
            if (file && file.id && !allFiles.find(f => f && f.id === file.id)) {
              allFiles.push(file);
            }
          });
          
          console.log(`[Staff TicketDetail] Total files to display: ${allFiles.length}`, {
            allFiles: allFiles.map(f => ({ id: f?.id, name: f?.file_name, message_id: f?.message_id }))
          });
          
          // ВАЖНО: Показываем секцию файлов только если есть хотя бы один файл
          return allFiles.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Прикрепленные файлы ({allFiles.length})</Text>
              {allFiles.map((file) => {
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.file_type?.toLowerCase());
                const fileUrl = (() => {
                  const apiBaseUrl = api.defaults.baseURL || 'http://localhost:3000/api';
                  const baseUrl = apiBaseUrl.replace('/api', '');
                  const filePath = file.file_path.startsWith('/') ? file.file_path : `/${file.file_path}`;
                  return `${baseUrl}${filePath}`;
                })();
                
                return (
                  <TouchableOpacity
                    key={file.id}
                    style={styles.fileCard}
                    onPress={() => openFile(file)}
                  >
                    {isImage ? (
                      Platform.OS === 'web' ? (
                        <img 
                          src={fileUrl} 
                          style={{
                            width: 60,
                            height: 60,
                            objectFit: 'cover',
                            borderRadius: 8,
                            marginRight: 14,
                          }}
                          alt={file.file_name}
                        />
                      ) : (
                        <Image
                          source={{ uri: fileUrl }}
                          style={styles.fileImagePreview}
                          resizeMode="cover"
                        />
                      )
                    ) : (
                      <View style={styles.fileIconContainer}>
                        <MaterialIcons 
                          name={
                            file.file_type === 'pdf' || file.mime_type?.includes('pdf') ? 'picture-as-pdf' :
                            file.file_type === 'mp4' || file.file_type === 'mov' || file.file_type === 'avi' || file.mime_type?.includes('video') ? 'videocam' :
                            'insert-drive-file'
                          } 
                          size={32} 
                          color={colors.primary} 
                        />
                      </View>
                    )}
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
                        {file.file_name}
                      </Text>
                      {file.file_size && (
                        <Text style={styles.fileSize}>
                          {(file.file_size / 1024).toFixed(2)} KB
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null;
        })()}

        {/* Кнопка чата */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.chatButtonLarge}
            onPress={() => navigation.navigate('Chat', { ticketId: ticket.id, isStaff: true })}
          >
            <Text style={styles.chatButtonLargeIcon}>→</Text>
            <Text style={styles.chatButtonLargeText}>Открыть чат</Text>
          </TouchableOpacity>
        </View>

        {/* Управление статусом */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Управление статусом</Text>
          <View style={styles.statusButtons}>
            {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.statusButton,
                  status === s && styles.statusButtonActive,
                ]}
                onPress={() => handleStatusChange(s)}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    status === s && styles.statusButtonTextActive,
                  ]}
                >
                  {getStatusLabel(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 16,
  },
  ticketCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  ticketCardHeader: {
    marginBottom: 12,
  },
  ticketSubject: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textLight,
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  priorityBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textLight,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  ticketCardMeta: {
    marginTop: 8,
  },
  ticketMetaText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  clientInfo: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 140,
    minWidth: 140,
  },
  infoValue: {
    fontSize: 14,
    color: colors.textDark,
    flex: 1,
    fontWeight: '500',
  },
  fileCard: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  fileImagePreview: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 14,
  },
  fileIconContainer: {
    width: 60,
    height: 60,
    backgroundColor: colors.backgroundLight,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: colors.textMuted,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textLight,
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 60,
  },
  messageFiles: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  messageFile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    padding: 8,
    borderRadius: 8,
  },
  messageFileIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  messageFileName: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.backgroundWhite,
  },
  statusButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  statusButtonTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  emptyMessages: {
    padding: 20,
    alignItems: 'center',
  },
  emptyMessagesText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  requestDescription: {
    marginTop: 8,
  },
  requestDescriptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 8,
  },
  requestDescriptionDetails: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  chatButtonLarge: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chatButtonLargeIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  chatButtonLargeText: {
    color: colors.textLight,
    fontSize: 18,
    fontWeight: '600',
  },
});
