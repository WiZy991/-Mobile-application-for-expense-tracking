/**
 * СБИС (Saby) API Integration Service
 * Документация: https://saby.ru/help/integration/api
 * 
 * Формат: JSON-RPC 2.0
 * Базовый URL: https://online.sbis.ru/service/
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SBIS_CONFIG as CONFIG, isSbisConfigured } from '../config/sbisConfig';

// Локальная копия конфигурации (можно переопределить в runtime)
let SBIS_CONFIG = { ...CONFIG };

// Axios instance для СБИС API
const sbisClient = axios.create({
  baseURL: SBIS_CONFIG.baseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json-rpc; charset=utf-8',
  },
});

// Хранение токена сессии
let sessionId = null;

/**
 * Создание JSON-RPC запроса
 */
const createJsonRpcRequest = (method, params = {}) => ({
  jsonrpc: '2.0',
  method,
  params,
  id: Date.now(),
});

/**
 * Выполнение запроса к СБИС API
 */
const executeRequest = async (method, params = {}, needAuth = true) => {
  // В демо-режиме возвращаем моковые данные
  if (SBIS_CONFIG.demoMode) {
    console.log(`SBIS Demo [${method}]:`, params);
    return getDemoResponse(method, params);
  }

  try {
    // Если нужна авторизация и нет сессии - авторизуемся
    if (needAuth && !sessionId) {
      await authenticate();
    }

    // Добавляем сессию к параметрам если она есть
    const requestParams = sessionId 
      ? { ...params, Сессия: sessionId }
      : params;

    const response = await sbisClient.post('', createJsonRpcRequest(method, requestParams));

    if (response.data.error) {
      throw new Error(response.data.error.message || 'СБИС API Error');
    }

    return response.data.result;
  } catch (error) {
    console.error(`SBIS API Error [${method}]:`, error);
    
    // Если ошибка авторизации - пробуем переавторизоваться
    if (error.response?.status === 401 || error.message?.includes('Сессия')) {
      sessionId = null;
      await AsyncStorage.removeItem('sbis_session');
      
      if (needAuth) {
        await authenticate();
        return executeRequest(method, params, false); // Повторяем без рекурсивной авторизации
      }
    }
    
    throw error;
  }
};

/**
 * Получение демо-ответа для метода
 */
const getDemoResponse = (method, params) => {
  switch (method) {
    case 'СБИС.СписокКонтрагентов':
      return [{
        Идентификатор: 'demo_' + Date.now(),
        Название: 'Демо-организация',
        ИНН: params.Фильтр?.ИНН || '1234567890',
        КПП: '123456789',
        ОГРН: '1234567890123',
        ЮрАдрес: 'г. Москва, ул. Примерная, д. 1',
        Руководитель: 'Иванов Иван Иванович',
        Статус: 'active',
      }];
    
    case 'Контрагент.Получить':
      return {
        Название: 'Демо-организация',
        НазваниеПолное: 'ООО "Демо-организация"',
        ИНН: params.ИНН || '1234567890',
        КПП: '123456789',
        ОГРН: '1234567890123',
        ЮрАдрес: 'г. Москва, ул. Примерная, д. 1',
        Руководитель: 'Иванов Иван Иванович',
        Телефон: '+7 (495) 123-45-67',
        Email: 'demo@example.ru',
      };
    
    case 'СБИС.ЗаписатьДокумент':
      return {
        Идентификатор: 'doc_' + Date.now(),
        Номер: 'DEMO-' + Date.now().toString().slice(-6),
        Дата: new Date().toISOString().split('T')[0],
        Сумма: params.Документ?.Сумма || 0,
        Состояние: 'Черновик',
      };
    
    case 'СБИС.СписокДокументов':
      return {
        Документы: [],
        Всего: 0,
      };
    
    case 'СБИС.СписокНоменклатуры':
      return {
        Номенклатура: [
          { Идентификатор: '1', Наименование: 'Базовая техподдержка', Цена: 5000 },
          { Идентификатор: '2', Наименование: 'Расширенная техподдержка', Цена: 15000 },
          { Идентификатор: '3', Наименование: 'Лицензия 1С', Цена: 8500 },
        ],
      };
    
    default:
      return null;
  }
};

// ============================
// АВТОРИЗАЦИЯ
// ============================

/**
 * Аутентификация в СБИС
 * Метод: СБИС.Аутентифицировать
 * 
 * @returns {Promise<string>} ID сессии
 */
