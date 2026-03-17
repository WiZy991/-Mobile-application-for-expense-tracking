const express = require('express');
const axios = require('axios'); // used for invoice creation via sbis-proxy
const { authenticateToken } = require('../middleware/auth');
const { pool, dbQuery } = require('../database/init');

const router = express.Router();

// Конфигурация СБИС для создания счетов
const SBIS_API_URL = process.env.SBIS_API_URL || 'https://online.sbis.ru/service/';
const SBIS_SELLER_INN = process.env.SBIS_SELLER_INN || '2543082240';
const SBIS_SELLER_KPP = process.env.SBIS_SELLER_KPP || '253601001';
const SBIS_SELLER_NAME = process.env.SBIS_SELLER_NAME || 'WorldCashBox';

router.use(authenticateToken);

// Каталог услуг по умолчанию
const DEFAULT_SERVICES = [
  {
    id: 1,
    name: 'Техническая поддержка',
    description: 'Консультации по телефону и через приложение, ответ в течение 24 часов',
    price: 5000,
    billing_period: 'monthly',
    category: 'support',
    icon: '🛠️',
    features: ['Телефонная поддержка', 'Поддержка через приложение', 'База знаний'],
  },
  {
    id: 2,
    name: 'Расширенная поддержка',
    description: 'Приоритетная поддержка с гарантией ответа в течение 2 часов',
    price: 15000,
    billing_period: 'monthly',
    category: 'support',
    icon: '⚡',
    features: ['Приоритетный ответ', 'Выезд специалиста', 'Поддержка 24/7'],
    popular: true,
  },
  {
    id: 3,
    name: 'Продлить Фискальный накопитель',
    description: 'Замена и настройка фискального накопителя для онлайн-кассы',
    price: 8500,
    billing_period: 'one_time',
    category: 'fiscal',
    icon: '🖨️',
    features: ['Замена ФН', 'Перерегистрация в ФНС', 'Настройка онлайн-кассы'],
  },
  {
    id: 4,
    name: 'Обновить 1С',
    description: 'Обновление платформы и конфигурации 1С до актуальной версии',
    price: 3500,
    billing_period: 'one_time',
    category: 'update',
    icon: '🔄',
    features: ['Обновление платформы', 'Обновление конфигурации', 'Проверка после обновления'],
  },
  {
    id: 5,
    name: 'Установить 1С',
    description: 'Установка и первоначальная настройка системы 1С:Предприятие',
    price: 12000,
    billing_period: 'one_time',
    category: 'install',
    icon: '💾',
    features: ['Установка платформы', 'Настройка конфигурации', 'Обучение пользователей'],
  },
  {
    id: 6,
    name: 'Облачная 1С',
    description: 'Работа в 1С через интернет с любого устройства',
    price: 2500,
    billing_period: 'monthly',
    category: 'cloud',
    icon: '☁️',
    features: ['Доступ 24/7', 'Автосохранение', 'Резервное копирование'],
  },
  {
    id: 7,
    name: 'Внедрение 1С',
    description: 'Полное внедрение и настройка системы под ваш бизнес',
    price: 50000,
    billing_period: 'one_time',
    category: 'service',
    icon: '🚀',
    features: ['Анализ бизнес-процессов', 'Настройка системы', 'Обучение персонала', 'Миграция данных'],
  },
  {
    id: 8,
    name: 'Электронная отчётность',
    description: 'Сдача отчётности в ФНС, ПФР, ФСС напрямую из 1С',
    price: 3000,
    billing_period: 'yearly',
    category: 'reporting',
    icon: '📊',
    features: ['Все виды отчётов', 'Электронная подпись', 'Автозаполнение'],
  },
  {
    id: 9,
    name: 'Выезд специалиста',
    description: 'Выезд технического специалиста к вам в офис',
    price: 5000,
    billing_period: 'one_time',
    category: 'onsite',
    icon: '🚗',
    features: ['Диагностика оборудования', 'Устранение неполадок', 'Настройка на месте'],
  },
];

// Получение OAuth токена для СБИС (сервисная авторизация)
async function getSBISOAuthToken() {
  try {
    const SBIS_OAUTH_URL = 'https://online.sbis.ru/oauth/service/';
    const SBIS_APP_CLIENT_ID = process.env.SBIS_APP_CLIENT_ID || '2651426000822745';
    const SBIS_APP_SECRET = process.env.SBIS_APP_SECRET || 'G6TMMMZWMAZ55YIP6EAV3S3D';
    const SBIS_SECRET_KEY = process.env.SBIS_SECRET_KEY || '7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg';
    
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
    
    if (response.data?.token) {
      return response.data.token;
    } else {
      return null;
    }
  } catch (error) {
    console.error('❌ Ошибка получения OAuth токена:', error.response?.data || error.message);
    return null;
  }
}

