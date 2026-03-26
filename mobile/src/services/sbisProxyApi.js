/**
 * СБИС API через Backend Proxy
 * Используется для обхода CORS ограничений при работе в браузере (web)
 * 
 * На реальных мобильных устройствах можно использовать прямой sbisApi.js
 */

import { api } from './api';
import { SBIS_CONFIG } from '../config/sbisConfig';

// ID пользователя для сессии (можно заменить на реальный после авторизации)
let userId = 'default_user_' + Date.now();

/**
 * Установка ID пользователя
 */
export const setUserId = (id) => {
  userId = id;
};

/**
 * Авторизация в СБИС
 */
export const authenticate = async (login = SBIS_CONFIG.login, password = SBIS_CONFIG.password) => {
  if (SBIS_CONFIG.demoMode) {
    console.log('SBIS Proxy: Демо-режим');
    return 'demo_session';
  }

  try {
    const response = await api.post('/sbis-proxy/auth', {
      login,
      password,
      userId,
    });

    if (response.data.success) {
      console.log('SBIS Proxy: Авторизация успешна');
      return response.data.sessionId;
    } else {
      throw new Error(response.data.error || 'Ошибка авторизации');
    }
  } catch (error) {
    console.error('SBIS Proxy Auth Error:', error);
    throw new Error(error.response?.data?.error || error.message);
  }
};

/**
 * Поиск контрагента по ИНН
 * Использует SPP API в первую очередь, затем ЭДО, затем ЕГРЮЛ
 */
export const searchContractorByINN = async (inn) => {
  if (SBIS_CONFIG.demoMode) {
    return {
      success: true,
      data: {
        name: 'Демо-организация',
        inn: inn,
        kpp: '123456789',
        address: 'г. Москва, ул. Примерная, д. 1',
      },
    };
  }

  try {
    // Сначала авторизуемся (создаст сессии SPP и ЭДО если доступны)
    await authenticate();

    // Используем универсальный поиск, который пробует все доступные API
    const response = await api.post('/sbis-proxy/search-contractor', {
      inn,
      userId,
    });

    if (response.data.success) {
      console.log(`✅ Контрагент найден через ${response.data.source}:`, response.data.data?.name);
    return response.data;
    }

    return { success: false, error: response.data.error || 'Контрагент не найден' };
  } catch (error) {
    console.error('Search contractor error:', error);
    return { 
      success: false, 
      error: error.response?.data?.error || error.message 
    };
  }
};

/**
 * Получение информации о компании
 * Использует searchContractorByINN который пробует SPP API, ЭДО и ЕГРЮЛ
 */
export const getCompanyInfo = async (inn) => {
  if (SBIS_CONFIG.demoMode) {
    return {
      success: true,
      data: {
        name: 'Демо-организация',
        fullName: 'ООО "Демо-организация"',
        inn: inn,
        kpp: '123456789',
        ogrn: '1234567890123',
        address: 'г. Москва, ул. Примерная, д. 1',
        director: 'Иванов Иван Иванович',
      },
    };
  }

  try {
    // Используем универсальный поиск, который пробует SPP API в первую очередь
    const searchResult = await searchContractorByINN(inn);
    
    if (searchResult.success && searchResult.data) {
      console.log(`✅ Данные компании получены из ${searchResult.source || 'СБИС'}`);
      return {
        success: true,
        data: {
          name: searchResult.data.name,
          fullName: searchResult.data.fullName || searchResult.data.name,
          inn: searchResult.data.inn || inn,
          kpp: searchResult.data.kpp,
          ogrn: searchResult.data.ogrn,
          address: searchResult.data.address,
          director: searchResult.data.director,
          phone: searchResult.data.phone,
          email: searchResult.data.email,
          source: searchResult.source, // Откуда получены данные
        },
      };
    }
    
    return { success: false, error: searchResult.error || 'Компания не найдена' };
  } catch (error) {
    console.error('Get company info error:', error);
    return { success: false, error: error.response?.data?.error || error.message };
  }
};

/**
 * Создание счета
 */
export const createInvoice = async (invoiceData) => {
  if (SBIS_CONFIG.demoMode) {
    return {
      success: true,
      data: {
        id: 'demo_' + Date.now(),
        number: 'DEMO-' + Date.now().toString().slice(-6),
        date: new Date().toISOString().split('T')[0],
        amount: invoiceData.amount,
        status: 'created',
      },
    };
  }

  try {
    await authenticate();

    const response = await api.post('/sbis-proxy/create-invoice', {
      invoiceData,
      userId,
    });

    return response.data;
  } catch (error) {
    console.error('Create invoice error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Получение истории платежей
 */
export const getPaymentHistory = async (contractorINN, params = {}) => {
  if (SBIS_CONFIG.demoMode) {
    return {
      success: true,
      data: {
        totalSpent: 0,
        payments: [],
      },
    };
  }

  try {
    await authenticate();

    // Используем специализированный эндпоинт
    const response = await api.post('/sbis-proxy/get-documents', {
      contractorINN,
      limit: params.limit || 50,
      userId,
    });

    if (response.data.success) {
      return response.data;
    }
    
    // Если документы недоступны - возвращаем пустой список
    return { 
      success: true, 
      data: { 
        totalSpent: 0, 
        payments: [],
        message: 'История платежей пока недоступна' 
      } 
    };
  } catch (error) {
    console.error('Get payment history error:', error);
    // При ошибке возвращаем пустые данные, не ломаем приложение
    return { 
      success: true, 
      data: { 
        totalSpent: 0, 
        payments: [],
        message: 'Не удалось загрузить историю платежей'
      } 
    };
  }
};

/**
 * Выход
 */
export const logout = async () => {
  try {
    await api.post('/sbis-proxy/logout', { userId });
  } catch (error) {
    console.warn('Logout warning:', error);
  }
};

export default {
  authenticate,
  searchContractorByINN,
  getCompanyInfo,
  createInvoice,
  getPaymentHistory,
  logout,
  setUserId,
};

