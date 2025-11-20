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
    if (error.response?.status === 401) {
      // Токен истёк или невалидный
      // Можно добавить автоматический logout
    }
    return Promise.reject(error);
  }
);

export default api;

