import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import sbisDirectApi from './sbisApi';
import sbisProxyApi from './sbisProxyApi';

// URL вашего backend API (для собственного бэкенда)
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000/api';

// Автоматический выбор API:
// - Web (браузер): используем прокси для обхода CORS
// - Мобильные устройства: прямой доступ к СБИС API
const sbisApi = Platform.OS === 'web' ? sbisProxyApi : sbisDirectApi;
console.log(`SBIS API: Using ${Platform.OS === 'web' ? 'proxy' : 'direct'} mode (${Platform.OS})`);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor для обработки ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.log('Unauthorized - token expired or invalid');
    }
    return Promise.reject(error);
  }
);

// ============================
// СБИС API - Реэкспорт для удобства
// ============================

// Авторизация
export const sbisAuthenticate = sbisApi.authenticate;
export const sbisLogout = sbisApi.logout;
export const sbisSetCredentials = sbisApi.setCredentials;
export const sbisCheckConnection = sbisApi.checkConnection;

// Контрагенты
export const sbisSearchByInn = sbisApi.searchContractorByINN;
export const sbisGetCompanyInfo = sbisApi.getCompanyInfo;

/**
 * Авторизация в СБИС (через backend proxy)
 * Использует логин/пароль для создания сессии
 * 
 * @param {string} login - Логин СБИС
 * @param {string} password - Пароль СБИС
 * @returns {Promise<{success: boolean, sessionId: string}>}
 */
export const sbisAuth = async (login, password) => {
  try {
    const response = await api.post('/sbis-proxy/auth', {
      login,
      password,
    });
    
    return {
      success: response.data.success,
      sessionId: response.data.onlineSession,
      sppSessionId: response.data.sppSession,
    };
  } catch (error) {
    console.error('SBIS auth error:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
};

/**
 * Поиск клиента в CRM СБИС
 * Требует предварительной авторизации через sbisAuth()
 * 
 * @param {string} inn - ИНН клиента
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export const sbisGetClientFromCRM = async (inn) => {
  try {
    const response = await api.post('/sbis-proxy/crm-client-oauth', {
      inn,
      includeDeals: true,
      includeDocuments: true,
    });
    
    return {
      success: response.data.success,
      data: response.data.data,
    };
  } catch (error) {
    console.error('CRM client search error:', error);
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
};

// Документы и счета
export const sbisCreateInvoice = sbisApi.createInvoice;
export const sbisGetInvoices = sbisApi.getInvoices;
export const sbisGetDocument = sbisApi.getDocument;

// Услуги
export const sbisGetServices = sbisApi.getServicesCatalog;

// Платежи
export const sbisGetPaymentHistory = sbisApi.getPaymentHistory;

// Синхронизация
export const sbisSyncClient = sbisApi.syncClientData;

// ============================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================

/**
 * Инициализация СБИС с учетными данными
 * Вызовите эту функцию при запуске приложения с реальными данными
 * 
 * @param {string} login - Логин СБИС
 * @param {string} password - Пароль СБИС
 */
export const initSbis = async (login, password) => {
  try {
    sbisApi.setCredentials(login, password);
    const result = await sbisApi.authenticate(login, password);
    console.log('СБИС инициализирован успешно');
    return { success: true, sessionId: result };
  } catch (error) {
    console.error('Ошибка инициализации СБИС:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Полная синхронизация данных клиента из СБИС
 * 
 * @param {string} inn - ИНН организации клиента
 */
export const fullSyncFromSbis = async (inn) => {
  try {
    // 1. Получаем информацию о компании
    const companyResult = await sbisApi.getCompanyInfo(inn);
    
    // 2. Получаем счета
    const invoicesResult = await sbisApi.getInvoices(inn);
    
    // 3. Получаем историю платежей
    const paymentsResult = await sbisApi.getPaymentHistory(inn);
    
    // 4. Получаем каталог услуг
    const servicesResult = await sbisApi.getServicesCatalog();

    return {
      success: true,
      data: {
        company: companyResult.success ? companyResult.data : null,
        invoices: invoicesResult.success ? invoicesResult.data : [],
        payments: paymentsResult.success ? paymentsResult.data : { totalSpent: 0, payments: [] },
        services: servicesResult.success ? servicesResult.data : [],
        syncedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Full sync error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Создание счета на пополнение баланса
 * 
 * @param {Object} params - Параметры счета
 * @param {string} params.buyerINN - ИНН покупателя
 * @param {string} params.buyerName - Название организации покупателя
 * @param {number} params.amount - Сумма
 * @param {string} params.sellerINN - ИНН продавца (ваш ИНН)
 */
export const createTopUpInvoice = async (params) => {
  return sbisApi.createInvoice({
    buyerINN: params.buyerINN,
    buyerName: params.buyerName,
    buyerKPP: params.buyerKPP,
    sellerINN: params.sellerINN,
    amount: params.amount,
    description: 'Пополнение баланса в WorldCashBox',
    items: [{
      name: 'Пополнение баланса',
      quantity: 1,
      price: params.amount,
      total: params.amount,
      unit: 'шт',
    }],
    comment: `Пополнение баланса через приложение WorldCashBox. Дата: ${new Date().toLocaleString('ru-RU')}`,
  });
};

/**
 * Создание счета на услугу
 * 
 * @param {Object} params - Параметры счета
 */
export const createServiceInvoice = async (params) => {
  return sbisApi.createInvoice({
    buyerINN: params.buyerINN,
    buyerName: params.buyerName,
    buyerKPP: params.buyerKPP,
    sellerINN: params.sellerINN,
    amount: params.amount,
    description: `Оплата услуги: ${params.serviceName}`,
    items: [{
      name: params.serviceName,
      quantity: 1,
      price: params.amount,
      total: params.amount,
      unit: params.unit || 'шт',
    }],
    comment: `Оплата услуги через WorldCashBox. Услуга: ${params.serviceName}`,
  });
};

export default api;