export const authenticate = async (login = SBIS_CONFIG.login, password = SBIS_CONFIG.password) => {
  // Проверяем демо-режим
  if (SBIS_CONFIG.demoMode || !login || !password) {
    console.log('SBIS: Демо-режим активен');
    sessionId = 'demo_session_' + Date.now();
    return sessionId;
  }

  try {
    // Проверяем сохраненную сессию
    const savedSession = await AsyncStorage.getItem('sbis_session');
    if (savedSession) {
      sessionId = savedSession;
      // TODO: Проверить валидность сессии
      return sessionId;
    }

    const response = await sbisClient.post('', createJsonRpcRequest('СБИС.Аутентифицировать', {
      Параметр: {
        Логин: login,
        Пароль: password,
      },
    }));

    if (response.data.error) {
      throw new Error(response.data.error.message || 'Ошибка аутентификации');
    }

    sessionId = response.data.result;
    await AsyncStorage.setItem('sbis_session', sessionId);
    
    console.log('SBIS: Аутентификация успешна');
    return sessionId;
  } catch (error) {
    console.error('SBIS Auth Error:', error);
    throw new Error('Не удалось авторизоваться в СБИС: ' + error.message);
  }
};

/**
 * Завершение сессии
 */
export const logout = async () => {
  try {
    if (sessionId) {
      await executeRequest('СБИС.Выход', {}, false);
    }
  } catch (error) {
    console.warn('SBIS logout warning:', error);
  } finally {
    sessionId = null;
    await AsyncStorage.removeItem('sbis_session');
  }
};

// ============================
// РАБОТА С КОНТРАГЕНТАМИ
// ============================

/**
 * Поиск контрагента по ИНН
 * 
 * @param {string} inn - ИНН организации
 * @returns {Promise<Object>} Данные контрагента
 */
