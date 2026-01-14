import axios from 'axios';
import Constants from 'expo-constants';

// URL вашего backend API
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor для обработки ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Логируем ошибки для отладки
    if (error.response) {
      // Сервер ответил с кодом ошибки
      console.error('API Error Response:', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      console.error('API Error Request:', {
        message: 'No response from server',
        url: error.config?.url,
        baseURL: error.config?.baseURL
      });
    } else {
      // Ошибка при настройке запроса
      console.error('API Error:', error.message);
    }
    
    if (error.response?.status === 401) {
      // Токен истёк или невалидный
      // Можно добавить автоматический logout
    }
    return Promise.reject(error);
  }
);

export default api;

