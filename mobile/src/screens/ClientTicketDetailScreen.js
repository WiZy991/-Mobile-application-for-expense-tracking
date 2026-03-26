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
  Linking,
  Image,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';

export default function ClientTicketDetailScreen({ route, navigation }) {
  const { ticketId } = route.params;
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');

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
      const response = await api.get(`/support/tickets/${ticketId}`);
      const messagesData = response.data.messages || [];
      console.log(`[Client] Loaded ticket ${ticketId}:`, {
        ticketStatus: response.data.ticket?.status,
        messagesCount: messagesData.length,
        messages: messagesData.map(m => ({
          id: m.id,
          user_type: m.user_type,
          user_name: m.user_name,
          message: (m.message || '').substring(0, 30) + '...'
        }))
      });
      
      // Проверяем, есть ли сообщения от инженеров
      const supportMessages = messagesData.filter(m => m.user_type === 'support' || m.user_type === 'staff');
      console.log(`[Client] Support messages count: ${supportMessages.length}`);
      
      setTicket(response.data.ticket);
      setMessages(messagesData);
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

  const handleDeleteTicket = async () => {
    console.log('[DELETE TICKET DETAIL] ===== START DELETE =====');
    console.log('[DELETE TICKET DETAIL] Delete button pressed for ticket:', ticketId);
    
    try {
      console.log('[DELETE TICKET DETAIL] Making DELETE request...');
      const response = await api.delete(`/support/tickets/${ticketId}`);
      console.log('[DELETE TICKET DETAIL] Delete response:', response.data);
      console.log('[DELETE TICKET DETAIL] Response status:', response.status);
      
      // Возвращаемся назад после успешного удаления
      console.log('[DELETE TICKET DETAIL] Navigating back...');
      navigation.goBack();
      console.log('[DELETE TICKET DETAIL] ===== DELETE SUCCESS =====');
    } catch (error) {
      console.error('[DELETE TICKET DETAIL] ❌ ERROR:', error);
      console.error('[DELETE TICKET DETAIL] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url,
        method: error.config?.method,
      });
      
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        'Не удалось удалить тикет. Проверьте подключение к серверу.';
      
      Alert.alert('Ошибка', errorMessage);
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
    const apiBaseUrl = api.defaults.baseURL || 'http://localhost:3000/api';
    const baseUrl = apiBaseUrl.replace('/api', '');
    const filePath = file.file_path.startsWith('/') ? file.file_path : `/${file.file_path}`;
    const fileUrl = `${baseUrl}${filePath}`;
    console.log('[Client] Opening file:', { filePath: file.file_path, fileUrl });
    Linking.openURL(fileUrl).catch(err => {
      console.error('Error opening file:', err);
      Alert.alert('Ошибка', 'Не удалось открыть файл');
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
        {ticket.status === 'open' && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteTicket}
          >
            <Text style={styles.deleteButtonText}>×</Text>
          </TouchableOpacity>
        )}
        {ticket.status !== 'open' && <View style={styles.headerRight} />}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Информация о тикете */}
        <View style={styles.section}>
          <View style={styles.ticketHeader}>
            <Text style={styles.ticketSubject}>{ticket.subject}</Text>
            <View style={styles.badges}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: getPriorityColor(ticket.priority) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: getPriorityColor(ticket.priority) },
                  ]}
                >
                  {getPriorityLabel(ticket.priority)}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: getStatusColor(ticket.status) + '20' },
                ]}
              >
                <Text
                  style={[styles.badgeText, { color: getStatusColor(ticket.status) }]}
                >
                  {getStatusLabel(ticket.status)}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.ticketDate}>
            Создан: {formatDate(ticket.created_at)}
          </Text>
          {ticket.updated_at && (
            <Text style={styles.ticketDate}>
              Обновлен: {formatDate(ticket.updated_at)}
            </Text>
          )}
        </View>

        {/* Файлы тикета */}
        {ticket.files && ticket.files.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Прикрепленные файлы</Text>
            {ticket.files.map((file) => {
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
                          marginRight: 12,
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
        )}

        {/* Кнопка чата */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.chatButtonLarge}
            onPress={() => navigation.navigate('Chat', { ticketId: ticket.id, isStaff: false })}
          >
            <Text style={styles.chatButtonLargeIcon}>→</Text>
            <Text style={styles.chatButtonLargeText}>Открыть чат</Text>
          </TouchableOpacity>
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
  deleteButton: {
    padding: 8,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textDark,
    flex: 1,
  },
  chatButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  chatButtonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  ticketHeader: {
    marginBottom: 8,
  },
  ticketSubject: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ticketDate: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  fileCard: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundWhite,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  fileImagePreview: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
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
    fontSize: 24,
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: colors.textMuted,
  },
  messageCard: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  messageClient: {
    backgroundColor: colors.primaryLight + '20',
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  messageStaff: {
    backgroundColor: colors.backgroundLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.textMuted,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  messageAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  messageDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  messageText: {
    fontSize: 14,
    color: colors.textDark,
    lineHeight: 20,
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
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.backgroundWhite,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 12,
    maxHeight: 100,
    fontSize: 14,
    color: colors.textDark,
    marginRight: 12,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: colors.textLight,
    fontSize: 14,
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