export const searchContractorByINN = async (inn) => {
  try {
    // Метод для поиска контрагента
    const result = await executeRequest('СБИС.СписокКонтрагентов', {
      Фильтр: {
        ИНН: inn,
      },
    });

    if (result && result.length > 0) {
      const contractor = result[0];
      return {
        success: true,
        data: {
          id: contractor.Идентификатор,
          name: contractor.Название || contractor.НазваниеПолное,
          inn: contractor.ИНН,
          kpp: contractor.КПП,
          ogrn: contractor.ОГРН,
          address: contractor.ЮрАдрес || contractor.Адрес,
          director: contractor.Руководитель,
          phone: contractor.Телефон,
          email: contractor.Email,
          status: contractor.Статус || 'active',
        },
      };
    }

    return { success: false, error: 'Контрагент не найден' };
  } catch (error) {
    console.error('Search contractor error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Получение информации о компании из сервиса "Все о компаниях"
 * 
 * @param {string} inn - ИНН организации
 * @returns {Promise<Object>} Полная информация о компании
 */
export const getCompanyInfo = async (inn) => {
  try {
    const result = await executeRequest('Контрагент.Получить', {
      ИНН: inn,
    });

    return {
      success: true,
      data: {
        name: result.Название,
        fullName: result.НазваниеПолное,
        inn: result.ИНН,
        kpp: result.КПП,
        ogrn: result.ОГРН,
        okpo: result.ОКПО,
        address: result.ЮрАдрес,
        factAddress: result.ФактАдрес,
        director: result.Руководитель,
        phone: result.Телефон,
        email: result.Email,
        website: result.Сайт,
        registrationDate: result.ДатаРегистрации,
        status: result.Статус,
        authorizedCapital: result.УставныйКапитал,
        employeesCount: result.ЧисленностьСотрудников,
      },
    };
  } catch (error) {
    console.error('Get company info error:', error);
    return { success: false, error: error.message };
  }
};

// ============================
// РАБОТА С ДОКУМЕНТАМИ/СЧЕТАМИ
// ============================

/**
 * Создание счета на оплату
 * 
 * @param {Object} invoiceData - Данные счета
 * @returns {Promise<Object>} Созданный счет
 */
export const createInvoice = async (invoiceData) => {
  try {
    const document = {
      Тип: 'СчетНаОплату',
      Дата: new Date().toISOString().split('T')[0],
      Номер: invoiceData.number || `WCB-${Date.now()}`,
      НашаОрганизация: {
        ИНН: invoiceData.sellerINN,
      },
      Контрагент: {
        ИНН: invoiceData.buyerINN,
        КПП: invoiceData.buyerKPP,
        Название: invoiceData.buyerName,
      },
      Сумма: invoiceData.amount,
      СуммаНДС: invoiceData.vat || 0,
      Позиции: invoiceData.items?.map((item, index) => ({
        НомерСтроки: index + 1,
        Наименование: item.name,
        Количество: item.quantity || 1,
        Цена: item.price,
        Сумма: item.total || item.price * (item.quantity || 1),
        ЕдиницаИзмерения: item.unit || 'шт',
      })) || [{
        НомерСтроки: 1,
        Наименование: invoiceData.description || 'Пополнение баланса',
        Количество: 1,
        Цена: invoiceData.amount,
        Сумма: invoiceData.amount,
        ЕдиницаИзмерения: 'шт',
      }],
      Примечание: invoiceData.comment || 'Счет создан через WorldCashBox',
    };

    const result = await executeRequest('СБИС.ЗаписатьДокумент', {
      Документ: document,
    });

    return {
      success: true,
      data: {
        id: result.Идентификатор,
        number: result.Номер,
        date: result.Дата,
        amount: result.Сумма,
        status: result.Состояние || 'created',
      },
    };
  } catch (error) {
    console.error('Create invoice error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Получение списка счетов контрагента
 * 
 * @param {string} contractorINN - ИНН контрагента
 * @param {Object} params - Параметры фильтрации
 * @returns {Promise<Array>} Список счетов
 */
export const getInvoices = async (contractorINN, params = {}) => {
  try {
    const result = await executeRequest('СБИС.СписокДокументов', {
      Фильтр: {
        Тип: 'СчетНаОплату',
        Контрагент: {
          ИНН: contractorINN,
        },
        ДатаС: params.dateFrom,
        ДатаПо: params.dateTo,
      },
      Сортировка: {
        Поле: 'Дата',
        Направление: 'desc',
      },
      Навигация: {
        Количество: params.limit || 50,
        Смещение: params.offset || 0,
      },
    });

    const invoices = (result.Документы || []).map(doc => ({
      id: doc.Идентификатор,
      number: doc.Номер,
      date: doc.Дата,
      amount: parseFloat(doc.Сумма) || 0,
      status: mapDocumentStatus(doc.Состояние),
      description: doc.Примечание || doc.Наименование,
      paid: doc.Состояние === 'Оплачен',
    }));

    return {
      success: true,
      data: invoices,
      total: result.Всего || invoices.length,
    };
  } catch (error) {
    console.error('Get invoices error:', error);
    return { success: false, error: error.message, data: [] };
  }
};

/**
 * Получение одного документа по ID
 * 
 * @param {string} documentId - ID документа
 * @returns {Promise<Object>} Документ
 */
export const getDocument = async (documentId) => {
  try {
    const result = await executeRequest('СБИС.ПрочитатьДокумент', {
      Документ: {
        Идентификатор: documentId,
      },
    });

    return {
      success: true,
      data: {
        id: result.Идентификатор,
        type: result.Тип,
        number: result.Номер,
        date: result.Дата,
        amount: parseFloat(result.Сумма) || 0,
        vat: parseFloat(result.СуммаНДС) || 0,
        status: mapDocumentStatus(result.Состояние),
        contractor: {
          name: result.Контрагент?.Название,
          inn: result.Контрагент?.ИНН,
        },
        items: result.Позиции?.map(item => ({
          name: item.Наименование,
          quantity: item.Количество,
          price: parseFloat(item.Цена) || 0,
          total: parseFloat(item.Сумма) || 0,
        })),
        comment: result.Примечание,
      },
    };
  } catch (error) {
    console.error('Get document error:', error);
    return { success: false, error: error.message };
  }
};

// ============================
// РАБОТА С УСЛУГАМИ/НОМЕНКЛАТУРОЙ
// ============================

/**
 * Получение каталога услуг/номенклатуры
 * 
 * @param {Object} params - Параметры фильтрации
 * @returns {Promise<Array>} Список услуг
 */
export const getServicesCatalog = async (params = {}) => {
  try {
    const result = await executeRequest('СБИС.СписокНоменклатуры', {
      Фильтр: {
        Тип: params.type || 'Услуга',
        Группа: params.category,
      },
      Навигация: {
        Количество: params.limit || 100,
      },
    });

    const services = (result.Номенклатура || []).map(item => ({
      id: item.Идентификатор,
      name: item.Наименование,
      description: item.Описание,
      price: parseFloat(item.Цена) || 0,
      unit: item.ЕдиницаИзмерения,
      category: item.Группа,
      isActive: item.Активен !== false,
    }));

    return {
      success: true,
      data: services,
    };
  } catch (error) {
    console.error('Get services catalog error:', error);
    return { success: false, error: error.message, data: [] };
  }
};

// ============================
// ИСТОРИЯ ПЛАТЕЖЕЙ
// ============================

/**
 * Получение истории платежей
 * 
 * @param {string} contractorINN - ИНН контрагента
 * @param {Object} params - Параметры
 * @returns {Promise<Object>} История платежей
 */
export const getPaymentHistory = async (contractorINN, params = {}) => {
  try {
    const result = await executeRequest('СБИС.СписокДокументов', {
      Фильтр: {
        Типы: ['ПлатежноеПоручение', 'Оплата', 'СчетНаОплату'],
        Контрагент: {
          ИНН: contractorINN,
        },
        ДатаС: params.dateFrom,
        ДатаПо: params.dateTo,
      },
      Сортировка: {
        Поле: 'Дата',
        Направление: 'desc',
      },
      Навигация: {
        Количество: params.limit || 50,
      },
    });

    let totalSpent = 0;
    const payments = (result.Документы || []).map(doc => {
      const amount = parseFloat(doc.Сумма) || 0;
      if (doc.Состояние === 'Оплачен' || doc.Тип === 'Оплата') {
        totalSpent += amount;
      }
      
      return {
        id: doc.Идентификатор,
        date: doc.Дата,
        amount: amount,
        type: mapPaymentType(doc.Тип),
        description: doc.Примечание || doc.Наименование || `Документ ${doc.Номер}`,
        status: mapDocumentStatus(doc.Состояние),
        documentNumber: doc.Номер,
      };
    });

    return {
      success: true,
      data: {
        totalSpent,
        payments,
      },
    };
  } catch (error) {
    console.error('Get payment history error:', error);
    return { success: false, error: error.message, data: { totalSpent: 0, payments: [] } };
  }
};

// ============================
// СИНХРОНИЗАЦИЯ
// ============================

/**
 * Синхронизация данных клиента
 * 
 * @param {string} clientINN - ИНН клиента
 * @returns {Promise<Object>} Результат синхронизации
 */
export const syncClientData = async (clientINN) => {
  try {
    // Получаем данные о компании
    const companyInfo = await getCompanyInfo(clientINN);
    
    // Получаем счета
    const invoices = await getInvoices(clientINN);
    
    // Получаем историю платежей
    const paymentHistory = await getPaymentHistory(clientINN);

    return {
      success: true,
      data: {
        company: companyInfo.data,
        invoices: invoices.data,
        payments: paymentHistory.data,
        syncedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Sync client data error:', error);
    return { success: false, error: error.message };
  }
};

// ============================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================

/**
 * Маппинг статусов документа СБИС -> приложение
 */
const mapDocumentStatus = (sbisStatus) => {
  const statusMap = {
    'Черновик': 'draft',
    'Ожидает подписания': 'pending',
    'Ожидает отправки': 'pending',
    'Отправлен': 'sent',
    'Доставлен': 'delivered',
    'Получен': 'received',
    'Оплачен': 'paid',
    'Частично оплачен': 'partial',
    'Завершен': 'completed',
    'Отменен': 'cancelled',
    'Отклонен': 'rejected',
  };
  return statusMap[sbisStatus] || 'unknown';
};

/**
 * Маппинг типов платежей
 */
const mapPaymentType = (sbisType) => {
  const typeMap = {
    'СчетНаОплату': 'invoice',
    'ПлатежноеПоручение': 'payment',
    'Оплата': 'payment',
    'Возврат': 'refund',
  };
  return typeMap[sbisType] || 'other';
};

/**
 * Проверка подключения к СБИС
 */
export const checkConnection = async () => {
  try {
    await authenticate();
    return { success: true, message: 'Подключение к СБИС активно' };
  } catch (error) {
    return { success: false, message: 'Не удалось подключиться к СБИС: ' + error.message };
  }
};

/**
 * Установка учетных данных СБИС
 */
export const setCredentials = (login, password) => {
  SBIS_CONFIG.login = login;
  SBIS_CONFIG.password = password;
};

export default {
  authenticate,
  logout,
  searchContractorByINN,
  getCompanyInfo,
  createInvoice,
  getInvoices,
  getDocument,
  getServicesCatalog,
  getPaymentHistory,
  syncClientData,
  checkConnection,
  setCredentials,
};

