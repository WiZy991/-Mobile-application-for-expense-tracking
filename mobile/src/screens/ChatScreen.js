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
  Linking,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../services/api';
import colors from '../theme/colors';

export default function ChatScreen({ route, navigation }) {
  const { ticketId, isStaff = false } = route.params;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const scrollViewRef = useRef(null);

  useEffect(() => {
    loadMessages();
    
    // Автообновление каждые 5 секунд для синхронизации сообщений (без показа загрузки)
    const interval = setInterval(() => {
      loadMessages(false);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [ticketId]);

  const loadMessages = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const endpoint = isStaff 
        ? `/staff/support/tickets/${ticketId}`
        : `/support/tickets/${ticketId}`;
      const response = await api.get(endpoint);
      
      // Получаем тему тикета для фильтрации дублирующих сообщений
      const ticket = response.data.ticket;
      let messages = response.data.messages || [];
      
      // Фильтруем первое сообщение, если оно дублирует тему тикета
      // Это для существующих тикетов, созданных со старой логикой
      if (messages.length > 0 && ticket) {
        const firstMessage = messages[0];
        // Если первое сообщение совпадает с темой или описанием тикета - скрываем его
        // Но показываем, если у него есть файлы
        const messageText = firstMessage.message?.trim() || '';
        const subjectText = ticket.subject?.trim() || '';
        const ticketMessage = ticket.message?.trim() || '';
        
        const isDuplicate = messageText === subjectText || 
                           messageText === ticketMessage ||
                           (messageText.length > 0 && subjectText.includes(messageText)) ||
                           (messageText.length > 0 && messageText.includes(subjectText));
        
        // Показываем первое сообщение только если:
        // 1. Оно не дублирует тему/описание
        // 2. ИЛИ у него есть файлы
        // 3. ИЛИ оно содержит информацию о файлах
        const hasFiles = firstMessage.files && firstMessage.files.length > 0;
        const isFileInfo = messageText.includes('Прикреплено файлов') || messageText.includes('файлов');
        
        if (isDuplicate && !hasFiles && !isFileInfo) {
          console.log('[Chat] Filtering duplicate first message:', {
            messageText: messageText.substring(0, 50),
            subjectText,
            hasFiles
          });
          messages = messages.slice(1); // Убираем первое сообщение
        }
      }
      
      console.log('[Chat] Loaded messages:', {
        ticketId,
        totalMessages: response.data.messages?.length || 0,
        filteredMessages: messages.length,
        ticketFiles: ticket?.files?.length || 0
      });
      
      setMessages(messages);
      
      // Автопрокрутка к последнему сообщению
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error loading messages:', error);
      if (showLoading) {
        Alert.alert('Ошибка', 'Не удалось загрузить сообщения');
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
    loadMessages();
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      Alert.alert('Ошибка', 'Введите сообщение');
      return;
    }

    setSending(true);
    try {
      const endpoint = isStaff
        ? `/staff/support/tickets/${ticketId}/messages`
        : `/support/tickets/${ticketId}/messages`;
      await api.post(endpoint, {
        message: newMessage.trim(),
      });
      setNewMessage('');
      // Немедленное обновление после отправки сообщения
      await loadMessages(false);
      // Автопрокрутка к новому сообщению
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Ошибка', 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
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
    const apiBaseUrl = api.defaults.baseURL || 'http://localhost:3000/api';
    const baseUrl = apiBaseUrl.replace('/api', '');
    const filePath = file.file_path.startsWith('/') ? file.file_path : `/${file.file_path}`;
    const fileUrl = `${baseUrl}${filePath}`;
    
    console.log('[Chat] Opening file:', {
      file_path: file.file_path,
      fileUrl,
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Заголовок */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Чат тикета #{ticketId}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Чат */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatContainer}
        contentContainerStyle={styles.chatContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onContentSizeChange={() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyMessagesText}>Пока нет сообщений</Text>
          </View>
        ) : (
          messages.map((msg) => {
            const isMyMessage = isStaff 
              ? (msg.user_type === 'support' || msg.user_type === 'staff')
              : msg.user_type === 'client';
            
            return (
              <View
                key={msg.id}
                style={[
                  styles.messageBubble,
                  isMyMessage ? styles.messageBubbleRight : styles.messageBubbleLeft,
                ]}
              >
                <View style={[
                  styles.messageBubbleContent,
                  isMyMessage ? styles.messageBubbleContentRight : styles.messageBubbleContentLeft,
                ]}>
                  <Text style={styles.messageBubbleAuthor}>
                    {msg.user_name || (isMyMessage ? 'Вы' : (isStaff ? 'Клиент' : 'Сотрудник поддержки'))}
                  </Text>
                  {msg.message && msg.message.trim() && (
                    <Text style={styles.messageBubbleText}>{msg.message}</Text>
                  )}
                  {msg.files && msg.files.length > 0 && (
                    <View style={styles.messageFiles}>
                      {msg.files.map((file) => {
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
                            style={styles.messageFile}
                            onPress={() => openFile(file)}
                            activeOpacity={0.7}
                          >
                            {isImage ? (
                              Platform.OS === 'web' ? (
                                <img 
                                  src={fileUrl} 
                                  style={{
                                    width: '100%',
                                    height: 150,
                                    objectFit: 'cover',
                                    borderRadius: 8,
                                    marginBottom: 8,
                                  }}
                                  alt={file.file_name}
                                />
                              ) : (
                                <Image 
                                  source={{ uri: fileUrl }} 
                                  style={styles.messageFileImage}
                                  resizeMode="cover"
                                />
                              )
                            ) : (
                              <View style={styles.messageFileIconContainer}>
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
                            <View style={styles.messageFileInfo}>
                              <Text style={styles.messageFileName} numberOfLines={1}>
                                {file.file_name}
                              </Text>
                              {file.file_size && (
                                <Text style={styles.messageFileSize}>
                                  {(file.file_size / 1024).toFixed(2)} KB
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <Text style={styles.messageBubbleTime}>{formatDate(msg.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Поле ввода сообщения */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.messageInput}
          placeholder="Введите сообщение..."
          placeholderTextColor={colors.textMuted}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color={colors.textLight} size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Отправить</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  chatContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  messageBubbleLeft: {
    alignSelf: 'flex-start',
  },
  messageBubbleRight: {
    alignSelf: 'flex-end',
  },
  messageBubbleContent: {
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageBubbleContentLeft: {
    backgroundColor: colors.backgroundLight,
  },
  messageBubbleContentRight: {
    backgroundColor: colors.primary + '15',
  },
  messageBubbleAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  messageBubbleText: {
    fontSize: 14,
    color: colors.textDark,
    lineHeight: 20,
    marginBottom: 4,
  },
  messageBubbleTime: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageFiles: {
    marginTop: 8,
    gap: 8,
  },
  messageFile: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 8,
    padding: 8,
    overflow: 'hidden',
  },
  messageFileImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: colors.backgroundLight,
  },
  messageFileIconContainer: {
    width: '100%',
    height: 60,
    backgroundColor: colors.backgroundLight,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageFileInfo: {
    flex: 1,
  },
  messageFileName: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
    marginBottom: 2,
  },
  messageFileSize: {
    fontSize: 12,
    color: colors.textMuted,
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
  emptyMessages: {
    padding: 20,
    alignItems: 'center',
  },
  emptyMessagesText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
