/**
 * СБИС CRM Router
 * Создание сделок в CRM СБИС через API
 * 
 * Документация: пункт 27 из sbis_api.txt
 * Метод: CRMLead.insertRecord
 * Адрес: https://online.sbis.ru/service/
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { generateInvoicePDF } = require('../utils/invoiceGenerator');
const path = require('path');

// OAuth/Сервисная авторизация для API
const SBIS_OAUTH_URL = 'https://online.sbis.ru/oauth/service/';
const SBIS_SERVICE_URL = 'https://online.sbis.ru/service/';

// API Credentials (сервисная авторизация)
const SBIS_APP_CLIENT_ID = process.env.SBIS_APP_CLIENT_ID || '2651426000822745';
const SBIS_APP_SECRET = process.env.SBIS_APP_SECRET || 'G6TMMMZWMAZ55YIP6EAV3S3D';
const SBIS_SECRET_KEY = process.env.SBIS_SECRET_KEY || '7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg';

// Получение OAuth токена для сервисной авторизации
async function getOAuthToken() {
  try {
    const response = await axios.post(SBIS_OAUTH_URL, {
      app_client_id: SBIS_APP_CLIENT_ID,
      app_secret: SBIS_APP_SECRET,
      secret_key: SBIS_SECRET_KEY
    }, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      timeout: 30000
    });
    
    return response.data?.token || null;
  } catch (error) {
    console.error('[CRM API] Ошибка получения OAuth токена:', error.message);
    return null;
  }
}

/**
 * Генерация PDF-счета на оплату
 * @param {Object} invoiceData - Данные счета
 * @param {Object} sellerData - Данные продавца (нашей организации)
 * @param {Object} buyerData - Данные покупателя (клиента)
 * @param {string} dealName - Название сделки (опционально)
 * @returns {Promise<Object>} Результат генерации счета
 */