// Получить каталог услуг
router.get('/', async (req, res) => {
  try {
    console.log('📋 GET /services - Запрос каталога услуг');
    
    // Получаем активные услуги клиента
    const activeResult = await dbQuery(
      'SELECT service_id FROM client_services WHERE client_id = $1 AND is_active = true',
      [req.user.id]
    );
    const activeServices = Array.isArray(activeResult.rows)
      ? activeResult.rows.map(r => r.service_id)
      : [];

    // Пробуем взять услуги из базы данных с категориями
    // Используем COALESCE для обработки NULL значений в ORDER BY
    // Исключаем оборудование по ключевым словам (детекторы, счетчики, ридеры и т.д.)
    const result = await dbQuery(
      `SELECT * FROM services 
       WHERE is_active = true 
       AND (
         LOWER(name) NOT LIKE '%детектор%' AND
         LOWER(name) NOT LIKE '%счетчик%' AND
         LOWER(name) NOT LIKE '%ридер%' AND
         LOWER(name) NOT LIKE '%2can%' AND
         LOWER(name) NOT LIKE '%cas%' AND
         LOWER(name) NOT LIKE '%dors%' AND
         LOWER(name) NOT LIKE '%весы%' AND
         LOWER(name) NOT LIKE '%касса%' AND
         LOWER(name) NOT LIKE '%принтер%' AND
         LOWER(name) NOT LIKE '%сканер%' AND
         LOWER(name) NOT LIKE '%терминал%' AND
         LOWER(name) NOT LIKE '%монитор%' AND
         LOWER(name) NOT LIKE '%оборудование%' AND
         LOWER(name) NOT LIKE '%устройство%' AND
         LOWER(name) NOT LIKE '%аппарат%' AND
         LOWER(name) NOT LIKE '%машина%'
       )
       ORDER BY COALESCE(category, 'other'), COALESCE(subcategory, ''), name`
    );

    console.log(`📦 Найдено услуг в базе (после фильтрации оборудования): ${result?.rows?.length || 0}`);

    if (result && Array.isArray(result.rows) && result.rows.length > 0) {
      console.log('✅ Возвращаем услуги из базы данных');
      // Обогащаем услуги из базы иконками и описаниями из DEFAULT_SERVICES
      const enrichedServices = result.rows.map(dbService => {
        const defaultService = DEFAULT_SERVICES.find(ds =>
          ds.id === parseInt(dbService.id) ||
          ds.name === dbService.name ||
          (dbService.code && dbService.code.includes(`service_${ds.id}`))
        );

        return {
          ...dbService,
          features: defaultService?.features || [],
          icon: defaultService?.icon || '📦',
          category: dbService.category || defaultService?.category || 'other',
          subcategory: dbService.subcategory || null,
          popular: defaultService?.popular || false,
        };
      });

      return res.json({
        services: enrichedServices,
        activeServices,
      });
    }

    // Если в базе пусто — автоматически синхронизируем с СБИС
    console.log('📦 Услуги не найдены в базе, запускаем автоматическую синхронизацию с СБИС...');
    
    try {
      // Вызываем синхронизацию синхронно (внутренний вызов)
      const userId = req.user?.id?.toString() || 'default';
      console.log('🔑 Получаем OAuth токен для автоматической синхронизации...');
      const oauthToken = await getSBISOAuthToken();
      
      if (!oauthToken) {
        console.error('❌ Не удалось получить OAuth токен для автосинхронизации');
        throw new Error('OAuth токен не получен');
      }
      
      console.log('✅ OAuth токен получен');
      
      const SBIS_RETAIL_POINT_ID = process.env.SBIS_RETAIL_POINT_ID;
      const SBIS_RETAIL_PRICE_LIST_ID = process.env.SBIS_RETAIL_PRICE_LIST_ID;
      
      console.log(`📡 Point ID: ${SBIS_RETAIL_POINT_ID || 'не указан'}`);
      console.log(`📡 Price List ID: ${SBIS_RETAIL_PRICE_LIST_ID || 'не указан'}`);
      
      if (!SBIS_RETAIL_POINT_ID) {
        console.error('❌ SBIS_RETAIL_POINT_ID не указан в .env');
        throw new Error('SBIS_RETAIL_POINT_ID не настроен');
      }
      
      // Быстрая синхронизация
      const SBIS_RETAIL_API_URL = 'https://api.sbis.ru/retail/v2/nomenclature/list';
      const params = {
        pointId: parseInt(SBIS_RETAIL_POINT_ID),
        onlyPublished: true,
        pageSize: 1000,
      };
      
      if (SBIS_RETAIL_PRICE_LIST_ID) {
        params.priceListId = parseInt(SBIS_RETAIL_PRICE_LIST_ID);
      }
      
      console.log('📡 Запрос к СБИС Retail API...');
      const syncResponse = await axios.get(SBIS_RETAIL_API_URL, {
        params: params,
        headers: {
          'X-SBISAccessToken': oauthToken,
          'Content-Type': 'application/json',
        },
        timeout: 20000, // Увеличиваем таймаут
      });
      
      console.log(`📦 Ответ от СБИС (статус ${syncResponse.status})`);
      
      if (syncResponse.data?.nomenclatures && Array.isArray(syncResponse.data.nomenclatures)) {
        // Сначала находим папку "Услуги, лицензии, ПО"
        const allItems = syncResponse.data.nomenclatures;
        console.log(`📦 Получено ${allItems.length} элементов из СБИС`);
        
        // Логируем все родительские папки для отладки
        const parentFolders = allItems.filter(item => item.isParent === true);
        console.log(`📁 Найдено родительских папок: ${parentFolders.length}`);
        parentFolders.slice(0, 10).forEach((folder, idx) => {
          console.log(`   ${idx + 1}. "${folder.name}" (ID: ${folder.id || folder.hierarchicalId}, isParent: ${folder.isParent})`);
        });
        
        // Ищем родительскую папку "Услуги, лицензии, ПО" (точное совпадение)
        const servicesFolder = allItems.find(item => {
          if (item.isParent !== true) return false;
          const name = (item.name || '').toLowerCase();
          // Ищем папку, которая содержит "услуги" И "лицензии" И "по"
          return name.includes('услуги') && name.includes('лицензии') && name.includes('по');
        });
        
        if (!servicesFolder) {
          console.log('⚠️ Папка "Услуги, лицензии, ПО" не найдена!');
          // Пробуем найти по другим вариантам названия
          const altFolder = allItems.find(item => {
            if (item.isParent !== true) return false;
            const name = (item.name || '').toLowerCase();
            return (name.includes('услуги') && name.includes('лицензии')) || 
                   (name.includes('услуги') && name.includes('по'));
          });
          if (altFolder) {
            console.log(`⚠️ Найдена похожая папка: "${altFolder.name}" (ID: ${altFolder.id || altFolder.hierarchicalId})`);
          }
        }
        
        let targetItems = [];
        
        if (servicesFolder) {
          const folderId = servicesFolder.id || servicesFolder.hierarchicalId;
          const folderHierarchicalId = servicesFolder.hierarchicalId || servicesFolder.id?.toString();
          console.log(`✅ Найдена папка "${servicesFolder.name}" с ID: ${folderId}, hierarchicalId: ${folderHierarchicalId}`);
          
          // Собираем все ID подпапок внутри "Услуги, лицензии, ПО"
          const subFolderIds = new Set();
          subFolderIds.add(folderId?.toString());
          if (folderHierarchicalId) {
            subFolderIds.add(folderHierarchicalId);
          }
          
          // Находим все подпапки (Ключи ОФД, Лицензии и тарифы, Программное обеспечение и т.д.)
          const subFolders = allItems.filter(item => {
            if (item.isParent !== true) return false;
            const itemParentId = item.parentId || item.parent?.id;
            const itemHierarchicalId = item.hierarchicalId || item.id?.toString();
            const itemParentHierarchicalId = item.hierarchicalId?.split('/').slice(0, -1).join('/');
            
            // Проверяем, что подпапка принадлежит основной папке
            return (itemParentId && (itemParentId === folderId || itemParentId.toString() === folderId?.toString())) ||
                   (itemHierarchicalId && folderHierarchicalId && itemHierarchicalId.startsWith(folderHierarchicalId + '/')) ||
                   (itemParentHierarchicalId && folderHierarchicalId && (itemParentHierarchicalId === folderHierarchicalId || itemParentHierarchicalId.startsWith(folderHierarchicalId + '/')));
          });
          
          subFolders.forEach(subFolder => {
            const subId = subFolder.id || subFolder.hierarchicalId;
            if (subId) {
              subFolderIds.add(subId.toString());
            }
            if (subFolder.hierarchicalId) {
              subFolderIds.add(subFolder.hierarchicalId);
            }
          });
          
          console.log(`📁 Найдено подпапок внутри "${servicesFolder.name}": ${subFolders.length}`);
          subFolders.forEach((subFolder, idx) => {
            console.log(`   ${idx + 1}. "${subFolder.name}" (ID: ${subFolder.id || subFolder.hierarchicalId})`);
          });
          
          // Фильтруем ТОЛЬКО элементы из папки "Услуги, лицензии, ПО" и её подпапок
          targetItems = allItems.filter(item => {
            // Пропускаем родительские папки
            if (item.isParent === true) return false;
            
            // Проверяем, что элемент принадлежит нужной папке или её подпапкам
            const itemParentId = item.parentId || item.parent?.id;
            const itemHierarchicalId = item.hierarchicalId || item.id?.toString();
            const itemParentHierarchicalId = item.hierarchicalId?.split('/').slice(0, -1).join('/');
            
            // Проверяем по parentId (должен совпадать с ID основной папки или любой подпапки)
            if (itemParentId && subFolderIds.has(itemParentId.toString())) {
              return true;
            }
            
            // Проверяем по hierarchicalId (путь должен начинаться с hierarchicalId основной папки)
            if (itemHierarchicalId && folderHierarchicalId) {
              if (itemHierarchicalId.startsWith(folderHierarchicalId + '/') || 
                  itemHierarchicalId === folderHierarchicalId) {
                return true;
              }
            }
            
            // Проверяем по parentHierarchicalId
            if (itemParentHierarchicalId && folderHierarchicalId) {
              if (itemParentHierarchicalId === folderHierarchicalId || 
                  itemParentHierarchicalId.startsWith(folderHierarchicalId + '/')) {
                return true;
              }
            }
            
            return false;
          });
          
          console.log(`📦 Найдено ${targetItems.length} элементов в папке "${servicesFolder.name}" и её подпапках`);
          
          // Логируем первые несколько найденных элементов для проверки
          if (targetItems.length > 0) {
            console.log(`   Примеры найденных элементов:`);
            targetItems.slice(0, 10).forEach((item, idx) => {
              console.log(`   ${idx + 1}. "${item.name}" (parentId: ${item.parentId}, hierarchicalId: ${item.hierarchicalId})`);
            });
          }
        } else {
          console.log('❌ Папка "Услуги, лицензии, ПО" не найдена! Возвращаем пустой список.');
          targetItems = [];
        }
        
        let savedCount = 0;
        let updatedCount = 0;
        // Сохраняем услуги в базу
        for (const item of targetItems) {
          const name = item.name || '';
          if (!name) continue;
          
          const price = parseFloat(item.cost || 0);
          const code = item.id?.toString() || item.hierarchicalId?.toString() || `sbis_retail_${item.hierarchicalId || Date.now()}`;
          
          const existingService = await dbQuery(
            'SELECT id FROM services WHERE code = $1',
            [code]
          );
          
          if (existingService.rows.length > 0) {
            await dbQuery(
              `UPDATE services SET name = $1, price = $2, updated_at = CURRENT_TIMESTAMP WHERE code = $3`,
              [name, price, code]
            );
            updatedCount++;
          } else {
            await dbQuery(
              `INSERT INTO services (name, code, price, category, billing_period, is_active)
               VALUES ($1, $2, $3, 'other', 'one_time', true)`,
              [name, code, price]
            );
            savedCount++;
          }
        }
        
        console.log(`✅ Сохранено новых услуг: ${savedCount}, обновлено: ${updatedCount}`);
        
        // Перезагружаем услуги из базы
        const newResult = await dbQuery(
          `SELECT * FROM services 
           WHERE is_active = true 
           ORDER BY COALESCE(category, 'other'), COALESCE(subcategory, ''), name`
        );
        
        console.log(`📦 После синхронизации найдено услуг в базе: ${newResult?.rows?.length || 0}`);
        
        if (newResult && Array.isArray(newResult.rows) && newResult.rows.length > 0) {
          const enrichedServices = newResult.rows.map(dbService => ({
            ...dbService,
            features: [],
            icon: '📦',
            category: dbService.category || 'other',
            subcategory: dbService.subcategory || null,
            popular: false,
          }));
          
          console.log(`✅ Возвращаем ${enrichedServices.length} услуг после автосинхронизации`);
          return res.json({
            services: enrichedServices,
            activeServices,
          });
        }
      } else {
        console.error('❌ Неожиданный формат ответа от СБИС:', JSON.stringify(syncResponse.data).substring(0, 500));
      }
    } catch (syncError) {
      console.error('❌ Автосинхронизация не удалась:', syncError.message);
      console.error('   Детали:', syncError.response?.data || syncError.stack);
      // Продолжаем выполнение, вернем дефолтные услуги
    }

    // Если синхронизация не удалась или не настроена — возвращаем стандартный каталог IT-услуг
    console.log('⚠️ Возвращаем дефолтные услуги (синхронизация не удалась или не настроена)');
    res.json({
      services: DEFAULT_SERVICES,
      activeServices,
    });
  } catch (error) {
    console.error('❌ Get services error:', error);
    console.error('   Stack:', error.stack);
    res.json({
      services: DEFAULT_SERVICES,
      activeServices: [],
    });
  }
});

