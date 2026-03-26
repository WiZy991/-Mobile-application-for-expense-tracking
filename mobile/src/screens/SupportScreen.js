import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  ActionSheetIOS,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import colors from '../theme/colors';

const PRIORITIES = [
  { id: 'low', label: 'Низкий', icon: '🟢', color: colors.textMuted },
  { id: 'normal', label: 'Обычный', icon: '🟡', color: colors.primary },
  { id: 'high', label: 'Высокий', icon: '🟠', color: '#ff8800' },
  { id: 'urgent', label: 'Срочно', icon: '🔴', color: '#ff4444' },
];

export default function SupportScreen({ navigation }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTickets, setShowTickets] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [deletingTicketId, setDeletingTicketId] = useState(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedTicketForAction, setSelectedTicketForAction] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [longPressHandled, setLongPressHandled] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [alertShown, setAlertShown] = useState(false);

  useEffect(() => {
    loadTickets();
    requestMediaPermissions();
  }, []);

  // Обновляем список тикетов при возврате на экран
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('SupportScreen focused, reloading tickets...');
      loadTickets();
    });

    return unsubscribe;
  }, [navigation]);

  const requestMediaPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Разрешения',
          'Для прикрепления файлов необходимо разрешение на доступ к галерее.'
        );
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newFiles = result.assets.map((asset, index) => {
          // Генерируем безопасное имя файла
          let fileName = asset.fileName;
          if (!fileName || fileName.includes('data:') || fileName.includes('base64')) {
            const ext = asset.mimeType?.split('/')[1] || 'jpg';
            fileName = `file_${Date.now()}_${index}.${ext}`;
          }
          // Убираем недопустимые символы из имени файла
          fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
          
          return {
            uri: asset.uri,
            type: asset.type || 'image',
            name: fileName,
            mimeType: asset.mimeType || 'image/jpeg',
          };
        });
        setSelectedFiles([...selectedFiles, ...newFiles]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Ошибка', 'Не удалось выбрать файл');
    }
  };

  // Функция для выбора документов (PDF, Excel, ZIP и т.д.)
  const pickDocument = async () => {
    try {
      // На веб-платформе используем input[type=file]
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.rar,.7z,.gz,.tar,.sig,.p7s,.p7m,.p7c';
        
        input.onchange = (e) => {
          const files = Array.from(e.target.files);
          const newFiles = files.map((file, index) => ({
            uri: file, // На веб это будет File объект
            type: 'document',
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
          }));
          setSelectedFiles([...selectedFiles, ...newFiles]);
        };
        
        input.click();
      } else {
        // На мобильных платформах используем expo-image-picker с All типами
        // или можно использовать expo-document-picker (нужно установить)
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
        });

        if (!result.canceled && result.assets) {
          const newFiles = result.assets.map((asset, index) => {
            let fileName = asset.fileName || `document_${Date.now()}_${index}`;
            fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            
            return {
              uri: asset.uri,
              type: asset.type || 'document',
              name: fileName,
              mimeType: asset.mimeType || 'application/octet-stream',
            };
          });
          setSelectedFiles([...selectedFiles, ...newFiles]);
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Ошибка', 'Не удалось выбрать документ');
    }
  };

  const removeFile = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const loadTickets = async () => {
    try {
      console.log('Loading tickets...');
      setLoading(true);
      const response = await api.get('/support/tickets');
      console.log('Tickets loaded:', response.data.tickets?.length || 0, 'tickets');
      setTickets(response.data.tickets || []);
    } catch (error) {
      console.error('Error loading tickets:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить тикеты');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Ошибка', 'Заполните тему и сообщение');
      return;
    }

    setSending(true);
    try {
      console.log('Sending support ticket...', { 
        subject: subject.trim(), 
        message: message.trim(),
        filesCount: selectedFiles.length 
      });
      
      // Создаем FormData для отправки файлов
      const formData = new FormData();
      formData.append('subject', subject.trim());
      formData.append('message', message.trim());
      formData.append('priority', priority);
      
      console.log('[SupportScreen] Preparing files for upload:', {
        filesCount: selectedFiles.length,
        files: selectedFiles.map(f => ({
          uri: f.uri,
          name: f.name,
          type: f.mimeType,
          size: f.size
        }))
      });
      
      // Добавляем файлы
      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index];
        const fileUri = file.uri;
        const fileType = file.mimeType || 'image/jpeg';
        // Генерируем безопасное имя файла без недопустимых символов
        let fileName = file.name || `file_${index}.jpg`;
        // Убираем недопустимые символы
        fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        // Если имя файла все еще содержит проблемные символы, генерируем новое
        if (fileName.includes('data:') || fileName.includes('base64') || fileName.length > 255) {
          const ext = fileType.split('/')[1] || 'jpg';
          fileName = `file_${Date.now()}_${index}.${ext}`;
        }
        
        let fileObject;
        if (Platform.OS === 'web') {
          // Для веб-платформы expo-image-picker возвращает blob URI или data URI
          // Нужно преобразовать в File объект
          try {
            if (fileUri instanceof File) {
              fileObject = fileUri;
            } else if (fileUri instanceof Blob) {
              // Преобразуем Blob в File
              fileObject = new File([fileUri], fileName, { type: fileType });
            } else if (fileUri.startsWith('blob:')) {
              // Если это blob URI, нужно получить Blob через fetch
              const response = await fetch(fileUri);
              const blob = await response.blob();
              fileObject = new File([blob], fileName, { type: blob.type || fileType });
            } else if (fileUri.startsWith('data:')) {
              // Если это data URI, преобразуем в Blob, затем в File
              // data URI формат: data:image/jpeg;base64,/9j/4AAQ...
              const base64Data = fileUri.split(',')[1];
              const mimeType = fileUri.split(';')[0].split(':')[1] || fileType;
              
              // Преобразуем base64 в binary
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              // Создаем Blob, затем File
              const blob = new Blob([bytes], { type: mimeType });
              fileObject = new File([blob], fileName, { type: mimeType });
            } else {
              // Пробуем загрузить как обычный файл
              const response = await fetch(fileUri);
              const blob = await response.blob();
              fileObject = new File([blob], fileName, { type: blob.type || fileType });
            }
          } catch (webFileError) {
            console.error(`[SupportScreen] Error processing web file ${index + 1}:`, webFileError);
            Alert.alert('Ошибка', `Не удалось обработать файл ${fileName}: ${webFileError.message}`);
            continue;
          }
        } else {
          // Для мобильных платформ
          fileObject = {
            uri: Platform.OS === 'ios' ? fileUri.replace('file://', '') : fileUri,
            type: fileType,
            name: fileName,
          };
        }
        
        console.log(`[SupportScreen] Appending file ${index + 1}:`, {
          name: fileName,
          type: fileType,
          uri: fileUri.substring(0, 50) + '...',
          isFile: fileObject instanceof File,
          isBlob: fileObject instanceof Blob,
          fileObjectType: typeof fileObject,
          fileObjectKeys: fileObject ? Object.keys(fileObject) : null
        });
        
        formData.append('files', fileObject);
      }
      
      console.log('[SupportScreen] FormData created, sending request...');

      const response = await api.post('/support/tickets', formData);

      console.log('Ticket sent successfully:', response.data);

      // Очищаем форму сразу
      setSubject('');
      setMessage('');
      setPriority('normal');
      setSelectedFiles([]);
      
      // Обновляем список тикетов
      await loadTickets();
      
      // Показываем список тикетов
      setShowTickets(true);
      
      // Если тикет создан, переходим к нему
      if (response.data.ticket && response.data.ticket.id) {
        Alert.alert(
          '✅ Отправлено',
          `Ваш запрос отправлен в отдел поддержки.${selectedFiles.length > 0 ? ` Прикреплено файлов: ${selectedFiles.length}` : ''} Мы ответим в ближайшее время.`,
          [
            {
              text: 'Посмотреть тикет',
              onPress: () => {
                navigation.navigate('ClientTicketDetail', { ticketId: response.data.ticket.id });
              },
            },
            {
              text: 'ОК',
              style: 'cancel',
            },
          ]
        );
      } else {
        Alert.alert(
          '✅ Отправлено',
          `Ваш запрос отправлен в отдел поддержки.${selectedFiles.length > 0 ? ` Прикреплено файлов: ${selectedFiles.length}` : ''} Мы ответим в ближайшее время.`
        );
      }
    } catch (error) {
      console.error('Error sending ticket:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      let errorMessage = 'Не удалось отправить запрос. Попробуйте позже.';
      
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        errorMessage = 'Не удалось подключиться к серверу. Убедитесь, что сервер запущен и доступен.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Необходима авторизация. Пожалуйста, войдите в систему.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Доступ запрещен. Пожалуйста, войдите в систему заново.';
      } else if (error.response?.status === 400) {
        const errorData = error.response.data;
        errorMessage = errorData?.error || 'Неверные данные запроса.';
        // Показываем детали ошибки в консоли
        console.error('[SupportScreen] 400 Error details:', {
          error: errorData?.error,
          details: errorData?.details,
          fileError: errorData?.fileError
        });
      } else if (error.response?.status === 500) {
        errorMessage = 'Ошибка сервера. Попробуйте позже или обратитесь в техподдержку.';
      }
      
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusText = (status) => {
    const statusMap = {
      open: 'Открыт',
      in_progress: 'В работе',
      resolved: 'Решен',
      closed: 'Закрыт',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      open: colors.warning,
      in_progress: colors.primary,
      resolved: colors.success,
      closed: colors.textMuted,
    };
    return colorMap[status] || colors.textMuted;
  };

  const showTicketActions = (ticket) => {
    console.log('showTicketActions called for ticket:', ticket);
    if (!ticket || !ticket.id) {
      console.error('Invalid ticket in showTicketActions:', ticket);
      return;
    }
    console.log('Setting selectedTicketForAction to:', ticket);
    setSelectedTicketForAction(ticket);
    console.log('Setting showActionMenu to true');
    setShowActionMenu(true);
    console.log('Menu should now be visible');
  };

  const handleActionMenuChoice = async (action) => {
    console.log('Action menu choice:', action, 'for ticket:', selectedTicketForAction?.id);
    const ticketId = selectedTicketForAction?.id;
    setShowActionMenu(false);
    
    if (!selectedTicketForAction || !ticketId) {
      setSelectedTicketForAction(null);
      return;
    }

    if (action === 'delete') {
      // Удаляем сразу
      console.log('[DELETE SINGLE] Starting deletion for ticket:', ticketId);
      setDeletingTicketId(ticketId);
      setSelectedTicketForAction(null);
      
      try {
        const response = await api.delete(`/support/tickets/${ticketId}`);
        console.log('[DELETE SINGLE] Delete response:', response.data);
        setDeletingTicketId(null);
        
        // Обновляем список
        await loadTickets();
      } catch (error) {
        console.error('[DELETE SINGLE] Error deleting ticket:', error);
        console.error('[DELETE SINGLE] Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
        setDeletingTicketId(null);
        
        const errorMessage =
          error.response?.data?.error ||
          error.message ||
          'Не удалось удалить тикет. Попробуйте позже.';
        
        Alert.alert('Ошибка', errorMessage);
      }
    } else if (action === 'select') {
      setSelectionMode(true);
      setSelectedTickets([ticketId]);
      setSelectedTicketForAction(null);
    } else {
      setSelectedTicketForAction(null);
    }
  };

  const toggleSelection = (ticketId) => {
    if (selectedTickets.includes(ticketId)) {
      setSelectedTickets(selectedTickets.filter(id => id !== ticketId));
    } else {
      setSelectedTickets([...selectedTickets, ticketId]);
    }
  };

  const handleDeleteSelected = async () => {
    console.log('[DELETE] ===== START =====');
    console.log('[DELETE] handleDeleteSelected called, selectedTickets:', selectedTickets);
    console.log('[DELETE] isDeleting:', isDeleting);
    
    // Защита от множественных вызовов
    if (isDeleting) {
      console.log('[DELETE] Already deleting, ignoring');
      return;
    }
    
    if (selectedTickets.length === 0) {
      Alert.alert('Внимание', 'Выберите тикеты для удаления');
      return;
    }

    const ticketsToDelete = [...selectedTickets];
    console.log('[DELETE] Will delete:', ticketsToDelete);
    
    // Устанавливаем флаг СРАЗУ
    setIsDeleting(true);
    
    try {
      console.log('[DELETE] Starting deletion immediately...');
      
      // Удаляем тикеты по одному
      const deletePromises = ticketsToDelete.map(async (ticketId) => {
                console.log(`[DELETE] Starting deletion of ticket ${ticketId}...`);
                try {
                  const url = `/support/tickets/${ticketId}`;
                  console.log(`[DELETE] Making DELETE request to: ${url}`);
                  
                  const response = await api.delete(url);
                  console.log(`[DELETE] Ticket ${ticketId} - Response status:`, response.status);
                  console.log(`[DELETE] Ticket ${ticketId} - Response data:`, JSON.stringify(response.data));
                  
                  // Проверяем статус ответа
                  if (response.status >= 200 && response.status < 300) {
                    // Успешный ответ от сервера
                    console.log(`[DELETE] ✅ Ticket ${ticketId} deleted successfully`);
                    return { success: true, ticketId };
                  } else {
                    console.warn(`[DELETE] ⚠️ Unexpected status code for ticket ${ticketId}:`, response.status);
                    return { 
                      error: true, 
                      ticketId, 
                      message: `Неожиданный статус ответа: ${response.status}` 
                    };
                  }
                } catch (error) {
                  console.error(`[DELETE] ❌ Error deleting ticket ${ticketId}:`, error);
                  console.error('[DELETE] Error details:', {
                    message: error.message,
                    response: error.response?.data,
                    status: error.response?.status,
                    url: error.config?.url,
                    method: error.config?.method,
                    baseURL: error.config?.baseURL,
                  });
                  
                  let errorMessage = 'Ошибка удаления';
                  if (error.response?.data?.error) {
                    errorMessage = typeof error.response.data.error === 'string' 
                      ? error.response.data.error 
                      : error.response.data.error.message || 'Ошибка удаления';
                  } else if (error.response?.data?.message) {
                    errorMessage = error.response.data.message;
                  } else if (error.message) {
                    errorMessage = error.message;
                  }
                  
                  // Специальная обработка сетевых ошибок
                  if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
                    errorMessage = 'Ошибка сети. Проверьте подключение к серверу.';
                  } else if (error.response?.status === 401) {
                    errorMessage = 'Требуется авторизация. Войдите в систему заново.';
                  } else if (error.response?.status === 403) {
                    errorMessage = 'Нет доступа к этому тикету.';
                  } else if (error.response?.status === 404) {
                    errorMessage = 'Тикет не найден (возможно, уже удален).';
                  }
                  
                  return { 
                    error: true, 
                    ticketId, 
                    message: errorMessage
                  };
                }
      });

      const results = await Promise.all(deletePromises);
      console.log('[DELETE] Results:', results);
      
      const errors = results.filter(r => r?.error);
      const successCount = ticketsToDelete.length - errors.length;

      console.log(`[DELETE] Done: ${successCount} success, ${errors.length} errors`);

      // Очищаем выбор СРАЗУ
      setSelectedTickets([]);
      setSelectionMode(false);

      // Обновляем список
      await loadTickets();

      // Показываем результат только если были ошибки
      if (errors.length > 0) {
        const errorMessages = errors.map(e => `Тикет ${e.ticketId}: ${e.message}`).join('\n');
        Alert.alert('Частично удалено', `Удалено: ${successCount}, ошибок: ${errors.length}\n\n${errorMessages}`);
      }
      
      console.log('[DELETE] ===== COMPLETE =====');
    } catch (error) {
      console.error('[DELETE] ❌ FATAL ERROR:', error);
      Alert.alert('Ошибка', `Не удалось удалить тикеты: ${error.message || 'Неизвестная ошибка'}`);
      setSelectedTickets([]);
      setSelectionMode(false);
    } finally {
      setIsDeleting(false);
      console.log('[DELETE] Flag reset');
    }
  };

  const handleDeleteSingle = async (ticketId) => {
    // Предотвращаем множественные вызовы
    if (deletingTicketId === ticketId) {
      console.log('[DELETE SINGLE] Delete already in progress for ticket:', ticketId);
      return;
    }

    console.log('[DELETE SINGLE] handleDeleteSingle called with ticketId:', ticketId);
    
    // Удаляем сразу
    setDeletingTicketId(ticketId);
    
    try {
      const response = await api.delete(`/support/tickets/${ticketId}`);
      console.log('[DELETE SINGLE] Delete response:', response.data);
      setDeletingTicketId(null);
      
      // Обновляем список
      await loadTickets();
    } catch (error) {
      console.error('[DELETE SINGLE] Error deleting ticket:', error);
      console.error('[DELETE SINGLE] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      setDeletingTicketId(null);
      
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        'Не удалось удалить тикет. Попробуйте позже.';
      
      Alert.alert('Ошибка', errorMessage);
    }
  };

  if (showTickets) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (selectionMode) {
                setSelectionMode(false);
                setSelectedTickets([]);
              } else {
                setShowTickets(false);
              }
            }}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>
              {selectionMode ? 'Отмена' : '← Назад'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {selectionMode ? `Выбрано: ${selectedTickets.length}` : 'Мои запросы'}
          </Text>
          {selectionMode && (
            <TouchableOpacity
              onPress={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[DELETE] Delete selected button pressed, selectedTickets:', selectedTickets);
                console.log('[DELETE] isDeleting flag:', isDeleting);
                
                // Защита от множественных нажатий
                if (isDeleting) {
                  console.log('[DELETE] Delete already in progress, ignoring button press');
                  return;
                }
                
                if (selectedTickets.length > 0) {
                  console.log('[DELETE] Calling handleDeleteSelected...');
                  handleDeleteSelected();
                } else {
                  console.log('[DELETE] No tickets selected');
                  Alert.alert('Внимание', 'Выберите тикеты для удаления');
                }
              }}
              style={[styles.headerActionButton, isDeleting && styles.headerActionButtonDisabled]}
              activeOpacity={0.7}
              disabled={isDeleting}
            >
              <Text style={styles.headerActionText}>
                {isDeleting ? 'Удаление...' : `Удалить (${selectedTickets.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isSelected = selectedTickets.includes(item.id);
              return (
                <TouchableOpacity
                  style={[
                    styles.ticketItem,
                    isSelected && styles.ticketItemSelected,
                  ]}
                  onPress={() => {
                    // Предотвращаем onPress если был longPress
                    if (longPressHandled) {
                      console.log('Ignoring onPress because longPress was handled');
                      setLongPressHandled(false);
                      return;
                    }
                    console.log('Ticket pressed:', item.id, 'selectionMode:', selectionMode);
                    if (selectionMode) {
                      toggleSelection(item.id);
                    } else {
                      navigation.navigate('ClientTicketDetail', { ticketId: item.id });
                    }
                  }}
                  onLongPress={(e) => {
                    console.log('Long press detected on ticket:', item.id);
                    if (!selectionMode) {
                      console.log('Calling showTicketActions');
                      setLongPressHandled(true);
                      showTicketActions(item);
                    }
                  }}
                  delayLongPress={500}
                  onPressOut={() => {
                    // Сбрасываем флаг через небольшую задержку
                    setTimeout(() => {
                      setLongPressHandled(false);
                    }, 200);
                  }}
                  onContextMenu={(e) => {
                    // Для веб - правый клик
                    if (Platform.OS === 'web' && !selectionMode) {
                      e.preventDefault();
                      console.log('Right click detected on ticket:', item.id);
                      showTicketActions(item);
                    }
                  }}
                >
                  {selectionMode && (
                    <View style={styles.checkbox}>
                      <Text style={styles.checkboxText}>
                        {isSelected ? '✓' : ''}
                      </Text>
                    </View>
                  )}
                  <View style={styles.ticketContent}>
                    <View style={styles.ticketHeader}>
                      <Text style={styles.ticketSubject}>{item.subject}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: getStatusColor(item.status) + '20' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: getStatusColor(item.status) },
                          ]}
                        >
                          {getStatusText(item.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.ticketDate}>{formatDate(item.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>Нет запросов</Text>
                <Text style={styles.emptySubtext}>
                  Ваши обращения в поддержку появятся здесь
                </Text>
              </View>
            }
          />
        )}

        {/* Модальное меню действий */}
        <Modal
          visible={showActionMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            console.log('Modal close requested');
            setShowActionMenu(false);
            setSelectedTicketForAction(null);
          }}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => {
              console.log('Modal overlay pressed - closing menu');
              setShowActionMenu(false);
              setSelectedTicketForAction(null);
            }}
          >
            <View 
              style={styles.actionMenu} 
              onStartShouldSetResponder={() => true}
              onTouchEnd={(e) => {
                e.stopPropagation();
              }}
              onPress={(e) => {
                // Предотвращаем закрытие меню при клике внутри
                e.stopPropagation();
              }}
            >
              <Text style={styles.actionMenuTitle}>
                {selectedTicketForAction?.subject || 'Действия с тикетом'}
              </Text>
              <TouchableOpacity
                style={[styles.actionMenuItem, styles.actionMenuItemDanger]}
                onPress={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Delete action button pressed in modal');
                  console.log('Selected ticket for action:', selectedTicketForAction);
                  
                  // Закрываем меню сразу
                  setShowActionMenu(false);
                  const ticketId = selectedTicketForAction?.id;
                  
                  if (!ticketId) {
                    console.error('No ticket ID for deletion');
                    Alert.alert('Ошибка', 'Не удалось определить тикет для удаления');
                    setSelectedTicketForAction(null);
                    return;
                  }
                  
                  // Удаляем сразу
                  console.log('[DELETE SINGLE] Starting deletion for ticket:', ticketId);
                  setShowActionMenu(false);
                  setDeletingTicketId(ticketId);
                  const ticketToDelete = ticketId;
                  setSelectedTicketForAction(null);
                  
                  try {
                    const response = await api.delete(`/support/tickets/${ticketToDelete}`);
                    console.log('[DELETE SINGLE] Delete response:', response.data);
                    setDeletingTicketId(null);
                    
                    // Обновляем список
                    await loadTickets();
                  } catch (error) {
                    console.error('[DELETE SINGLE] Error deleting ticket:', error);
                    console.error('[DELETE SINGLE] Error details:', {
                      message: error.message,
                      response: error.response?.data,
                      status: error.response?.status,
                    });
                    setDeletingTicketId(null);
                    
                    const errorMessage =
                      error.response?.data?.error ||
                      error.message ||
                      'Не удалось удалить тикет. Попробуйте позже.';
                    
                    Alert.alert('Ошибка', errorMessage);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionMenuText, styles.actionMenuTextDanger]}>
                  Удалить
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Select multiple action button pressed in modal');
                  handleActionMenuChoice('select');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.actionMenuText}>
                  Выбрать несколько
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionMenuItem, styles.actionMenuItemCancel]}
                onPress={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Cancel action button pressed in modal');
                  setShowActionMenu(false);
                  setSelectedTicketForAction(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.actionMenuText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Помощь и поддержка</Text>
        <Text style={styles.subtitle}>
          Опишите вашу проблему, и мы поможем вам в кратчайшие сроки
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Заголовок</Text>
          <TextInput
            style={styles.input}
            placeholder="Например: Проблема с оплатой"
            placeholderTextColor={colors.textMuted}
            value={subject}
            onChangeText={setSubject}
            maxLength={100}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Описание</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Опишите вашу проблему подробно..."
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={styles.charCount}>{message.length}/1000</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Приоритет</Text>
          <View style={styles.priorityContainer}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.priorityButton,
                  priority === p.id && styles.priorityButtonActive,
                  { borderColor: p.color },
                ]}
                onPress={() => setPriority(p.id)}
              >
                <Text style={styles.priorityIcon}>{p.icon}</Text>
                <Text
                  style={[
                    styles.priorityLabel,
                    priority === p.id && { color: p.color, fontWeight: '600' },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Прикрепленные файлы</Text>
          <View style={styles.attachButtonsContainer}>
            <TouchableOpacity
              style={[styles.attachButton, styles.attachButtonHalf]}
              onPress={pickImage}
            >
              <Text style={styles.attachButtonText}>Изображения/Видео</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachButton, styles.attachButtonHalf]}
              onPress={pickDocument}
            >
              <Text style={styles.attachButtonText}>Документы</Text>
            </TouchableOpacity>
          </View>
          
          {selectedFiles.length > 0 && (
            <View style={styles.filesContainer}>
              {selectedFiles.map((file, index) => (
                <View key={index} style={styles.fileItem}>
                  {file.type === 'image' && file.uri ? (
                    <Image source={{ uri: file.uri }} style={styles.filePreview} />
                  ) : (
                    <View style={styles.fileIcon}>
                      <Text style={styles.fileIconText}>•</Text>
                    </View>
                  )}
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={styles.fileType}>
                      {file.type === 'image' ? 'Изображение' : 
                       file.type === 'video' ? 'Видео' :
                       file.mimeType?.includes('pdf') ? 'PDF' :
                       file.mimeType?.includes('excel') || file.mimeType?.includes('spreadsheet') ? 'Excel' :
                       file.mimeType?.includes('zip') || file.mimeType?.includes('rar') || file.mimeType?.includes('7z') ? 'Архив' :
                       file.mimeType?.includes('signature') || file.mimeType?.includes('pkcs7') ? 'Электронная подпись' :
                       file.mimeType?.includes('word') || file.mimeType?.includes('document') ? 'Документ' :
                       'Файл'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeFileButton}
                    onPress={() => removeFile(index)}
                  >
                    <Text style={styles.removeFileText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color={colors.textLight} />
          ) : (
            <Text style={styles.sendButtonText}>Отправить запрос</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewTicketsButton}
          onPress={async () => {
            await loadTickets();
            setShowTickets(true);
          }}
        >
          <Text style={styles.viewTicketsText}>📋 Мои запросы</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Как мы помогаем</Text>
        <Text style={styles.infoText}>
          • Ответ в течение 2 часов в рабочее время{'\n'}
          • Приоритетная обработка срочных запросов{'\n'}
          • История всех обращений сохраняется
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  form: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.textDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  charCount: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '600',
  },
  viewTicketsButton: {
    marginTop: 12,
    padding: 12,
    alignItems: 'center',
  },
  viewTicketsText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 22,
  },
  listContent: {
    padding: 16,
  },
  ticketItem: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketSubject: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ticketDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    padding: 50,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textDark,
    flex: 1,
  },
  headerActionButton: {
    padding: 8,
  },
  headerActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  headerActionButtonDisabled: {
    opacity: 0.5,
  },
  ticketItemSelected: {
    backgroundColor: colors.primaryLight + '20',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundWhite,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  ticketContent: {
    flex: 1,
  },
  deleteButton: {
    padding: 10,
    marginLeft: 12,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.error + '15',
    borderRadius: 22,
    zIndex: 10,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionMenu: {
    backgroundColor: colors.backgroundWhite,
    borderRadius: 16,
    padding: 20,
    minWidth: 280,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionMenuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  actionMenuItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: colors.backgroundLight,
  },
  actionMenuItemDanger: {
    backgroundColor: colors.error + '15',
  },
  actionMenuItemCancel: {
    marginTop: 8,
    backgroundColor: colors.borderLight,
  },
  actionMenuText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    textAlign: 'center',
  },
  actionMenuTextDanger: {
    color: colors.error,
  },
  attachButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  attachButton: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  attachButtonHalf: {
    flex: 1,
  },
  attachButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  filesContainer: {
    marginTop: 12,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  filePreview: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  fileIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileIconText: {
    fontSize: 24,
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
  fileType: {
    fontSize: 12,
    color: colors.textMuted,
  },
  removeFileButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.error + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeFileText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: 'bold',
  },
  priorityContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  priorityButtonActive: {
    backgroundColor: colors.backgroundWhite,
    borderWidth: 2,
  },
  priorityIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  priorityLabel: {
    fontSize: 12,
    color: colors.textDark,
    fontWeight: '500',
  },
});