async function createInvoice(invoiceData, sellerData, buyerData, dealName = null) {
  try {
    console.log('[CRM API] Генерация PDF-счета для клиента...');
    console.log('[CRM API] Данные счета:', JSON.stringify(invoiceData, null, 2));
    
    // Форматируем дату
    const currentDate = new Date();
    const day = String(currentDate.getDate()).padStart(2, '0');
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const year = currentDate.getFullYear();
    const dateStr = `${day}.${month}.${year}`;
    
    // Генерируем номер счета (без префикса WCB)
    const invoiceNumber = invoiceData.number || `${Date.now()}`;
    
    // Формируем позиции счета
    const items = invoiceData.items || [
      {
        name: invoiceData.description || invoiceData.serviceName || 'Услуга',
        quantity: invoiceData.count || 1,
        price: invoiceData.price || invoiceData.amount,
        unit: 'шт'
      }
    ];
    
    // Вычисляем общую сумму НДС, если не указана
    let totalVAT = invoiceData.totalVAT || 0;
    if (!totalVAT && invoiceData.vat) {
      const vatRate = parseFloat(invoiceData.vat);
      if (!isNaN(vatRate) && vatRate > 0) {
        totalVAT = (invoiceData.amount * vatRate) / (100 + vatRate);
      }
    }
    
    // Подготавливаем данные для генерации PDF
    const pdfData = {
      invoiceNumber: invoiceNumber,
      invoiceDate: dateStr,
      sellerName: sellerData.name || process.env.SBIS_SELLER_NAME || 'Наша организация',
      sellerINN: sellerData.inn || process.env.SBIS_SELLER_INN || '2543082240',
      sellerKPP: sellerData.kpp || process.env.SBIS_SELLER_KPP || '',
      sellerAddress: sellerData.address || process.env.SBIS_SELLER_ADDRESS || '',
      sellerPhone: sellerData.phone || process.env.SBIS_SELLER_PHONE || '',
      sellerEmail: sellerData.email || process.env.SBIS_SELLER_EMAIL || '',
      sellerWebsite: sellerData.website || process.env.SBIS_SELLER_WEBSITE || '',
      sellerBankName: sellerData.bankName || process.env.SBIS_SELLER_BANK_NAME || '',
      sellerBIK: sellerData.bik || process.env.SBIS_SELLER_BIK || '',
      sellerAccount: sellerData.account || process.env.SBIS_SELLER_ACCOUNT || '',
      sellerCorrAccount: sellerData.corrAccount || process.env.SBIS_SELLER_CORR_ACCOUNT || '',
      buyerName: buyerData.name || invoiceData.buyerName || '',
      buyerINN: buyerData.inn || invoiceData.buyerINN || '',
      buyerKPP: buyerData.kpp || invoiceData.buyerKPP || '',
      buyerAddress: buyerData.address || '',
      buyerPhone: buyerData.phone || '',
      items: items,
      totalAmount: invoiceData.amount,
      totalVAT: totalVAT,
      dealName: dealName || invoiceData.serviceName || '',
      notes: invoiceData.comment || `Счет на оплату услуги "${invoiceData.serviceName || 'Услуга'}". Счет создан автоматически при подаче заявки.`
    };
    
    // Генерируем PDF
    const pdfResult = await generateInvoicePDF(pdfData);
    
    if (!pdfResult.success) {
      throw new Error('Не удалось сгенерировать PDF-счет');
    }
    
    console.log('[CRM API] ✅ PDF-счет успешно создан');
    console.log('[CRM API] Номер счета:', invoiceNumber);
    console.log('[CRM API] Файл:', pdfResult.fileName);
    
    // Формируем URL для скачивания счета
    // Используем прямой путь к статическому файлу (через /uploads/invoices/)
    // Это проще для мобильного приложения, так как не требует авторизации для статических файлов
    const invoiceUrl = `/uploads/invoices/${pdfResult.fileName}`;
    
    console.log('[CRM API] URL для скачивания счета:', invoiceUrl);
    console.log('[CRM API] Полный путь к файлу:', pdfResult.filePath);
    
    return {
      success: true,
      data: {
        id: pdfResult.invoiceNumber,
        number: invoiceNumber,
        date: dateStr,
        amount: invoiceData.amount,
        status: 'created',
        filePath: pdfResult.filePath,
        fileName: pdfResult.fileName,
        url: invoiceUrl, // URL для скачивания PDF-счета
        message: `Счет №${invoiceNumber} на сумму ${invoiceData.amount} ₽ создан. Ожидается оплата.`
      }
    };
  } catch (error) {
    console.error('[CRM API] ❌ Ошибка при генерации PDF-счета:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Маппинг услуг к регламентам (темам отношений)
// Если услуга содержит ключевые слова, используется соответствующий регламент
// Порядок важен - более специфичные ключевые слова должны быть выше
const SERVICE_TO_THEME_MAPPING = [
  // Замена ФН/ОФД (самый специфичный)
  { keywords: ['замена фн', 'замена офд', 'фискальный накопитель', 'продлить фн', 'продлить фискальный накопитель', 'фн'], theme: 'Замена ФН/ОФД' },
  
  // Продление ЭЦП
  { keywords: ['продление эцп', 'эцп', 'электронная подпись', 'электронно-цифровая подпись'], theme: 'Продление ЭЦП' },
  
  // Продление лицензий
  { keywords: ['продление лицензий', 'лицензия', 'лицензии'], theme: 'Продление лицензий' },
  
  // Кассовое оборудование
  { keywords: ['кассовое оборудование', 'касса', 'ккт', 'контрольно-кассовая техника', 'кассовый аппарат'], theme: 'Кассовое оборудование' },
  
  // Техническое сопровождение
  { keywords: ['техническая поддержка', 'техподдержка', 'техническое сопровождение'], theme: 'Техническое сопровождение' },
  { keywords: ['поддержка', 'поддержка 1с', 'поддержка касс'], theme: 'Техническое сопровождение' },
  { keywords: ['обслуживание', 'техобслуживание'], theme: 'Техническое сопровождение' },
  { keywords: ['настройка', 'настройка 1с', 'настройка касс'], theme: 'Техническое сопровождение' },
  { keywords: ['установка', 'установка 1с', 'установка касс'], theme: 'Техническое сопровождение' },
  { keywords: ['монтаж', 'монтаж касс'], theme: 'Техническое сопровождение' },
  { keywords: ['обновление', 'обновление 1с'], theme: 'Техническое сопровождение' },
  { keywords: ['диагностика'], theme: 'Техническое сопровождение' },
  
  // Отчетность и бухгалтерия
  { keywords: ['отчетность и бухгалтерия', 'отчетность', 'бухгалтерия'], theme: 'Отчетность и бухгалтерия' },
  { keywords: ['бухгалтер', 'бухгалтерские услуги', 'бухгалтерское сопровождение'], theme: 'Отчетность и бухгалтерия' },
  { keywords: ['налог', 'налоговая', 'декларация'], theme: 'Отчетность и бухгалтерия' },
  
  // Документооборот и EDI
  { keywords: ['документооборот', 'edi', 'эдо', 'электронный документооборот'], theme: 'Документооборот и EDI' },
  
  // CRM и Телефония
  { keywords: ['crm', 'телефония', 'телефон', 'ip-телефония'], theme: 'CRM и Телефония' },
  
  // Управление персоналом
  { keywords: ['управление персоналом', 'персонал', 'кадры', 'hr'], theme: 'Управление персоналом' },
  
  // Эквайринг
  { keywords: ['эквайринг', 'эквайринговая', 'прием платежей'], theme: 'Эквайринг' },
  
  // Маркировка
  { keywords: ['маркировка', 'маркировка товаров', 'честный знак'], theme: 'Маркировка' },
  
  // Автоматизация
  { keywords: ['автоматизация', 'автоматизация бизнеса'], theme: 'Автоматизация' },
  
  // Сайт
  { keywords: ['сайт', 'веб-сайт', 'разработка сайта', 'создание сайта'], theme: 'Сайт' },
  
  // РКО
  { keywords: ['рко', 'расчетно-кассовое обслуживание', 'расчетный счет'], theme: 'РКО' },
  
  // Видеонаблюдение
  { keywords: ['видеонаблюдение', 'камеры', 'система видеонаблюдения'], theme: 'Видеонаблюдение' },
  
  // Расходники
  { keywords: ['расходники', 'материалы', 'запчасти'], theme: 'Расходники' },
  
  // Остальное оборудование
  { keywords: ['оборудование', 'остальное оборудование'], theme: 'Остальное оборудование' },
  
  // ОСАГО
  { keywords: ['осаго', 'страхование', 'автострахование'], theme: 'ОСАГО' },
  
  // Регистрация в ЛК
  { keywords: ['регистрация в лк', 'личный кабинет', 'регистрация'], theme: 'Регистрация в ЛК' },
  
  // Продажи (по умолчанию)
  { keywords: ['default'], theme: 'Продажи' }
];

// Определение регламента по названию услуги
function determineThemeByServiceName(serviceName) {
  if (!serviceName) {
    const defaultMapping = SERVICE_TO_THEME_MAPPING.find(m => m.keywords.includes('default'));
    return defaultMapping ? defaultMapping.theme : 'Продажи';
  }
  
  const serviceNameLower = serviceName.toLowerCase();
  
  // Проверяем маппинг (порядок важен - первое совпадение используется)
  for (const mapping of SERVICE_TO_THEME_MAPPING) {
    if (mapping.keywords.includes('default')) {
      continue; // Пропускаем дефолтный
    }
    
    // Проверяем все ключевые слова в маппинге
    for (const keyword of mapping.keywords) {
      if (serviceNameLower.includes(keyword.toLowerCase())) {
        console.log(`[CRM API] Найден регламент "${mapping.theme}" для услуги "${serviceName}" по ключевому слову "${keyword}"`);
        return mapping.theme;
      }
    }
  }
  
  // Если не найдено, используем дефолтный
  const defaultMapping = SERVICE_TO_THEME_MAPPING.find(m => m.keywords.includes('default'));
  const defaultTheme = defaultMapping ? defaultMapping.theme : 'Продажи';
  console.log(`[CRM API] Используется дефолтный регламент "${defaultTheme}" для услуги "${serviceName}"`);
  return defaultTheme;
}

// Получение темы отношений (регламента) по имени
async function getCRMThemeByName(themeName, oauthToken) {
  try {
    console.log('[CRM API] Запрос темы отношений:', themeName);
    const payload = {
      jsonrpc: '2.0',
      method: 'CRMLead.getCRMThemeByName',
      params: {
        НаименованиеТемы: themeName
      },
      protocol: 2,
      id: 0
    };
    
    const response = await axios.post(SBIS_SERVICE_URL, payload, {
      headers: {
        'Host': 'online.sbis.ru',
        'Content-Type': 'application/json-rpc; charset=utf-8',
        'Accept': 'application/json-rpc',
        'X-SBISAccessToken': oauthToken
      },
      timeout: 30000,
      validateStatus: () => true
    });
    
    console.log('[CRM API] Ответ на запрос темы отношений:', response.status);
    console.log('[CRM API] Данные ответа:', JSON.stringify(response.data, null, 2));
    
    if (response.data?.error) {
      console.error('[CRM API] Ошибка в ответе:', response.data.error);
      return null;
    }
    
    if (response.data?.result?.d) {
      const reglament = response.data.result.d.Регламент;
      console.log('[CRM API] ✅ Регламент получен:', reglament);
      return reglament;
    }
    
    console.log('[CRM API] ❌ Регламент не найден в ответе');
    return null;
  } catch (error) {
    console.error('[CRM API] ❌ Ошибка получения темы отношений:', error.message);
    if (error.response) {
      console.error('[CRM API] Response status:', error.response.status);
      console.error('[CRM API] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

/**
 * POST /api/sbis-crm/create-lead
 * Создание сделки в CRM СБИС
 * 
 * Body:
 * {
 *   "serviceName": "Название услуги",
 *   "serviceCode": "Код услуги",
 *   "price": 1000.0,
 *   "count": 1,
 *   "notes": "Примечание",
 *   "themeName": "Продажи" // опционально, по умолчанию "Продажи"
 * }
 */
router.post('/create-lead', authenticateToken, async (req, res) => {
  console.log('========================================');
  console.log('[CRM API] === СОЗДАНИЕ СДЕЛКИ В CRM СБИС ===');
  console.log('[CRM API] Реализация строго по документации: пункт 27');
  console.log('========================================');
  
  try {
    console.log('[CRM API] Получен запрос:', JSON.stringify(req.body));
    // Поддерживаем оба варианта имен полей (camelCase и snake_case)
    const serviceName = req.body.serviceName || req.body.service_name;
    const serviceCode = req.body.serviceCode || req.body.service_code;
    const price = req.body.price;
    const count = req.body.count;
    const notes = req.body.notes;
    const themeName = req.body.themeName || req.body.theme_name;
    const userId = req.user.id;
    console.log('[CRM API] User ID:', userId);
    console.log('[CRM API] Распарсенные данные:', { serviceName, serviceCode, price, count, notes, themeName });
    
    // Валидация обязательных полей
    if (!serviceName || !serviceCode || price === undefined || count === undefined) {
      console.log('[CRM API] ❌ Валидация не пройдена');
      console.log('[CRM API] Отсутствующие поля:', {
        serviceName: !serviceName,
        serviceCode: !serviceCode,
        price: price === undefined,
        count: count === undefined
      });
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать: serviceName (или service_name), serviceCode (или service_code), price, count'
      });
    }
    console.log('[CRM API] ✅ Валидация пройдена');
    
    // Получаем данные клиента из БД
    console.log('[CRM API] Получение данных клиента из БД...');
    const { dbQuery } = require('../database/init');
    const clientResult = await dbQuery(
      'SELECT inn, kpp, name, email, phone FROM clients WHERE id = $1',
      [userId]
    );
    
    if (clientResult.rows.length === 0) {
      console.log('[CRM API] ❌ Клиент не найден в БД');
      return res.status(404).json({
        success: false,
        error: 'Клиент не найден'
      });
    }
    
    const client = clientResult.rows[0];
    console.log('[CRM API] ✅ Клиент найден:', client.name, 'ИНН:', client.inn);
    
    // Получаем OAuth токен
    console.log('[CRM API] Получение OAuth токена...');
    const oauthToken = await getOAuthToken();
    if (!oauthToken) {
      console.log('[CRM API] ❌ Не удалось получить OAuth токен');
      return res.status(500).json({
        success: false,
        error: 'Не удалось получить токен авторизации СБИС'
      });
    }
    console.log('[CRM API] ✅ OAuth токен получен');
    
    // Определяем тему отношений (регламент) по названию услуги или переданному значению
    console.log('[CRM API] Определение темы отношений...');
    let theme = themeName;
    
    // Если тема не передана, определяем по названию услуги
    if (!theme) {
      theme = determineThemeByServiceName(serviceName);
    }
    
    console.log('[CRM API] Выбранная тема отношений:', theme);
    const reglament = await getCRMThemeByName(theme, oauthToken);
    
    if (!reglament) {
      console.log('[CRM API] ❌ Не удалось найти тему отношений');
      return res.status(500).json({
        success: false,
        error: `Не удалось найти тему отношений "${theme}" в CRM СБИС`
      });
    }
    
    console.log('[CRM API] ✅ Регламент (тема отношений):', reglament);
    
    // Формируем параметры для создания сделки
    // Пункт 27: Структура запроса согласно документации - ВСЕ ПОЛЯ
    const clientData = {};
    const clientSchema = {};
    
    // Заполняем данные клиента (все доступные поля)
    if (client.inn) {
      clientData.ИНН = client.inn;
      clientSchema.ИНН = 'Строка';
    }
    if (client.kpp) {
      clientData.КПП = client.kpp;
      clientSchema.КПП = 'Строка';
    }
    if (client.name) {
      clientData.Наименование = client.name;
      clientSchema.Наименование = 'Строка';
    }
    clientData.Type = [0]; // 0 - юридическое лицо
    clientSchema.Type = { 'Массив': 'Число целое' };
    
    // Формируем данные контактного лица (если есть email или phone)
    // КонтактноеЛицо не обязателен, если указан Клиент, но добавляем для полноты данных
    const contactPersonData = {};
    const contactPersonSchema = {};
    let hasContactPerson = false;
    
    // ФИО обязательно для КонтактноеЛицо (если добавляем)
    // Телефон или email обязательны (хотя бы один)
    if ((client.phone || client.email) && client.name) {
      contactPersonData.ФИО = client.name; // Используем название компании как ФИО контактного лица
      contactPersonSchema.ФИО = 'Строка';
      
      if (client.phone) {
        contactPersonData.Телефон = client.phone;
        contactPersonSchema.Телефон = 'Строка';
      }
      if (client.email) {
        contactPersonData.email = client.email;
        contactPersonSchema.email = 'Строка';
      }
      
      hasContactPerson = true;
    }
    
    // Формируем примечание с названием услуги
    let finalNotes = `Услуга: ${serviceName}\n`;
    if (price && count) {
      finalNotes += `Цена: ${price} ₽\n`;
      finalNotes += `Количество: ${count}\n`;
    }
    if (notes && notes.trim() !== '') {
      finalNotes += `\nПримечание: ${notes}`;
    }
    // Добавляем комментарий о том, что сделка создана с мобильного приложения
    finalNotes += `\n\nСделка создана с мобильного приложения`;
    
    // Вычисляем общую сумму
    const totalAmount = price * count;
    
    // Формируем Nomenclatures (список товаров/услуг) - ВАЖНО для заполнения суммы
    // Используем serviceCode если есть, иначе генерируем временный код
    const nomenclatureCode = serviceCode || `SERVICE_${Date.now()}`;
    const nomenclatures = [{
      code: nomenclatureCode,
      price: parseFloat(price),
      count: parseInt(count)
    }];
    
    // Формируем UserConds (условия для правил регистрации)
    const userConds = {
      "Сумма в корзине": String(totalAmount),
      "Номер формы, с которой пришли": "mobile_app"
    };
    
    // Формируем AdditionalFields для передачи суммы напрямую
    // Согласно документации: массив объектов с "Название" и "Значение"
    // Поле "Счет" может заполняться через дополнительные поля
    // Пробуем разные варианты названий поля "Счет"
    const additionalFields = [
      {
        "Название": "Счет",
        "Значение": String(totalAmount)
      },
      {
        "Название": "Сумма",
        "Значение": String(totalAmount)
      },
      {
        "Название": "СуммаБезНДС",
        "Значение": String(totalAmount)
      },
      {
        "Название": "Сумма сделки",
        "Значение": String(totalAmount)
      },
      {
        "Название": "СуммаСчета",
        "Значение": String(totalAmount)
      }
    ];
    
    // Формируем полную структуру сделки со ВСЕМИ полями из документации
    // Поля "Счет" и "Сумма" не поддерживаются напрямую в структуре сделки (вызывают ошибку)
    // Используем только поддерживаемые поля: Nomenclatures, UserConds, AdditionalFields
    const leadData = {
      Регламент: reglament,
      Клиент: {
        d: clientData,
        s: clientSchema
      },
      Примечание: finalNotes.trim(),
      Nomenclatures: nomenclatures,  // ВАЖНО: для заполнения суммы (если код существует в каталоге)
      UserConds: userConds,
      AdditionalFields: additionalFields  // Дополнительные поля для передачи суммы
    };
    
    const leadSchema = {
      Регламент: 'Число целое',
      Клиент: 'Запись',
      Примечание: 'Строка',
      Nomenclatures: 'JSON-объект',
      UserConds: 'JSON-объект',
      AdditionalFields: 'JSON-объект'
    };
    
    // Добавляем КонтактноеЛицо, если есть данные
    if (hasContactPerson) {
      leadData.КонтактноеЛицо = {
        d: contactPersonData,
        s: contactPersonSchema
      };
      leadSchema.КонтактноеЛицо = 'Запись';
    }
    
    const params = {
      Лид: {
        d: leadData,
        s: leadSchema
      }
    };
    
    console.log('[CRM API] Сумма сделки:', totalAmount, '₽');
    console.log('[CRM API] Nomenclatures:', JSON.stringify(nomenclatures, null, 2));
    
    console.log('[CRM API] Параметры запроса сформированы');
    console.log('[CRM API] Структура params:', JSON.stringify(params, null, 2));
    
    // Вызываем метод CRMLead.insertRecord
    const payload = {
      jsonrpc: '2.0',
      method: 'CRMLead.insertRecord',
      params: params,
      protocol: 2,
      id: 0
    };
    
    console.log('[CRM API] Отправка запроса на создание сделки...');
    console.log('[CRM API] Payload:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post(SBIS_SERVICE_URL, payload, {
      headers: {
        'Host': 'online.sbis.ru',
        'Content-Type': 'application/json-rpc; charset=utf-8',
        'Accept': 'application/json-rpc',
        'X-SBISAccessToken': oauthToken
      },
      timeout: 30000,
      validateStatus: () => true // Принимаем все статусы для детальной обработки
    });
    
    console.log('[CRM API] Response status:', response.status);
    console.log('[CRM API] Response data:', JSON.stringify(response.data, null, 2));
    
    // Проверяем на ошибки в ответе
    if (response.data?.error) {
      const error = response.data.error;
      console.error('[CRM API] ❌ Ошибка СБИС:', error);
      
      return res.status(400).json({
        success: false,
        error: error.message || 'Ошибка при создании заявки в CRM СБИС',
        details: error.data || error
      });
    }
    
    if (response.data?.result) {
      const result = response.data.result;
      
      // Проверяем наличие ошибки
      if (result.d?.Состояние && result.d.Состояние !== '') {
        return res.status(500).json({
          success: false,
          error: result.d.Состояние,
          details: result.d
        });
      }
      
      // Успешное создание сделки
      console.log('[CRM API] ✅ Заявка успешно создана');
      console.log('[CRM API] ID заявки:', result.d?.['@Документ']);
      
      // Генерируем PDF-счет на оплату автоматически
      let invoiceResult = null;
      if (client.inn && price > 0) {
        console.log('[CRM API] Генерация PDF-счета на оплату...');
        const invoiceData = {
          amount: price * count,
          price: price,
          count: count,
          serviceName: serviceName,
          description: serviceName,
          items: [{
            name: serviceName,
            quantity: count,
            price: price,
            unit: 'шт'
          }],
          comment: `Счет на оплату услуги "${serviceName}". Количество: ${count}, Цена: ${price} ₽`
        };
        
        // Данные продавца (нашей организации) - можно брать из переменных окружения или БД
        const sellerData = {
          name: process.env.SBIS_SELLER_NAME || 'Наша организация',
          inn: process.env.SBIS_SELLER_INN || '2543082240',
          kpp: process.env.SBIS_SELLER_KPP || '',
          address: process.env.SBIS_SELLER_ADDRESS || '',
          phone: process.env.SBIS_SELLER_PHONE || '',
          email: process.env.SBIS_SELLER_EMAIL || '',
          website: process.env.SBIS_SELLER_WEBSITE || '',
          bankName: process.env.SBIS_SELLER_BANK_NAME || '',
          bik: process.env.SBIS_SELLER_BIK || '',
          account: process.env.SBIS_SELLER_ACCOUNT || '',
          corrAccount: process.env.SBIS_SELLER_CORR_ACCOUNT || ''
        };
        
        // Данные покупателя (клиента)
        const buyerData = {
          name: client.name,
          inn: client.inn,
          kpp: client.kpp || null,
          address: client.address || '',
          phone: client.phone || ''
        };
        
        // Название сделки
        const dealName = serviceName;
        
        invoiceResult = await createInvoice(invoiceData, sellerData, buyerData, dealName);
        
        if (invoiceResult.success) {
          console.log('[CRM API] ✅ Счет успешно создан:', invoiceResult.data.number);
          console.log('[CRM API] URL счета:', invoiceResult.data.url);
          console.log('[CRM API] Имя файла:', invoiceResult.data.fileName);
        } else {
          console.log('[CRM API] ⚠️ Не удалось создать счет:', invoiceResult.error);
          // Не прерываем выполнение, если счет не создался - заявка уже создана
        }
      } else {
        console.log('[CRM API] ⚠️ Пропуск создания счета: отсутствует ИНН клиента или цена равна 0');
      }
      
      // Сохраняем заявку в БД
      try {
        const { dbQuery } = require('../database/init');
        console.log('[CRM API] 💾 Сохранение заявки в БД для клиента:', req.user.id);
        console.log('[CRM API] Данные заявки:', {
          serviceName,
          serviceCode,
          price,
          count,
          totalAmount: price * count,
          notes: notes || null,
          documentId: result.d?.['@Документ'] || null,
          documentUUID: result.d?.ИдентификаторДокумента || null,
          invoiceNumber: invoiceResult?.success ? invoiceResult.data.number : null,
          invoiceUrl: invoiceResult?.success ? invoiceResult.data.url : null,
          invoiceFileName: invoiceResult?.success ? invoiceResult.data.fileName : null
        });
        
        const insertResult = await dbQuery(
          `INSERT INTO service_requests 
           (client_id, service_name, service_code, price, quantity, total_amount, notes, status, 
            sbis_document_id, sbis_document_uuid, invoice_number, invoice_url, invoice_file_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12)`,
          [
            req.user.id,
            serviceName,
            serviceCode || null,
            price,
            count,
            price * count,
            notes || null,
            result.d?.['@Документ'] || null,
            result.d?.ИдентификаторДокумента || null,
            invoiceResult?.success ? invoiceResult.data.number : null,
            invoiceResult?.success ? invoiceResult.data.url : null,
            invoiceResult?.success ? invoiceResult.data.fileName : null
          ]
        );
        
        // Для MySQL получаем ID через SELECT, для PostgreSQL через RETURNING
        let serviceRequestId;
        if (insertResult.rows && insertResult.rows.length > 0 && insertResult.rows[0].id) {
          serviceRequestId = insertResult.rows[0].id;
        } else {
          // Для MySQL получаем последний вставленный ID
          const lastIdResult = await dbQuery('SELECT LAST_INSERT_ID() as id');
          serviceRequestId = lastIdResult.rows[0]?.id;
        }
        
        // Если услуга существует в каталоге (по service_code), создаем запись в client_services
        // чтобы она отображалась в "Мои услуги"
        if (serviceCode) {
          try {
            // Ищем услугу по коду
            const serviceResult = await dbQuery(
              'SELECT id FROM services WHERE code = $1 OR id = $2',
              [serviceCode, parseInt(serviceCode) || 0]
            );
            
            if (serviceResult.rows.length > 0) {
              const serviceId = serviceResult.rows[0].id;
              
              // Проверяем, не подключена ли уже услуга
              const existingServiceResult = await dbQuery(
                'SELECT id FROM client_services WHERE client_id = $1 AND service_id = $2 AND is_active = true',
                [req.user.id, serviceId]
              );
              
              if (existingServiceResult.rows.length === 0) {
                // Вычисляем даты в зависимости от периода (если услуга имеет период)
                const serviceInfoResult = await dbQuery(
                  'SELECT billing_period FROM services WHERE id = $1',
                  [serviceId]
                );
                
                const billingPeriod = serviceInfoResult.rows[0]?.billing_period || 'one_time';
                const startDate = new Date();
                let endDate = null;
                
                if (billingPeriod === 'monthly') {
                  endDate = new Date(startDate);
                  endDate.setMonth(endDate.getMonth() + 1);
                } else if (billingPeriod === 'yearly') {
                  endDate = new Date(startDate);
                  endDate.setFullYear(endDate.getFullYear() + 1);
                }
                // Для 'one_time' endDate остается null
                
                // Создаем запись в client_services
                // Используем проверку существования вместо ON CONFLICT для совместимости с MySQL
                const insertServiceResult = await dbQuery(
                  `INSERT INTO client_services (client_id, service_id, start_date, end_date, is_active)
                   SELECT $1, $2, $3, $4, true
                   WHERE NOT EXISTS (
                     SELECT 1 FROM client_services 
                     WHERE client_id = $1 AND service_id = $2 AND is_active = true
                   )`,
                  [
                    req.user.id,
                    serviceId,
                    startDate.toISOString().split('T')[0],
                    endDate ? endDate.toISOString().split('T')[0] : null
                  ]
                );
                
                console.log('[CRM API] ✅ Создана запись в client_services для услуги:', serviceId);
              } else {
                console.log('[CRM API] ℹ️ Услуга уже подключена в client_services');
              }
            } else {
              console.log('[CRM API] ⚠️ Услуга с кодом не найдена в каталоге:', serviceCode);
            }
          } catch (serviceError) {
            console.error('[CRM API] Ошибка создания записи в client_services:', serviceError);
            // Не прерываем выполнение, заявка уже создана
          }
        }
        
        console.log('[CRM API] ✅ Заявка сохранена в БД с ID:', serviceRequestId);
      } catch (dbError) {
        console.error('[CRM API] ⚠️ Ошибка сохранения заявки в БД:', dbError);
        console.error('[CRM API] Stack:', dbError.stack);
        // Не прерываем выполнение, если не удалось сохранить в БД
      }
      
      // Логируем информацию о счете для отладки
      if (invoiceResult?.success) {
        console.log('[CRM API] 📄 Информация о счете для клиента:');
        console.log('[CRM API]   Номер счета:', invoiceResult.data.number);
        console.log('[CRM API]   URL для скачивания:', invoiceResult.data.url);
        console.log('[CRM API]   Имя файла:', invoiceResult.data.fileName);
        console.log('[CRM API]   Сумма:', invoiceResult.data.amount, '₽');
      }
      
      return res.json({
        success: true,
        data: {
          documentId: result.d?.['@Документ'],
          documentUUID: result.d?.ИдентификаторДокумента,
          reglament: result.d?.Регламент,
          client: result.d?.Клиент,
          contactPerson: result.d?.КонтактноеЛицо,
          notes: result.d?.Примечание,
          source: result.d?.Источник,
          invoice: invoiceResult?.success ? invoiceResult.data : null,
          invoiceError: invoiceResult?.success === false ? invoiceResult.error : null
        },
        message: invoiceResult?.success 
          ? `Заявка успешно отправлена. Счет №${invoiceResult.data.number} на сумму ${invoiceResult.data.amount} ₽ создан. Скачайте счет по ссылке: ${invoiceResult.data.url}`
          : 'Заявка успешно отправлена' + (invoiceResult?.error ? `. Внимание: не удалось создать счет: ${invoiceResult.error}` : '')
      });
    } else {
      // Если нет result, но и нет error в корне, проверяем статус ответа
      if (response.status !== 200) {
        return res.status(response.status).json({
          success: false,
          error: `Ошибка HTTP ${response.status}: ${response.statusText}`,
          details: response.data
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Неожиданный формат ответа от СБИС',
        details: response.data
      });
    }
  } catch (error) {
    console.error('[CRM API] ❌ Ошибка при создании сделки:', error);
    console.error('[CRM API] Stack:', error.stack);
    
    if (error.response) {
      console.error('[CRM API] Response status:', error.response.status);
      console.error('[CRM API] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Превышено время ожидания ответа от СБИС. Попробуйте позже.'
      });
    }
    
    // Если есть ответ от сервера с ошибкой
    if (error.response?.data) {
      const errorData = error.response.data;
      return res.status(error.response.status || 500).json({
        success: false,
        error: errorData.error?.message || errorData.message || 'Ошибка при создании заявки в CRM СБИС',
        details: errorData.error || errorData
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Ошибка при создании заявки в CRM СБИС',
      details: error.message
    });
  }
});

/**
 * GET /api/sbis-crm/themes
 * Получение списка доступных регламентов (тем отношений) в CRM СБИС
 * 
 * Query параметры:
 * - search: поиск по названию (опционально)
 */
router.get('/themes', authenticateToken, async (req, res) => {
  console.log('[CRM API] === ПОЛУЧЕНИЕ СПИСКА РЕГЛАМЕНТОВ ===');
  
  try {
    const { search } = req.query;
    
    // Получаем OAuth токен
    const oauthToken = await getOAuthToken();
    if (!oauthToken) {
      return res.status(500).json({
        success: false,
        error: 'Не удалось получить токен авторизации СБИС'
      });
    }
    
    // Попробуем получить список регламентов
    // СБИС может не иметь метода для получения списка, поэтому пробуем известные названия
    const knownThemes = [
      'Отчетность и бухгалтерия',
      'Документооборот и EDI',
      'CRM и Телефония',
      'Управление персоналом',
      'Все о компаниях и владельцах',
      'Поиск и анализ закупок',
      'Кассовое оборудование',
      'Маркировка',
      'Замена ФН/ОФД',
      'Продление ЭЦП',
      'Техническое сопровождение',
      'Эквайринг',
      'Автоматизация',
      'Сайт',
      'Действующий партнер',
      'Новый партнер',
      'Продление лицензий',
      'ОСАГО',
      'Расходники',
      'Видеонаблюдение',
      'Остальное оборудование',
      'Обзвон по HoReCa',
      'РКО',
      'Диагностика',
      'Регистрация в ЛК',
      'Бухгалтерское сопровождение',
      'Пиот',
      'Продажи' // По умолчанию
    ];
    
    const themes = [];
    
    for (const themeName of knownThemes) {
      // Если указан поиск, проверяем совпадение
      if (search && !themeName.toLowerCase().includes(search.toLowerCase())) {
        continue;
      }
      
      try {
        const reglament = await getCRMThemeByName(themeName, oauthToken);
        if (reglament) {
          themes.push({
            name: themeName,
            reglament: reglament
          });
        }
      } catch (error) {
        // Игнорируем ошибки для несуществующих тем
        console.log(`[CRM API] Тема "${themeName}" не найдена`);
      }
    }
    
    console.log(`[CRM API] ✅ Найдено ${themes.length} регламентов`);
    
    return res.json({
      success: true,
      data: themes,
      count: themes.length
    });
  } catch (error) {
    console.error('[CRM API] Ошибка получения списка регламентов:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка при получении списка регламентов',
      details: error.message
    });
  }
});

/**
 * GET /api/sbis-crm/invoice/:fileName
 * Скачивание PDF-счета
 */
router.get('/invoice/:fileName', authenticateToken, async (req, res) => {
  try {
    const { fileName } = req.params;
    const { INVOICES_DIR } = require('../utils/invoiceGenerator');
    const fs = require('fs').promises;
    
    console.log('[CRM API] Запрос на скачивание счета:', fileName);
    
    // Проверяем, что файл существует
    const filePath = path.join(INVOICES_DIR, fileName);
    console.log('[CRM API] Путь к файлу:', filePath);
    
    try {
      await fs.access(filePath);
      console.log('[CRM API] ✅ Файл найден');
    } catch (error) {
      console.error('[CRM API] ❌ Файл не найден:', filePath);
      return res.status(404).json({
        success: false,
        error: 'Счет не найден',
        fileName: fileName,
        filePath: filePath
      });
    }
    
    // Отправляем файл
    console.log('[CRM API] Отправка файла:', fileName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${fileName}"`); // inline вместо attachment для просмотра в браузере
    res.sendFile(path.resolve(filePath), (err) => {
      if (err) {
        console.error('[CRM API] Ошибка отправки файла:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Ошибка при отправке файла',
            details: err.message
          });
        }
      } else {
        console.log('[CRM API] ✅ Файл успешно отправлен');
      }
    });
  } catch (error) {
    console.error('[CRM API] Ошибка скачивания счета:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: 'Ошибка при скачивании счета',
        details: error.message
      });
    }
  }
});

/**
 * POST /api/sbis-crm/sync-requests
 * Синхронизация существующих заявок из CRM СБИС в БД
 */
router.post('/sync-requests', authenticateToken, async (req, res) => {
  try {
    const { dbQuery } = require('../database/init');
    const { pool } = require('../database/init');
    
    // Получаем данные клиента
    const clientResult = await dbQuery(
      'SELECT id, inn, name FROM clients WHERE id = ?',
      [req.user.id]
    );
    
    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Клиент не найден'
      });
    }
    
    const client = clientResult.rows[0];
    
    // Получаем OAuth токен
    const oauthToken = await getOAuthToken();
    if (!oauthToken) {
      return res.status(500).json({
        success: false,
        error: 'Не удалось получить OAuth токен'
      });
    }
    
    // Получаем список сделок из CRM СБИС
    // Используем метод CRMLead.getList для получения сделок клиента
    try {
      // Пробуем разные варианты запроса (как в sbisProxy.js)
      const requestMethods = [
        {
          url: SBIS_SERVICE_URL,
          method: 'CRMLead.getList',
          params: {
            Фильтр: {
              Контрагент: { ИНН: client.inn }
            },
            Навигация: {
              Страница: 0,
              РазмерСтраницы: 100
            }
          },
          headers: {
            'Content-Type': 'application/json-rpc; charset=utf-8',
            'X-SBISAccessToken': oauthToken
          }
        },
        {
          url: SBIS_SERVICE_URL + '?srv=1',
          method: 'CRMLead.getList',
          params: {
            Фильтр: {
              Контрагент: { ИНН: client.inn }
            },
            Навигация: {
              Страница: 0,
              РазмерСтраницы: 100
            }
          },
          headers: {
            'Content-Type': 'application/json-rpc; charset=utf-8',
            'X-SBISAccessToken': oauthToken
          }
        }
      ];
      
      let leads = [];
      let lastError = null;
      
      for (const requestConfig of requestMethods) {
        try {
          const response = await axios.post(requestConfig.url, {
            jsonrpc: '2.0',
            method: requestConfig.method,
            params: requestConfig.params,
            protocol: 2,
            id: Date.now()
          }, {
            headers: requestConfig.headers,
            timeout: 30000
          });
          
          if (response.data.error) {
            // Сохраняем информацию об ошибке для логирования
            lastError = {
              message: response.data.error.message || response.data.error.code || 'Unknown error',
              code: response.data.error.code,
              status: response.status
            };
            console.log(`[CRM Sync] Ошибка с ${requestConfig.url}:`, lastError.message);
            continue; // Пробуем следующий вариант
          }
          
          // Извлекаем список сделок из ответа
          const result = response.data.result;
          if (result) {
            // Формат ответа может быть разным
            if (result.d) {
              if (Array.isArray(result.d)) {
                leads = result.d;
              } else if (result.d.Массив && Array.isArray(result.d.Массив)) {
                leads = result.d.Массив;
              } else if (result.d['@Документ']) {
                leads = [result.d];
              }
            } else if (Array.isArray(result)) {
              leads = result;
            } else if (result.Записи && Array.isArray(result.Записи)) {
              leads = result.Записи;
            }
            
            if (leads.length > 0) {
              console.log(`[CRM Sync] ✅ Найдено ${leads.length} сделок через ${requestConfig.url}`);
              break; // Успешно получили данные
            }
          }
        } catch (variantError) {
          // Сохраняем информацию об ошибке
          lastError = {
            message: variantError.message || 'Unknown error',
            code: variantError.code || variantError.response?.status,
            status: variantError.response?.status
          };
          // Не логируем 404 как ошибку - это нормально для OAuth токена
          if (variantError.response?.status !== 404) {
            console.log(`[CRM Sync] Ошибка запроса к ${requestConfig.url}:`, lastError.message);
          }
          continue; // Пробуем следующий вариант
        }
      }
      
      if (leads.length === 0) {
        // Если получили 404, это означает, что метод недоступен через OAuth токен
        // Это нормально - синхронизация работает только для заявок, созданных через приложение
        if (lastError && (lastError.code === 'ERR_BAD_REQUEST' || lastError.status === 404)) {
          // Не логируем - это нормальное поведение
        } else if (lastError) {
          console.log('[CRM Sync] Ошибка получения списка сделок:', lastError.message || lastError);
        } else {
          console.log('[CRM Sync] Сделки не найдены для клиента с ИНН:', client.inn);
        }
        // Не возвращаем ошибку, просто возвращаем пустой результат
        return res.json({
          success: true,
          message: 'Синхронизация завершена. Показываются только заявки, созданные через приложение.',
          synced: 0,
          skipped: 0,
          total: 0
        });
      }
      
      let syncedCount = 0;
      let skippedCount = 0;
      
      // Синхронизируем каждую сделку
      for (const lead of leads) {
        try {
          const documentId = lead['@Документ'] || lead.d?.['@Документ'];
          const documentUUID = lead.ИдентификаторДокумента || lead.d?.ИдентификаторДокумента;
          const notes = lead.Примечание || lead.d?.Примечание || '';
          
          // Проверяем, есть ли уже такая заявка в БД
          const existingRequest = await dbQuery(
            'SELECT id FROM service_requests WHERE sbis_document_id = ? OR sbis_document_uuid = ?',
            [documentId, documentUUID]
          );
          
          if (existingRequest.rows.length > 0) {
            skippedCount++;
            continue; // Пропускаем, если уже есть
          }
          
          // Извлекаем информацию об услуге из примечания
          // Формат: "Счет на оплату услуги "Название услуги". Количество: X, Цена: Y ₽"
          let serviceName = 'Услуга';
          let price = 0;
          let quantity = 1;
          
          if (notes) {
            // Пытаемся извлечь название услуги
            const serviceMatch = notes.match(/услуги\s+"([^"]+)"/i) || notes.match(/услуги\s+([^.]+)/i);
            if (serviceMatch) {
              serviceName = serviceMatch[1].trim();
            }
            
            // Пытаемся извлечь цену и количество
            const priceMatch = notes.match(/Цена:\s*(\d+(?:\.\d+)?)/i);
            if (priceMatch) {
              price = parseFloat(priceMatch[1]);
            }
            
            const quantityMatch = notes.match(/Количество:\s*(\d+)/i);
            if (quantityMatch) {
              quantity = parseInt(quantityMatch[1]);
            }
          }
          
          const totalAmount = price * quantity;
          
          // Сохраняем заявку в БД
          await dbQuery(
            `INSERT INTO service_requests 
             (client_id, service_name, service_code, price, quantity, total_amount, notes, status, 
              sbis_document_id, sbis_document_uuid, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW())`,
            [
              req.user.id,
              serviceName,
              null, // service_code
              price,
              quantity,
              totalAmount,
              notes || null,
              documentId || null,
              documentUUID || null
            ]
          );
          
          syncedCount++;
        } catch (leadError) {
          console.error('[CRM Sync] Ошибка синхронизации сделки:', leadError);
          // Продолжаем синхронизацию других сделок
        }
      }
      
      return res.json({
        success: true,
        message: `Синхронизировано ${syncedCount} заявок, пропущено ${skippedCount} (уже существуют)`,
        synced: syncedCount,
        skipped: skippedCount,
        total: leads.length
      });
      
    } catch (error) {
      console.error('[CRM Sync] Ошибка синхронизации:', error);
      return res.status(500).json({
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Ошибка синхронизации заявок'
      });
    }
  } catch (error) {
    console.error('[CRM Sync] Общая ошибка:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Внутренняя ошибка сервера'
    });
  }
});

module.exports = router;