// Получить все услуги клиента (включая заявки)
router.get('/my-services', async (req, res) => {
  try {
    // Получаем активные услуги
    const servicesResult = await dbQuery(
      `SELECT 
        cs.id,
        cs.start_date,
        cs.end_date,
        cs.is_active,
        s.id as service_id,
        s.name,
        s.code,
        s.description,
        s.price,
        s.billing_period,
        'service' as type
      FROM client_services cs
      JOIN services s ON cs.service_id = s.id
      WHERE cs.client_id = ?
      ORDER BY cs.start_date DESC`,
      [req.user.id]
    );

    // Получаем заявки на услуги
    const requestsResult = await dbQuery(
      `SELECT 
        id,
        service_name as name,
        service_code as code,
        price,
        quantity,
        total_amount,
        notes as description,
        status,
        invoice_number,
        invoice_url,
        invoice_file_name,
        created_at as start_date,
        NULL as end_date,
        (status IN ('pending', 'processing')) as is_active,
        NULL as service_id,
        NULL as billing_period,
        'request' as type
      FROM service_requests
      WHERE client_id = ?
      ORDER BY created_at DESC`,
      [req.user.id]
    );

    // Объединяем результаты
    const allServices = [
      ...servicesResult.rows.map(row => ({
        ...row,
        type: 'service',
        is_active: Boolean(row.is_active) // Преобразуем в boolean
      })),
      ...requestsResult.rows.map(row => ({
        ...row,
        type: 'request',
        is_active: Boolean(row.is_active) // Преобразуем число (0/1) в boolean
      }))
    ].sort((a, b) => {
      const dateA = new Date(a.start_date || a.created_at || 0);
      const dateB = new Date(b.start_date || b.created_at || 0);
      return dateB - dateA;
    });

    res.json(allServices);
  } catch (error) {
    console.error('Get client services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить детали заявки на услугу
router.get('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    
    const result = await dbQuery(
      `SELECT * FROM service_requests 
       WHERE id = ? AND client_id = ?`,
      [requestId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get service request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить все доступные услуги
router.get('/available', async (req, res) => {
  try {
    const result = await dbQuery(
      'SELECT * FROM services WHERE is_active = true ORDER BY name'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get available services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронизация услуг с СБИС через Retail API (публичный каталог)
router.post('/sync', async (req, res) => {
  try {
    const userId = req.user?.id?.toString() || 'default';
    
    // Получаем OAuth токен для СБИС (используем сервисную авторизацию)
    const oauthToken = await getSBISOAuthToken();
    
    if (!oauthToken) {
      return res.status(500).json({
        success: false,
        error: 'Не удалось получить OAuth токен для доступа к СБИС API',
        message: 'Проверьте настройки SBIS_APP_CLIENT_ID, SBIS_APP_SECRET и SBIS_SECRET_KEY в .env файле'
      });
    }
    
    // Получаем настройки Retail API из переменных окружения
    const SBIS_RETAIL_POINT_ID = process.env.SBIS_RETAIL_POINT_ID;
    const SBIS_RETAIL_PRICE_LIST_ID = process.env.SBIS_RETAIL_PRICE_LIST_ID;
    
    if (!SBIS_RETAIL_POINT_ID) {
      return res.status(400).json({
        success: false,
        error: 'Не указан SBIS_RETAIL_POINT_ID',
        message: 'Укажите SBIS_RETAIL_POINT_ID в .env файле для доступа к публичному каталогу услуг СБИС'
      });
    }
    
    // Получаем номенклатуру из СБИС через Retail API (публичный каталог)
    let sbisServices = [];
    let errorMessage = null;
    try {
      // Используем Retail API для получения публичного каталога
      const SBIS_RETAIL_API_URL = 'https://api.sbis.ru/retail/v2/nomenclature/list';
      
      console.log('📡 Получение каталога услуг из СБИС Retail API...');
      console.log(`   Point ID: ${SBIS_RETAIL_POINT_ID}`);
      console.log(`   Price List ID: ${SBIS_RETAIL_PRICE_LIST_ID || 'не указан'}`);
      
      const params = {
        pointId: parseInt(SBIS_RETAIL_POINT_ID),
        onlyPublished: true, // Только опубликованные позиции
        pageSize: 1000, // Максимальное количество записей
      };
      
      if (SBIS_RETAIL_PRICE_LIST_ID) {
        params.priceListId = parseInt(SBIS_RETAIL_PRICE_LIST_ID);
      }
      
      const response = await axios.get(SBIS_RETAIL_API_URL, {
        params: params,
        headers: {
          'X-SBISAccessToken': oauthToken,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      
      console.log(`📦 Ответ от СБИС Retail API (статус ${response.status}):`, JSON.stringify(response.data).substring(0, 500));
      
      if (!response.data || response.data.error) {
        throw new Error(response.data?.error?.message || 'Ошибка получения данных из СБИС Retail API');
      }

      console.log('📦 SBIS Response:', JSON.stringify(response.data).substring(0, 1000));

      // Обрабатываем ответ от Retail API
      let items = [];
      
      // Retail API возвращает данные в поле nomenclatures
      let allItems = [];
      if (Array.isArray(response.data?.nomenclatures)) {
        allItems = response.data.nomenclatures;
      } else if (Array.isArray(response.data)) {
        allItems = response.data;
      } else if (Array.isArray(response.data?.result)) {
        allItems = response.data.result;
      } else if (Array.isArray(response.data?.data)) {
        allItems = response.data.data;
      } else if (Array.isArray(response.data?.items)) {
        allItems = response.data.items;
      } else if (response.data?.result && typeof response.data.result === 'object') {
        // Если result - объект с массивом внутри
        const possibleFields = ['items', 'nomenclature', 'nomenclatures', 'Номенклатура', 'data'];
        for (const field of possibleFields) {
          if (Array.isArray(response.data.result[field])) {
            allItems = response.data.result[field];
            break;
          }
        }
      }
      
      console.log(`📦 Получено ${allItems.length} элементов из СБИС`);
      
      // Логируем все родительские папки для отладки
      const parentFolders = allItems.filter(item => item.isParent === true);
      console.log(`📁 Найдено родительских папок: ${parentFolders.length}`);
      parentFolders.slice(0, 15).forEach((folder, idx) => {
        console.log(`   ${idx + 1}. "${folder.name}" (ID: ${folder.id || folder.hierarchicalId}, isParent: ${folder.isParent})`);
      });
      
        // Ищем папку "Услуги, лицензии, ПО" (точное совпадение или все три слова)
        const servicesFolder = allItems.find(item => {
          if (item.isParent !== true) return false;
          const name = (item.name || '').toLowerCase();
          // Ищем папку, которая содержит "услуги" И "лицензии" И "по"
          return name.includes('услуги') && name.includes('лицензии') && name.includes('по');
        });
        
        if (!servicesFolder) {
          console.log('⚠️ Папка "Услуги, лицензии, ПО" не найдена среди родительских папок');
          // Пробуем найти похожую папку
          const altFolder = allItems.find(item => {
            if (item.isParent !== true) return false;
            const name = (item.name || '').toLowerCase();
            return (name.includes('услуги') && name.includes('лицензии')) || 
                   (name.includes('услуги') && name.includes('по'));
          });
          if (altFolder) {
            console.log(`⚠️ Найдена похожая папка: "${altFolder.name}" (ID: ${altFolder.id || altFolder.hierarchicalId})`);
          }
        }
      
      if (servicesFolder) {
        const folderId = servicesFolder.id || servicesFolder.hierarchicalId;
        const folderHierarchicalId = servicesFolder.hierarchicalId || servicesFolder.id?.toString();
        console.log(`✅ Найдена папка "${servicesFolder.name}" с ID: ${folderId}, hierarchicalId: ${folderHierarchicalId}`);
        
        // Собираем все ID подпапок внутри "Услуги, лицензии, ПО"
        const subFolderIds = new Set();
        subFolderIds.add(folderId?.toString());
        if (folderHierarchicalId) {
          subFolderIds.add(folderHierarchicalId);
        }
        
        // Находим все подпапки (Ключи ОФД, Лицензии и тарифы, Программное обеспечение и т.д.)
        const subFolders = allItems.filter(item => {
          if (item.isParent !== true) return false;
          const itemParentId = item.parentId || item.parent?.id;
          const itemHierarchicalId = item.hierarchicalId || item.id?.toString();
          const itemParentHierarchicalId = item.hierarchicalId?.split('/').slice(0, -1).join('/');
          
          // Проверяем, что подпапка принадлежит основной папке
          return (itemParentId && (itemParentId === folderId || itemParentId.toString() === folderId?.toString())) ||
                 (itemHierarchicalId && folderHierarchicalId && itemHierarchicalId.startsWith(folderHierarchicalId + '/')) ||
                 (itemParentHierarchicalId && folderHierarchicalId && (itemParentHierarchicalId === folderHierarchicalId || itemParentHierarchicalId.startsWith(folderHierarchicalId + '/')));
        });
        
        subFolders.forEach(subFolder => {
          const subId = subFolder.id || subFolder.hierarchicalId;
          if (subId) {
            subFolderIds.add(subId.toString());
          }
          if (subFolder.hierarchicalId) {
            subFolderIds.add(subFolder.hierarchicalId);
          }
        });
        
        console.log(`📁 Найдено подпапок внутри "${servicesFolder.name}": ${subFolders.length}`);
        subFolders.forEach((subFolder, idx) => {
          console.log(`   ${idx + 1}. "${subFolder.name}" (ID: ${subFolder.id || subFolder.hierarchicalId})`);
        });
        
        // Фильтруем ТОЛЬКО элементы из папки "Услуги, лицензии, ПО" и её подпапок
        items = allItems.filter(item => {
          // Пропускаем родительские папки
          if (item.isParent === true) return false;
          
          // Проверяем, что элемент принадлежит нужной папке или её подпапкам
          const itemParentId = item.parentId || item.parent?.id;
          const itemHierarchicalId = item.hierarchicalId || item.id?.toString();
          const itemParentHierarchicalId = item.hierarchicalId?.split('/').slice(0, -1).join('/');
          
          // Проверяем по parentId (должен совпадать с ID основной папки или любой подпапки)
          if (itemParentId && subFolderIds.has(itemParentId.toString())) {
            return true;
          }
          
          // Проверяем по hierarchicalId (путь должен начинаться с hierarchicalId основной папки)
          if (itemHierarchicalId && folderHierarchicalId) {
            if (itemHierarchicalId.startsWith(folderHierarchicalId + '/') || 
                itemHierarchicalId === folderHierarchicalId) {
              return true;
            }
          }
          
          // Проверяем по parentHierarchicalId
          if (itemParentHierarchicalId && folderHierarchicalId) {
            if (itemParentHierarchicalId === folderHierarchicalId || 
                itemParentHierarchicalId.startsWith(folderHierarchicalId + '/')) {
              return true;
            }
          }
          
          return false;
        });
        
        console.log(`📦 Найдено ${items.length} элементов в папке "${servicesFolder.name}" и её подпапках`);
        
        // Логируем первые несколько найденных элементов для проверки
        if (items.length > 0) {
          console.log(`   Примеры найденных элементов:`);
          items.slice(0, 10).forEach((item, idx) => {
            console.log(`   ${idx + 1}. "${item.name}" (parentId: ${item.parentId}, hierarchicalId: ${item.hierarchicalId})`);
          });
        }
      } else {
        console.log('⚠️ Папка "Услуги, лицензии, ПО" не найдена, фильтруем по типу и названию...');
        
        // Если папку не нашли, фильтруем по другим признакам:
        // 1. Исключаем родительские папки
        // 2. Исключаем оборудование (по названию или типу)
        items = allItems.filter(item => {
          if (item.isParent === true) return false;
          
          const name = (item.name || '').toLowerCase();
          const description = (item.description || '').toLowerCase();
          
          // Исключаем оборудование по ключевым словам
          const equipmentKeywords = [
            'весы', 'касса', 'принтер', 'сканер', 'терминал', 'монитор',
            'клавиатура', 'мышь', 'компьютер', 'ноутбук', 'планшет',
            'оборудование', 'устройство', 'аппарат', 'машина', 'дисплей',
            'lcd', 'm-er', 'f-32', 'без акб', 'аккумулятор'
          ];
          
          const isEquipment = equipmentKeywords.some(keyword => 
            name.includes(keyword) || description.includes(keyword)
          );
          
          if (isEquipment) {
            return false;
          }
          
          // Включаем только услуги, лицензии, ПО
          const serviceKeywords = [
            'услуга', 'лицензия', 'подписка', 'тариф', 'ключ', 'офд',
            'битрикс', 'crm', 'программ', 'софт', 'api'
          ];
          
          return serviceKeywords.some(keyword => 
            name.includes(keyword) || description.includes(keyword)
          );
        });
        
        console.log(`📦 Отфильтровано ${items.length} услуг (исключено оборудование)`);
      }
      
      console.log(`📦 Итого обработано ${items.length} элементов номенклатуры из СБИС`);

      if (items.length === 0) {
        console.warn('⚠️ Список номенклатуры пуст или не найден в ответе СБИС');
        return res.json({
          success: true,
          message: 'Список номенклатуры пуст',
          synced: 0,
          syncedAt: new Date().toISOString(),
          warning: 'Не найдено услуг в СБИС. Проверьте настройки фильтра.'
        });
      }

      // Маппинг категорий из СБИС на наши категории
      const categoryMapping = {
        'Ключи ОФД': 'ofd_keys',
        'Лицензии и тарифы': 'licenses',
        'Программное обеспечение': 'software',
        'Услуги для ККТ и Автоматизации': 'kkt_services',
        'CRM БИТРИКС24': 'bitrix24',
        '1С-Битрикс': 'bitrix',
        'Birtix24': 'bitrix24',
      };

      for (const item of items) {
          // Обрабатываем формат данных от СБИС Retail API
          // (Родительские папки уже отфильтрованы выше)
          const name = item.name || item.Наименование || item.Название || item.title || item.nomenclatureName || '';
          
          // Группа может быть в hierarchicalParent или других полях
          const group = item.group || item.Группа || item.ГруппаНаименование || item.categoryName || item.groupName || '';
          const category = categoryMapping[group] || 'other';
          
          // Определяем подкатегорию из группы или наименования
          let subcategory = null;
          if (group) {
            subcategory = group;
          }

          // Retail API возвращает цену в поле cost
          const price = parseFloat(
            item.cost || 
            item.Цена || 
            item.price || 
            item.ЦенаЗаЕдиницу || 
            item.pricePerUnit || 
            item.salePrice || 
            item.retailPrice || 
            0
          );
          
          // Код может быть в разных полях (Retail API использует hierarchicalId или id)
          const code = item.id?.toString() || 
                      item.hierarchicalId?.toString() ||
                      item.Код || 
                      item.code || 
                      item.Идентификатор?.toString() || 
                      item.nomenclatureId?.toString() ||
                      `sbis_retail_${item.hierarchicalId || item.id || Date.now()}`;
          
          if (!name) {
            console.warn('⚠️ Пропущен элемент без названия:', JSON.stringify(item).substring(0, 200));
            continue;
          }
          
          // Фильтруем только услуги (если есть поле типа)
          // В Retail API может не быть явного поля типа, поэтому пропускаем только если явно указано, что это товар
          if (item.type && item.type !== 'service' && item.Тип && item.Тип !== 'Услуга') {
            continue; // Пропускаем товары, оставляем только услуги
          }

          // Проверяем, существует ли уже услуга с таким кодом
          const existingService = await dbQuery(
            'SELECT id FROM services WHERE code = $1',
            [code]
          );

          if (existingService.rows.length > 0) {
            // Обновляем существующую услугу
            await dbQuery(
              `UPDATE services 
               SET name = $1, description = $2, price = $3, category = $4, subcategory = $5, updated_at = CURRENT_TIMESTAMP
               WHERE code = $6`,
              [name, item.description || item.description_simple || item.Описание || '', price, category, subcategory, code]
            );
          } else {
            // Создаем новую услугу
            await dbQuery(
              `INSERT INTO services (name, code, description, price, category, subcategory, billing_period, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, 'one_time', true)`,
              [name, code, item.description || item.description_simple || item.Описание || '', price, category, subcategory]
            );
          }

          sbisServices.push({
            name,
            code,
            price,
            category,
            subcategory,
            group,
          });
        }
        
      console.log(`✅ Успешно обработано ${sbisServices.length} услуг из СБИС`);
    } catch (sbisError) {
      console.error('❌ SBIS sync error:', sbisError.response?.data || sbisError.message);
      console.error('❌ Full error:', JSON.stringify(sbisError.response?.data || sbisError.message, null, 2));
      
      errorMessage = sbisError.response?.data?.error?.message || 
                     sbisError.response?.data?.error || 
                     sbisError.message || 
                     'Ошибка синхронизации с СБИС';
      
      // Возвращаем ошибку с подробностями для отладки
      return res.status(500).json({
        success: false,
        error: errorMessage,
        message: `Не удалось синхронизировать услуги из СБИС: ${errorMessage}`,
        synced: sbisServices.length,
        syncedAt: new Date().toISOString(),
        details: process.env.NODE_ENV === 'development' ? {
          response: sbisError.response?.data,
          status: sbisError.response?.status,
          message: sbisError.message
        } : null
      });
    }

    res.json({ 
      success: true, 
      message: `Каталог услуг синхронизирован. Обработано услуг: ${sbisServices.length}`,
      synced: sbisServices.length,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Подключить услугу
router.post('/:id/subscribe', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const serviceId = parseInt(req.params.id);
    const { price } = req.body;

    // Получаем информацию о клиенте и балансе
    const clientResult = await client.query(
      'SELECT balance, inn, kpp, name FROM clients WHERE id = $1',
      [req.user.id]
    );

    if (clientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const clientData = clientResult.rows[0];
    const currentBalance = parseFloat(clientData.balance) || 0;

    // Проверяем, не подключена ли уже услуга
    const existingResult = await client.query(
      'SELECT id FROM client_services WHERE client_id = $1 AND service_id = $2 AND is_active = true',
      [req.user.id, serviceId]
    );

    if (existingResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Услуга уже подключена' });
    }

    // Получаем информацию об услуге (из базы или дефолтные)
    let service;
    let serviceIdToUse = serviceId;
    
    const serviceResult = await client.query(
      'SELECT * FROM services WHERE id = $1',
      [serviceId]
    );

    if (serviceResult.rows.length > 0) {
      service = serviceResult.rows[0];
      serviceIdToUse = service.id;
    } else {
      // Используем дефолтные услуги - нужно создать их в базе
      const defaultService = DEFAULT_SERVICES.find(s => s.id === serviceId);
      if (!defaultService) {
        await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

      // Создаем услугу в базе данных
      // Сначала проверяем, есть ли услуга с таким code
      const codeToCheck = `service_${defaultService.id}`;
      const existingByCode = await client.query(
        'SELECT * FROM services WHERE code = $1',
        [codeToCheck]
      );
      
      if (existingByCode.rows.length > 0) {
        // Услуга уже существует по code
        service = existingByCode.rows[0];
        serviceIdToUse = service.id;
      } else {
        // Пытаемся создать услугу с указанным id
        try {
          // В PostgreSQL нужно использовать setval для установки следующего значения последовательности
          // Но проще создать без id и обновить, или использовать другой подход
          const createServiceResult = await client.query(
            `INSERT INTO services (name, code, description, price, billing_period, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING *`,
            [
              defaultService.name,
              codeToCheck,
              defaultService.description || '',
              defaultService.price,
              defaultService.billing_period || 'monthly'
            ]
          );
          service = createServiceResult.rows[0];
          serviceIdToUse = service.id;
        } catch (insertError) {
          // Если ошибка - пытаемся найти по code еще раз
          const findAgain = await client.query(
            'SELECT * FROM services WHERE code = $1',
            [codeToCheck]
          );
          if (findAgain.rows.length > 0) {
            service = findAgain.rows[0];
            serviceIdToUse = service.id;
          } else {
            await client.query('ROLLBACK');
            console.error('Failed to create service:', insertError);
            return res.status(500).json({ error: 'Не удалось создать услугу в базе данных' });
          }
        }
      }
    }

    const servicePrice = price || parseFloat(service.price) || 0;

    // Проверяем баланс
    if (currentBalance < servicePrice) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Недостаточно средств',
        required: servicePrice,
        current: currentBalance
      });
    }

    // Создаем счет в СБИС (если есть данные клиента)
    let sbisInvoiceId = null;
    let sbisInvoiceNumber = null;
    
    if (clientData.inn) {
      try {
        // Используем внутренний API для создания счета
        const invoiceData = {
          buyerINN: clientData.inn,
          buyerName: clientData.name,
          buyerKPP: clientData.kpp || null,
          sellerINN: SBIS_SELLER_INN,
          amount: servicePrice,
          description: `Услуга: ${service.name}`,
          items: [{
            name: service.name,
            quantity: 1,
            price: servicePrice,
            total: servicePrice,
            unit: 'шт',
          }],
          comment: `Автоматически создан при покупке услуги "${service.name}" через приложение WorldCashBox. Дата: ${new Date().toLocaleString('ru-RU')}`,
        };

        // Вызываем внутренний API для создания счета
        const invoiceResponse = await axios.post(
          `${req.protocol}://${req.get('host')}/api/sbis-proxy/create-invoice`,
          {
            invoiceData,
            userId: 'default', // Используем дефолтную сессию
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        if (invoiceResponse.data && invoiceResponse.data.id) {
          sbisInvoiceId = invoiceResponse.data.id;
          sbisInvoiceNumber = invoiceResponse.data.number;
          console.log(`✅ Счет создан в СБИС: ${sbisInvoiceNumber} (ID: ${sbisInvoiceId})`);
        }
      } catch (sbisError) {
        // Не блокируем покупку, если не удалось создать счет в СБИС
        console.warn('⚠️ Не удалось создать счет в СБИС:', sbisError.message);
        // Продолжаем выполнение - счет можно создать позже вручную
      }
    }

    // Вычисляем даты начала и окончания
    const startDate = new Date();
    let endDate = null;
    
    // Получаем billing_period из service (может быть из базы или дефолтного объекта)
    const billingPeriod = service.billing_period || 'monthly';
    
    if (billingPeriod === 'monthly') {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (billingPeriod === 'yearly') {
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    // Для one_time endDate остается null

    // Создаем транзакцию списания
    // Преобразуем даты в формат, понятный PostgreSQL
    const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const endDateStr = endDate ? endDate.toISOString().split('T')[0] : null;
    
    const transactionResult = await client.query(
      `INSERT INTO transactions 
       (client_id, service_id, type, amount, description, period_start, period_end, sbis_invoice_id, status)
       VALUES ($1, $2, 'charge', $3, $4, $5, $6, $7, 'completed')
       RETURNING *`,
      [
        req.user.id,
        serviceIdToUse, // Используем ID услуги из базы
        servicePrice,
        `Оплата услуги: ${service.name}${sbisInvoiceNumber ? ` (Счет №${sbisInvoiceNumber})` : ''}`,
        startDateStr,
        endDateStr,
        sbisInvoiceId
      ]
    );

    const transaction = transactionResult.rows[0];

    // Списываем с баланса
    const balanceResult = await client.query(
      'UPDATE clients SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance',
      [servicePrice, req.user.id]
    );

    const newBalance = parseFloat(balanceResult.rows[0].balance);

    // Подключаем услугу
    // Используем уже преобразованные даты (startDateStr и endDateStr объявлены выше)
    // Сначала проверяем, есть ли уже запись (даже неактивная)
    const existingServiceResult = await client.query(
      'SELECT id FROM client_services WHERE client_id = $1 AND service_id = $2',
      [req.user.id, serviceIdToUse]
    );

    let clientServiceResult;
    if (existingServiceResult.rows.length > 0) {
      // Обновляем существующую запись
      clientServiceResult = await client.query(
        `UPDATE client_services 
         SET is_active = true, start_date = $1, end_date = $2
         WHERE client_id = $3 AND service_id = $4
         RETURNING *`,
        [startDateStr, endDateStr, req.user.id, serviceIdToUse]
      );
    } else {
      // Создаем новую запись
      clientServiceResult = await client.query(
        `INSERT INTO client_services (client_id, service_id, start_date, end_date, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *`,
        [req.user.id, serviceIdToUse, startDateStr, endDateStr]
      );
    }
    
    // Создаем уведомление
    await client.query(
      `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
       VALUES ($1, 'service', 'Услуга подключена', $2, $3, 'service')`,
      [
        req.user.id,
        `Услуга "${service.name}" успешно подключена. Списан ${servicePrice.toLocaleString('ru-RU')} ₽`,
        serviceId
      ]
    );

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      message: 'Услуга успешно подключена',
      serviceId,
      transaction: {
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        type: transaction.type,
        status: transaction.status,
        created_at: transaction.created_at
      },
      balance: newBalance,
      service: {
        id: service.id,
        name: service.name,
        price: servicePrice
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subscribe service error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { 
        detail: error.detail,
        code: error.code 
      })
    });
  } finally {
    client.release();
  }
});

// Отключить услугу
router.post('/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const serviceId = parseInt(req.params.id);

    // Проверяем, подключена ли услуга
    const serviceResult = await client.query(
      `SELECT cs.*, s.name as service_name
       FROM client_services cs
       LEFT JOIN services s ON cs.service_id = s.id
       WHERE cs.client_id = $1 AND cs.service_id = $2 AND cs.is_active = true`,
      [req.user.id, serviceId]
    );

    if (serviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Услуга не найдена или уже отключена' });
    }

    const clientService = serviceResult.rows[0];

    // Отключаем услугу
    await client.query(
      'UPDATE client_services SET is_active = false, end_date = CURRENT_TIMESTAMP WHERE id = $1',
      [clientService.id]
    );

    // Создаем уведомление
    await client.query(
      `INSERT INTO notifications (client_id, type, title, message, related_id, related_type)
       VALUES ($1, 'service', 'Услуга отключена', $2, $3, 'service')`,
      [
        req.user.id,
        `Услуга "${clientService.service_name || 'Услуга'}" отключена`,
        serviceId
      ]
    );

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      message: 'Услуга отключена',
      serviceId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel service error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;

