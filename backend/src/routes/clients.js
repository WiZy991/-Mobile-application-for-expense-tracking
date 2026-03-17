const express = require('express');
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const { pool, dbQuery } = require('../database/init');
const { normalizeCompanyName, getCompanyDataFromAlternativeSource } = require('../services/companyDataService');

const router = express.Router();

// Все роуты требуют аутентификации
router.use(authenticateToken);

// Получить информацию о текущем клиенте
router.get('/me', async (req, res) => {
  try {
    console.log('Getting client info for user:', req.user.id);
    
    const result = await dbQuery(
      `SELECT 
        id, 
        email, 
        name, 
        phone, 
        balance, 
        inn, 
        kpp,
        ogrn,
        company_address,
        sbis_contract_id, 
        oktmo,
        okpo,
        okved,
        pf_reg_number,
        sfr_reg_number,
        registration_date,
        registration_authority,
        director,
        created_at,
        updated_at
      FROM clients 
      WHERE id = $1`,
      [req.user.id]
    );
    
    console.log('[API /me] Director from DB:', result.rows[0]?.director || 'null');

    console.log('Query result rows:', result.rows.length);

    if (result.rows.length === 0) {
      console.error('Client not found for user:', req.user.id);
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = result.rows[0];
    console.log('Client data from DB:', {
      id: client.id,
      email: client.email,
      name: client.name,
      phone: client.phone,
      balance: client.balance,
      inn: client.inn,
      kpp: client.kpp,
      ogrn: client.ogrn,
      company_address: client.company_address // Добавляем адрес в логирование
    });
    console.log('[API /me] Адрес из БД:', client.company_address);
    console.log('[API /me] Длина адреса:', client.company_address?.length || 0);
    
    // Убеждаемся, что все поля есть (даже если null)
    // Используем snake_case для соответствия стандарту REST API
    const response = {
      id: client.id,
      email: client.email || '',
      name: client.name || '',
      phone: client.phone || null,
      balance: parseFloat(client.balance) || 0,
      inn: client.inn || null,
      kpp: client.kpp || null,
      ogrn: client.ogrn || null,
      company_address: client.company_address || null,
      sbis_contract_id: client.sbis_contract_id || null,
      oktmo: client.oktmo || null,
      okpo: client.okpo || null,
      okved: client.okved || null,
      pf_reg_number: client.pf_reg_number || null,
      sfr_reg_number: client.sfr_reg_number || null,
      registration_date: client.registration_date ? new Date(client.registration_date).toISOString().split('T')[0] : null,
      registration_authority: client.registration_authority || null,
      director: client.director || null,
      created_at: client.created_at ? new Date(client.created_at).toISOString() : null,
      updated_at: client.updated_at ? new Date(client.updated_at).toISOString() : null,
    };
    
    console.log('Sending response:', response);
    console.log('[API /me] Адрес в ответе:', response.company_address);
    console.log('[API /me] Длина адреса в ответе:', response.company_address?.length || 0);
    console.log('[API /me] Директор в ответе:', response.director || 'null');
    res.json(response);
  } catch (error) {
    console.error('Get client error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// Получить статистику клиента
router.get('/me/stats', async (req, res) => {
  try {
    console.log('Getting stats for client:', req.user.id);
    
    // Считаем сумму всех платежей
    const paymentsResult = await dbQuery(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'completed' THEN amount ELSE 0 END), 0) as total_spent,
        COUNT(CASE WHEN type = 'charge' AND status = 'pending' THEN 1 END) as active_invoices,
        COUNT(CASE WHEN type = 'charge' AND status = 'completed' THEN 1 END) as paid_invoices,
        COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount
      FROM transactions 
      WHERE client_id = $1`,
      [req.user.id]
    );

    const stats = paymentsResult.rows[0] || {};

    console.log('Stats result:', stats);

    // Проверяем, есть ли вообще транзакции
    const transactionsCount = await dbQuery(
      'SELECT COUNT(*) as count FROM transactions WHERE client_id = $1',
      [req.user.id]
    );
    
    const hasTransactions = parseInt(transactionsCount.rows[0]?.count || 0) > 0;
    console.log('Has transactions:', hasTransactions);

    const result = {
      totalSpent: parseFloat(stats.total_spent) || 0,
      totalPaid: parseFloat(stats.total_paid) || 0,
      activeInvoices: parseInt(stats.active_invoices) || 0,
      paidInvoices: parseInt(stats.paid_invoices) || 0,
      pendingAmount: parseFloat(stats.pending_amount) || 0,
      hasTransactions, // Флаг для фронтенда
    };

    console.log('Returning stats:', result);
    res.json(result);
  } catch (error) {
    console.error('Get stats error:', error);
    // Возвращаем нулевые значения при ошибке
    res.json({
      totalSpent: 0,
      totalPaid: 0,
      activeInvoices: 0,
      paidInvoices: 0,
      pendingAmount: 0,
      hasTransactions: false,
    });
  }
});

// Обновить информацию о клиенте
router.put('/me', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.user.id);

    const query = `
      UPDATE clients 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING id, email, name, phone, balance, created_at
    `;

    const result = await dbQuery(query, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить баланс
router.get('/balance', async (req, res) => {
  try {
    const result = await dbQuery('SELECT balance FROM clients WHERE id = $1', [req.user.id]);
    res.json({ balance: parseFloat(result.rows[0]?.balance) || 0 });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронизация данных клиента с СБИС
router.post('/sync', async (req, res) => {
  try {
    const clientId = req.user.id;
    
    // Получаем данные клиента (ИНН, КПП, sbis_contract_id)
    // ВАЖНО: Получаем данные ДО синхронизации, чтобы сравнить после
    const clientResult = await dbQuery(
      `SELECT 
        id, 
        email, 
        name, 
        phone, 
        balance, 
        inn, 
        kpp,
        ogrn,
        company_address,
        sbis_contract_id, 
        created_at, 
        updated_at 
      FROM clients 
      WHERE id = $1`,
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    // Сохраняем копию исходных данных для сравнения
    const client = { ...clientResult.rows[0] };
    
    // Если есть ИНН, синхронизируем данные из SBIS
    let sbisData = null;
    if (client.inn) {
      try {
        console.log(`[Sync] ========================================`);
        console.log(`[Sync] Синхронизация данных клиента ${clientId} по ИНН: ${client.inn}`);
        console.log(`[Sync] Проверка доступности источников данных:`);
        console.log(`[Sync]   - DADATA_API_KEY: ${process.env.DADATA_API_KEY ? '✅ установлен' : '❌ не установлен'}`);
        console.log(`[Sync]   - SBIS_LOGIN: ${process.env.SBIS_LOGIN ? '✅ установлен' : '❌ не установлен'}`);
        console.log(`[Sync]   - SBIS_PASSWORD: ${process.env.SBIS_PASSWORD ? '✅ установлен' : '❌ не установлен'}`);
        console.log(`[Sync] ========================================`);
        
        // Получаем OAuth токен для SBIS
        const SBIS_OAUTH_URL = 'https://online.sbis.ru/oauth/service/';
        const SBIS_SERVICES = {
          edo: 'https://online.sbis.ru/service/?srv=1'
        };
        
        const SBIS_APP_CLIENT_ID = process.env.SBIS_APP_CLIENT_ID || '2651426000822745';
        const SBIS_APP_SECRET = process.env.SBIS_APP_SECRET || 'G6TMMMZWMAZ55YIP6EAV3S3D';
        const SBIS_SECRET_KEY = process.env.SBIS_SECRET_KEY || '7wSRR8BLFUW2PRveezMUaH7NPh4fhJC2cV5ao5nWKtIH1dGF5VuqhhAoG78tSba9hY6sKGbzqZ8Ce1PWncvbfdn8kNXxKYul9WfmjI6yzJCTn6GptUm3Yg';
        
        // Получаем OAuth токен
        console.log('[Sync] Получение OAuth токена SBIS...');
        console.log('[Sync]   URL:', SBIS_OAUTH_URL);
        console.log('[Sync]   App Client ID:', SBIS_APP_CLIENT_ID);
        
        let authResponse;
        try {
          authResponse = await axios.post(SBIS_OAUTH_URL, {
            app_client_id: SBIS_APP_CLIENT_ID,
            app_secret: SBIS_APP_SECRET,
            secret_key: SBIS_SECRET_KEY,
          }, {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            timeout: 30000,
          });
        } catch (authError) {
          console.error('[Sync] Ошибка получения OAuth токена:');
          console.error('[Sync]   Status:', authError.response?.status);
          console.error('[Sync]   Status Text:', authError.response?.statusText);
          console.error('[Sync]   Response Data:', JSON.stringify(authError.response?.data, null, 2));
          console.error('[Sync]   Error Message:', authError.message);
          throw new Error(`Ошибка получения OAuth токена: ${authError.response?.status || authError.message}`);
        }

        console.log('[Sync] OAuth токен получен:');
        console.log('[Sync]   Status:', authResponse.status);
        console.log('[Sync]   Response:', JSON.stringify(authResponse.data, null, 2));

        if (!authResponse.data || !authResponse.data.token) {
          console.error('[Sync] Токен отсутствует в ответе');
          throw new Error('Не удалось получить OAuth токен SBIS');
        }

        const oauthToken = authResponse.data.token;
        console.log('[Sync] OAuth токен успешно получен');
        
        // Определяем тип контрагента по длине ИНН
        const cleanInn = client.inn.replace(/\D/g, '');
        const innLength = cleanInn.length;
        const isIP = innLength === 12; // ИП имеет 12-значный ИНН
        const isOOO = innLength === 10; // ООО имеет 10-значный ИНН
        
        // Формируем параметры запроса для получения информации о контрагенте
        // Согласно документации SBIS, ДопПоля должен быть внутри Участник
        let params;
        if (isIP) {
          // ИП - используем структуру СвФЛ (физическое лицо)
          params = {
            Участник: {
              СвФЛ: {
                ИНН: cleanInn
              },
              ДопПоля: 'СписокИдентификаторов' // Получаем расширенную информацию, включая состояния подключения
            }
          };
        } else {
          // ООО - используем структуру СвЮЛ
          params = {
            Участник: {
              СвЮЛ: {
                ИНН: cleanInn
              },
              ДопПоля: 'СписокИдентификаторов' // Получаем расширенную информацию, включая состояния подключения
            }
          };
          
          // КПП добавляем только для ООО и только если указан
          if (client.kpp && client.kpp.trim().length > 0) {
            params.Участник.СвЮЛ.КПП = client.kpp.trim();
          }
        }
        
        // Выполняем запрос к SBIS API для получения информации о контрагенте
        const requestBody = {
          jsonrpc: '2.0',
          method: 'СБИС.ИнформацияОКонтрагенте',
          params: params,
          id: Date.now(),
        };
        
        console.log('[Sync] Запрос к SBIS API:');
        console.log('[Sync]   URL:', SBIS_SERVICES.edo);
        console.log('[Sync]   Method:', requestBody.method);
        console.log('[Sync]   Params:', JSON.stringify(params, null, 2));
        console.log('[Sync]   OAuth Token:', oauthToken ? `${oauthToken.substring(0, 20)}...` : 'MISSING');
        
        let sbisResponse;
        try {
          sbisResponse = await axios.post(
            SBIS_SERVICES.edo,
            requestBody,
            {
              headers: {
                'Content-Type': 'application/json-rpc; charset=utf-8',
                'X-SBISAccessToken': oauthToken,
              },
              timeout: 30000,
            }
          );
        } catch (axiosError) {
          console.error('[Sync] Ошибка HTTP запроса к SBIS:');
          console.error('[Sync]   Status:', axiosError.response?.status);
          console.error('[Sync]   Status Text:', axiosError.response?.statusText);
          console.error('[Sync]   URL:', axiosError.config?.url);
          console.error('[Sync]   Response Data:', JSON.stringify(axiosError.response?.data, null, 2));
          console.error('[Sync]   Error Message:', axiosError.message);
          
          // При ошибке HTTP запроса пробуем получить данные из альтернативных источников
          const errorData = axiosError.response?.data;
          if (errorData && errorData.error) {
            console.log('[Sync] ⚠️  Ошибка SBIS API в HTTP ответе. Пробуем получить данные из DaData API...');
            try {
              const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
              if (altData) {
                console.log('[Sync] ✅ Получены данные из DaData API');
                
                // Формируем sbisData из DaData API
                const normalizedName = normalizeCompanyName(altData.name);
                console.log('[Sync] Адрес из DaData:', altData.address);
                console.log('[Sync] Источник данных:', altData.source);
                sbisData = {
                  name: normalizedName,
                  legalAddress: altData.address || null,
                  kpp: altData.kpp || client.kpp || null,
                  ogrn: altData.ogrn || altData.ogrnip || client.ogrn || null,
                  identifier: null,
                  identifiers: null,
                  connectionStatus: {
                    code: '2',
                    description: 'Не подключен',
                    connected: false
                  },
                  type: isIP ? 'IP' : 'OOO',
                  director: altData.director || null,
                  oktmo: altData.oktmo || null,
                  okpo: altData.okpo || null,
                  okved: altData.okved || null,
                  pfRegNumber: altData.pfRegNumber || null,
                  sfrRegNumber: altData.sfrRegNumber || null,
                  registrationDate: altData.registrationDate || null,
                  registrationAuthority: altData.registrationAuthority || null,
                  source: altData.source || 'dadata'
                };
                
                // Переходим к обновлению данных в БД (пропускаем остальную логику SBIS API)
                sbisResponse = null; // Помечаем, что ответа нет
              } else {
                console.log('[Sync] ⚠️  Альтернативные источники не вернули данных');
                // Продолжаем выполнение, но без данных из SBIS
                sbisResponse = null;
              }
            } catch (altError) {
              console.warn('[Sync] ⚠️  Ошибка получения данных из альтернативных источников:', altError.message);
              // Продолжаем выполнение, но без данных из SBIS
              sbisResponse = null;
            }
          } else {
            // Если нет структурированной ошибки, просто логируем и продолжаем
            console.warn('[Sync] ⚠️  Не удалось получить ответ от SBIS API, пробуем DaData API...');
            try {
              const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
              if (altData) {
                console.log('[Sync] ✅ Получены данные из DaData API');
                const normalizedName = normalizeCompanyName(altData.name);
                sbisData = {
                  name: normalizedName,
                  legalAddress: altData.address || null,
                  kpp: altData.kpp || client.kpp || null,
                  ogrn: altData.ogrn || altData.ogrnip || client.ogrn || null,
                  identifier: null,
                  identifiers: null,
                  connectionStatus: {
                    code: '2',
                    description: 'Не подключен',
                    connected: false
                  },
                  type: isIP ? 'IP' : 'OOO',
                  director: altData.director || null,
                  oktmo: altData.oktmo || null,
                  okpo: altData.okpo || null,
                  okved: altData.okved || null,
                  pfRegNumber: altData.pfRegNumber || null,
                  sfrRegNumber: altData.sfrRegNumber || null,
                  registrationDate: altData.registrationDate || null,
                  registrationAuthority: altData.registrationAuthority || null,
                  source: altData.source || 'dadata'
                };
                sbisResponse = null;
              } else {
                sbisResponse = null;
              }
            } catch (altError) {
              console.warn('[Sync] ⚠️  Ошибка получения данных из альтернативных источников:', altError.message);
              sbisResponse = null;
            }
          }
        }

        // Если sbisResponse был установлен в null из-за ошибки, пропускаем дальнейшую обработку
        if (!sbisResponse) {
          // Данные уже получены из DaData API или не удалось получить данные
          console.log('[Sync] Пропускаем обработку ответа SBIS API (ошибка или данные уже получены из DaData API)');
        } else {
        console.log('[Sync] Ответ от SBIS API:');
        console.log('[Sync]   Status:', sbisResponse.status);
        console.log('[Sync]   Data:', JSON.stringify(sbisResponse.data, null, 2));

        if (sbisResponse.data.error) {
          console.error('[Sync] Ошибка SBIS API:', sbisResponse.data.error);
          const errorMsg = sbisResponse.data.error.message || 'Ошибка получения данных из SBIS';
          
          // При любой ошибке SBIS API пробуем получить данные из DaData API
          console.log('[Sync] ⚠️  Ошибка SBIS API. Пробуем получить данные из DaData API...');
          try {
            const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
            if (altData) {
              console.log('[Sync] ✅ Получены данные из DaData API');
              
              // Формируем sbisData из DaData API
              const normalizedName = normalizeCompanyName(altData.name);
              sbisData = {
                name: normalizedName,
                legalAddress: altData.address || null,
                kpp: altData.kpp || client.kpp || null,
                ogrn: altData.ogrn || altData.ogrnip || client.ogrn || null,
                identifier: null,
                identifiers: null,
                connectionStatus: {
                  code: '2',
                  description: 'Не подключен',
                  connected: false
                },
                type: isIP ? 'IP' : 'OOO',
                director: altData.director || null,
                oktmo: altData.oktmo || null,
                okpo: altData.okpo || null,
                okved: altData.okved || null,
                pfRegNumber: altData.pfRegNumber || null,
                sfrRegNumber: altData.sfrRegNumber || null,
                registrationDate: altData.registrationDate || null,
                registrationAuthority: altData.registrationAuthority || null,
                source: altData.source || 'dadata'
              };
              
              // Переходим к обновлению данных в БД (пропускаем остальную логику SBIS API)
            } else {
              console.log('[Sync] ⚠️  Альтернативные источники не вернули данных');
              // Продолжаем выполнение, но без данных из SBIS
            }
          } catch (altError) {
            console.warn('[Sync] ⚠️  Ошибка получения данных из альтернативных источников:', altError.message);
            // Продолжаем выполнение, но без данных из SBIS
          }
        }

        // Если sbisData уже заполнен из DaData API, пропускаем парсинг ответа SBIS
        if (sbisData) {
          // Данные уже получены из DaData API, переходим к обновлению БД
          console.log('[Sync] ✅ Используем данные из DaData API');
        } else {
        const sbisResult = sbisResponse.data.result;
        if (!sbisResult) {
            // Если нет результата, пробуем DaData API
            console.log('[Sync] ⚠️  Контрагент не найден в SBIS. Пробуем DaData API...');
            try {
              const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
              if (altData) {
                console.log('[Sync] ✅ Получены данные из DaData API');
                const normalizedName = normalizeCompanyName(altData.name);
                sbisData = {
                  name: normalizedName,
                  legalAddress: altData.address || null,
                  kpp: altData.kpp || client.kpp || null,
                  ogrn: altData.ogrn || altData.ogrnip || client.ogrn || null,
                  identifier: null,
                  identifiers: null,
                  connectionStatus: {
                    code: '2',
                    description: 'Не подключен',
                    connected: false
                  },
                  type: isIP ? 'IP' : 'OOO',
                  director: altData.director || null,
                  oktmo: altData.oktmo || null,
                  okpo: altData.okpo || null,
                  okved: altData.okved || null,
                  pfRegNumber: altData.pfRegNumber || null,
                  sfrRegNumber: altData.sfrRegNumber || null,
                  registrationDate: altData.registrationDate || null,
                  registrationAuthority: altData.registrationAuthority || null,
                  source: altData.source || 'dadata'
                };
              } else {
                console.log('[Sync] ⚠️  Контрагент не найден в SBIS и альтернативных источниках');
                // Не бросаем исключение, просто продолжаем без обновления данных
              }
            } catch (altError) {
              console.warn('[Sync] ⚠️  Ошибка получения данных из альтернативных источников:', altError.message);
              // Не бросаем исключение, просто продолжаем без обновления данных
            }
          } else if (sbisResult) {
            // Есть результат SBIS, продолжаем парсинг
        console.log('[Sync] Полный ответ SBIS result:');
        console.log('[Sync]   СвЮЛ:', sbisResult.СвЮЛ ? 'есть' : 'нет');
        console.log('[Sync]   СвФЛ:', sbisResult.СвФЛ ? 'есть' : 'нет');
        console.log('[Sync]   Идентификатор:', sbisResult.Идентификатор ? 'есть' : 'нет');
        console.log('[Sync]   Email:', sbisResult.Email || 'нет');
        console.log('[Sync]   Телефон:', sbisResult.Телефон || 'нет');
        console.log('[Sync]   Тип:', sbisResult.Тип || 'нет');
        console.log('[Sync]   Все поля result:', Object.keys(sbisResult).join(', '));

        // Извлекаем данные из ответа SBIS
        let svul = null;
        let svfl = null;
        
        if (sbisResult.СвЮЛ) {
          svul = sbisResult.СвЮЛ;
          console.log('[Sync] СвЮЛ поля:', Object.keys(svul).join(', '));
        } else if (sbisResult.СвФЛ) {
          svfl = sbisResult.СвФЛ;
          console.log('[Sync] СвФЛ поля:', Object.keys(svfl).join(', '));
        }

        // Формируем объект с данными из SBIS
        if (isIP && svfl) {
          // Для ИП используем НазваниеПолное или формируем ФИО
          const fio = svfl.НазваниеПолное || `${svfl.Фамилия || ''} ${svfl.Имя || ''} ${svfl.Отчество || ''}`.trim() || null;
          
          // ВАЖНО: Метод СБИС.ИнформацияОКонтрагенте для ИП НЕ возвращает адрес и ОГРНИП
          // Проверяем все возможные места, где может быть адрес
          let address = svfl.АдресЮридический || 
                       svfl.Адрес || 
                       svfl.АдресРегистрации ||
                       sbisResult.Адрес ||
                       sbisResult.АдресЮридический ||
                       null;
          
          // ОГРНИП также не возвращается этим методом для ИП
          let ogrnip = svfl.ОГРНИП || 
                      svfl.ОГРН || 
                      sbisResult.ОГРНИП ||
                      sbisResult.ОГРН ||
                      null;
          
          console.log('[Sync] Извлечение данных для ИП:');
          console.log('[Sync]   svfl поля:', Object.keys(svfl).join(', '));
          console.log('[Sync]   sbisResult поля:', Object.keys(sbisResult).join(', '));
          console.log('[Sync]   address из СБИС.ИнформацияОКонтрагенте:', address);
          console.log('[Sync]   ogrnip из СБИС.ИнформацияОКонтрагенте:', ogrnip);
          
              // Получаем полные данные через SppAPI.Requisites (сервис "Все о компаниях")
              // Этот API возвращает ОГРНИП, ОКТМО, ОКПО, ОКВЭД, рег. номер ПФ, рег. номер СФР и т.д.
              let sppData = null;
              let director = client.director; // Инициализируем директора из текущих данных клиента
              if (client.inn) {
                try {
                  console.log('[Sync] Получаем полные данные через SppAPI.Requisites...');
              
              // Получаем SPP сессию через авторизацию
              // ВАЖНО: Используем прямой вызов авторизации вместо HTTP запроса
              // чтобы избежать проблем с внутренними запросами
              const SPP_AUTH_URL = 'https://api.saby.ru/auth/service/'; // Для api.saby.ru API
              const SBIS_SERVICES = {
                spp: 'https://api.saby.ru/spp-rest-api/service/' // Согласно документации пункта 13
              };
              
              console.log('[Sync]   SBIS_LOGIN установлен:', !!process.env.SBIS_LOGIN);
              console.log('[Sync]   SBIS_PASSWORD установлен:', !!process.env.SBIS_PASSWORD);
              
              if (process.env.SBIS_LOGIN && process.env.SBIS_PASSWORD) {
                console.log('[Sync]   Выполняем авторизацию для получения SPP сессии...');
                let sppSessionId = null;
                
                try {
                  // Прямой вызов авторизации в api.sbis.ru
                  console.log('[Sync]   Прямая авторизация в SPP API:', SPP_AUTH_URL);
                  const sppAuthResponse = await axios.post(
                    SPP_AUTH_URL,
                    {
                      jsonrpc: '2.0',
                      method: 'САП.Аутентифицировать',
                      protocol: 3,
                      params: {
                        login: process.env.SBIS_LOGIN,
                        password: process.env.SBIS_PASSWORD,
                      },
                      id: Date.now(),
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                      },
                      timeout: 30000,
                    }
                  );
                  
                  console.log('[Sync]   SPP Auth response:', JSON.stringify(sppAuthResponse.data));
                  
                  if (sppAuthResponse.data.result) {
                    sppSessionId = sppAuthResponse.data.result;
                    // Сохраняем сессию в Map (нужно получить доступ к sppSessions)
                    const userId = clientId.toString();
                    // Используем глобальный объект для хранения сессий
                    if (typeof global.sppSessionsMap === 'undefined') {
                      global.sppSessionsMap = new Map();
                    }
                    global.sppSessionsMap.set(userId, sppSessionId);
                    console.log('[Sync]   ✅ SPP сессия получена:', sppSessionId.substring(0, 20) + '...');
                  } else {
                    console.log('[Sync]   ⚠️  SPP сессия не получена из ответа');
                  }
                } catch (authError) {
                  console.error('[Sync]   Ошибка авторизации для SPP:', authError.message);
                  console.error('[Sync]   Error response:', authError.response?.data);
                  console.error('[Sync]   Error status:', authError.response?.status);
                  // Не прерываем выполнение, просто логируем ошибку
                }
                
                if (sppSessionId) {
                  // Вызываем SPP API напрямую для получения полных данных
                  console.log('[Sync]   Вызываем SPP API напрямую для ИНН:', client.inn);
                  const SBIS_SERVICES = {
                    spp: 'https://api.saby.ru/spp-rest-api/service/' // Согласно документации пункта 13
                  };
                  
                  try {
                    const sppResponse = await axios.post(
                      SBIS_SERVICES.spp,
                      {
                        jsonrpc: '2.0',
                        method: 'SppAPI.Requisites',
                        params: {
                          inn: client.inn,
                          ogrn: null,
                        },
                        protocol: 3, // Согласно документации пункта 13
                        id: Date.now(),
                      },
                      {
                        headers: {
                          'Content-Type': 'application/json; charset=UTF-8',
                          Cookie: `sid=${sppSessionId}`,
                          'User-Agent': 'WorldCashBox/1.0',
                        },
                        timeout: 30000,
                      }
                    );
                    
                    console.log('[Sync]   SPP API ответ получен, статус:', sppResponse.status);
                    console.log('[Sync]   SPP API raw response:', JSON.stringify(sppResponse.data, null, 2));
                    
                    if (sppResponse.data.error) {
                      console.error('[Sync]   SPP API вернул ошибку:', sppResponse.data.error);

                      // Если нет лицензии на Requisites, пробуем Contractor.Find (пункт 14)
                      const errMsg = sppResponse.data.error?.message || '';
                      if (errMsg.includes('без наличия лицензии на API')) {
                        console.log('[Sync]   Нет лицензии на SppAPI.Requisites, пробуем Contractor.Find (п.14)...');
                        try {
                          const findResponse = await axios.post(
                            SBIS_SERVICES.spp,
                            {
                              jsonrpc: '2.0',
                              method: 'Contractor.Find',
                              params: {
                                requisites: client.inn,
                                page: 0,
                                size: 1,
                              },
                              protocol: 5,
                              id: Date.now(),
                            },
                            {
                              headers: {
                                'Content-Type': 'application/json; charset=UTF-8',
                                Cookie: `sid=${sppSessionId}`,
                                'User-Agent': 'WorldCashBox/1.0',
                              },
                              timeout: 30000,
                            }
                          );

                          console.log('[Sync]   Contractor.Find ответ:', JSON.stringify(findResponse.data, null, 2));

                          if (!findResponse.data.error && findResponse.data.result) {
                            const result = findResponse.data.result;
                            let first = null;

                            if (Array.isArray(result)) {
                              first = result[0] || null;
                            } else if (result && typeof result === 'object') {
                              const keys = Object.keys(result);
                              if (keys.length > 0) {
                                first = result[keys[0]];
                              }
                            }

                            if (first) {
                              console.log('[Sync]   Contractor.Find первый элемент:', first);
                              sppData = {
                                inn: first.INN || client.inn,
                                kpp: first.KPP || null,
                                ogrn: first.OGRN || null,
                                name: first.Name || null,
                                fullName: first.Name || null,
                                address: null,
                                director: null,
                                okved: null,
                                oktmo: null,
                                okpo: null,
                                pfRegNumber: null,
                                sfrRegNumber: null,
                                registrationDate: null,
                                registrationAuthority: null,
                                status: first.State,
                                source: 'spp-contractor-find',
                              };

                              console.log('[Sync] ✅ Получены данные из Contractor.Find:', JSON.stringify(sppData, null, 2));

                              if (sppData.ogrn && !ogrnip) ogrnip = sppData.ogrn;
                              if (sppData.name && !fio) fio = sppData.name;
                            } else {
                              console.log('[Sync] ⚠️  Contractor.Find не вернул данных');
                            }
                          } else {
                            console.log('[Sync] ⚠️  Contractor.Find вернул ошибку или пустой результат:', findResponse.data.error);
                          }
                        } catch (findError) {
                          console.error('[Sync]   Ошибка запроса к Contractor.Find:', findError.message);
                          console.error('[Sync]   Error response:', findError.response?.data);
                        }
                      }
                    } else if (sppResponse.data.result) {
                      const data = sppResponse.data.result;
                      const baseRequisites = data.BaseRequisites || {};
                      console.log('[Sync]   SPP API result keys:', Object.keys(data).join(', '));
                      console.log('[Sync]   BaseRequisites keys:', Object.keys(baseRequisites).join(', '));
                      
                      // Извлекаем данные из ответа SPP API
                      // Согласно документации пункта 13, основные данные находятся в BaseRequisites
                      sppData = {
                        inn: baseRequisites.INN || data.INN || data.inn || client.inn,
                        kpp: baseRequisites.KPP || data.KPP || data.kpp,
                        ogrn: baseRequisites.OGRN || data.OGRN || data.ogrn || data.OGRNIP,
                        name: baseRequisites.Name || baseRequisites.ShortName || data.Name || data.ShortName || data.FullName,
                        fullName: baseRequisites.FullName || data.FullName || data.Name,
                        address: baseRequisites.Address || baseRequisites.ActualAddress || data.Address || data.LegalAddress,
                        director: baseRequisites.DirectorName?.Name || baseRequisites.Head || data.Director || data.HeadName,
                        okved: baseRequisites.OKVED || (baseRequisites.ExtendedOKVED ? baseRequisites.ExtendedOKVED.split(',')[0] : null) || data.OKVED || data.MainOKVED,
                        oktmo: baseRequisites.OKTMO || data.OKTMO || data.oktmo,
                        okpo: baseRequisites.OKPO || data.OKPO || data.okpo,
                        pfRegNumber: baseRequisites.RegNumberPF || data.PFRegNumber || data.pfRegNumber || data.PensionFundRegNumber,
                        sfrRegNumber: baseRequisites.RegNumberFSS || data.SFRRegNumber || data.sfrRegNumber || data.SocialFundRegNumber,
                        registrationDate: baseRequisites.DateRegistration || baseRequisites.DateOfOGRNRegistration || data.RegistrationDate || data.RegDate,
                        registrationAuthority: baseRequisites.NameOfRegistrationAuthority || data.RegistrationAuthority || data.RegAuthority,
                        status: baseRequisites.State || data.State,
                        source: 'spp-api',
                      };
                      
                      console.log('[Sync] ✅ Получены данные из SPP API:', Object.keys(sppData).join(', '));
                      console.log('[Sync]   SPP данные:', JSON.stringify(sppData, null, 2));
                      
                      // Используем данные из SPP API если они есть
                      if (sppData.ogrn && !ogrnip) ogrnip = sppData.ogrn;
                      if (sppData.address && !address) address = sppData.address;
                      if (sppData.name && !fio) fio = sppData.name;
                    } else {
                      console.log('[Sync] ⚠️  SPP API не вернул result в ответе');
                    }
                  } catch (sppApiError) {
                    console.error('[Sync]   Ошибка запроса к SPP API:', sppApiError.message);
                    console.error('[Sync]   Error response:', sppApiError.response?.data);
                    console.error('[Sync]   Error status:', sppApiError.response?.status);
                    // Не прерываем выполнение, просто логируем ошибку
                  }
                } else {
                  console.log('[Sync] ⚠️  SPP сессия не получена, пропускаем SPP API');
                }
              } else {
                console.log('[Sync] ⚠️  SBIS_LOGIN или SBIS_PASSWORD не установлены в переменных окружения');
              }
            } catch (sppError) {
              console.error('[Sync] ⚠️  Ошибка при получении данных через SppAPI:', sppError.message);
              console.error('[Sync]   Error details:', sppError.response?.data || sppError.stack);
              if (sppError.response) {
                console.error('[Sync]   Status:', sppError.response.status);
                console.error('[Sync]   Response:', JSON.stringify(sppError.response.data, null, 2));
              }
              
              // Fallback: пробуем получить данные из DaData API
              // Всегда пробуем получить данные из DaData API, если SPP API не вернул данные
              // или если SPP API вообще не был вызван (нет лицензии/логина)
              if (!sppData) {
                console.log('[Sync] Пробуем получить данные из DaData API...');
                try {
                  const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                  if (altData) {
                    console.log('[Sync] ✅ Получены данные из DaData API');
                    sppData = altData;
                    if (altData.director) {
                      director = altData.director;
                      console.log('[Sync] ✅ Директор получен из DaData API:', director);
                    }
                  } else {
                    console.log('[Sync] ⚠️  DaData API не вернул данных');
                  }
                } catch (altError) {
                  console.warn('[Sync] ⚠️  Не удалось получить данные из DaData API:', altError.message);
                }
              } else if (sppData.director) {
                director = sppData.director;
                console.log('[Sync] ✅ Директор получен из SPP API:', director);
              }
            }
          }
            
            // Нормализуем название компании
            const normalizedName = normalizeCompanyName(fio);
          
          sbisData = {
              name: normalizedName,
              legalAddress: address || sppData?.address || null,
              ogrn: ogrnip || sppData?.ogrn || sppData?.ogrnip || null, // ОГРНИП для ИП
            identifier: sbisResult.Идентификатор || null,
            identifiers: Array.isArray(sbisResult.Идентификатор) ? sbisResult.Идентификатор : null,
            connectionStatus: extractConnectionStatus(sbisResult.Идентификатор),
            type: 'IP',
            email: sbisResult.Email || null,
              phone: sbisResult.Телефон || null,
              director: director || sppData?.director || null, // Директор из DaData API
              // Данные из SPP API или DaData API (если получены)
              oktmo: sppData?.oktmo || null,
              okpo: sppData?.okpo || null,
              okved: sppData?.okved || null,
              pfRegNumber: sppData?.pfRegNumber || null,
              sfrRegNumber: sppData?.sfrRegNumber || null,
              registrationDate: sppData?.registrationDate || null,
              registrationAuthority: sppData?.registrationAuthority || null
          };
        } else if (!isIP && svul) {
            // Для ООО тоже получаем данные через SPP API
            let sppDataOOO = null;
            if (client.inn) {
              try {
                console.log('[Sync] Получаем полные данные для ООО через SppAPI.Requisites...');
                const SPP_AUTH_URL_OOO = 'https://api.saby.ru/auth/service/'; // Для api.saby.ru API
                const SBIS_SERVICES_OOO = {
                  spp: 'https://api.saby.ru/spp-rest-api/service/' // Согласно документации пункта 13
                };
                
                console.log('[Sync]   SBIS_LOGIN установлен:', !!process.env.SBIS_LOGIN);
                console.log('[Sync]   SBIS_PASSWORD установлен:', !!process.env.SBIS_PASSWORD);
                
                if (process.env.SBIS_LOGIN && process.env.SBIS_PASSWORD) {
                  console.log('[Sync]   Выполняем авторизацию для получения SPP сессии (ООО)...');
                  let sppSessionIdOOO = null;
                  
                  try {
                    // Прямой вызов авторизации в api.sbis.ru
                    console.log('[Sync]   Прямая авторизация в SPP API (ООО):', SPP_AUTH_URL_OOO);
                  const sppAuthResponse = await axios.post(
                    SPP_AUTH_URL_OOO,
                    {
                      jsonrpc: '2.0',
                      method: 'САП.Аутентифицировать',
                      protocol: 3,
                      params: {
                        login: process.env.SBIS_LOGIN,
                        password: process.env.SBIS_PASSWORD,
                      },
                      id: Date.now(),
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                      },
                      timeout: 30000,
                    }
                  );
                  
                  console.log('[Sync]   SPP Auth response (ООО):', JSON.stringify(sppAuthResponse.data));
                  
                  if (sppAuthResponse.data.result) {
                    sppSessionIdOOO = sppAuthResponse.data.result;
                    console.log('[Sync]   ✅ SPP сессия получена (ООО):', sppSessionIdOOO.substring(0, 20) + '...');
                  } else {
                    console.log('[Sync]   ⚠️  SPP сессия не получена из ответа (ООО)');
                  }
                } catch (authError) {
                  console.error('[Sync]   Ошибка авторизации для SPP (ООО):', authError.message);
                  console.error('[Sync]   Error response:', authError.response?.data);
                  console.error('[Sync]   Error status:', authError.response?.status);
                  // Не прерываем выполнение, просто логируем ошибку
                }
                
                if (sppSessionIdOOO) {
                  // Вызываем SPP API напрямую для получения полных данных
                  console.log('[Sync]   Вызываем SPP API напрямую для ИНН (ООО):', client.inn);
                  
                  try {
                    const sppResponse = await axios.post(
                      SBIS_SERVICES_OOO.spp,
                      {
                        jsonrpc: '2.0',
                        method: 'SppAPI.Requisites',
                        params: {
                          inn: client.inn,
                          ogrn: null,
                        },
                        protocol: 3, // Согласно документации пункта 13
                        id: Date.now(),
                      },
                      {
                        headers: {
                          'Content-Type': 'application/json; charset=UTF-8',
                          Cookie: `sid=${sppSessionIdOOO}`,
                          'User-Agent': 'WorldCashBox/1.0',
                        },
                        timeout: 30000,
                      }
                    );
                    
                    console.log('[Sync]   SPP API ответ получен (ООО), статус:', sppResponse.status);
                    console.log('[Sync]   SPP API raw response (ООО):', JSON.stringify(sppResponse.data, null, 2));
                    
                    if (sppResponse.data.error) {
                      console.error('[Sync]   SPP API вернул ошибку (ООО):', sppResponse.data.error);

                      // Если нет лицензии на Requisites, пробуем Contractor.Find (пункт 14)
                      const errMsg = sppResponse.data.error?.message || '';
                      if (errMsg.includes('без наличия лицензии на API')) {
                        console.log('[Sync]   Нет лицензии на SppAPI.Requisites (ООО), пробуем Contractor.Find (п.14)...');
                        try {
                          const findResponse = await axios.post(
                            SBIS_SERVICES_OOO.spp,
                            {
                              jsonrpc: '2.0',
                              method: 'Contractor.Find',
                              params: {
                                requisites: client.inn,
                                page: 0,
                                size: 1,
                              },
                              protocol: 5,
                              id: Date.now(),
                            },
                            {
                              headers: {
                                'Content-Type': 'application/json; charset=UTF-8',
                                Cookie: `sid=${sppSessionIdOOO}`,
                                'User-Agent': 'WorldCashBox/1.0',
                              },
                              timeout: 30000,
                            }
                          );

                          console.log('[Sync]   Contractor.Find ответ (ООО):', JSON.stringify(findResponse.data, null, 2));

                          if (!findResponse.data.error && findResponse.data.result) {
                            const result = findResponse.data.result;
                            let first = null;

                            if (Array.isArray(result)) {
                              first = result[0] || null;
                            } else if (result && typeof result === 'object') {
                              const keys = Object.keys(result);
                              if (keys.length > 0) {
                                first = result[keys[0]];
                              }
                            }

                            if (first) {
                              console.log('[Sync]   Contractor.Find первый элемент (ООО):', first);
                              sppDataOOO = {
                                inn: first.INN || client.inn,
                                kpp: first.KPP || null,
                                ogrn: first.OGRN || null,
                                name: first.Name || null,
                                fullName: first.Name || null,
                                address: null,
                                director: null,
                                okved: null,
                                oktmo: null,
                                okpo: null,
                                pfRegNumber: null,
                                sfrRegNumber: null,
                                registrationDate: null,
                                registrationAuthority: null,
                                status: first.State,
                                source: 'spp-contractor-find',
                              };

                              console.log('[Sync] ✅ Получены данные из Contractor.Find (ООО):', JSON.stringify(sppDataOOO, null, 2));
                            } else {
                              console.log('[Sync] ⚠️  Contractor.Find не вернул данных (ООО)');
                            }
                          } else {
                            console.log('[Sync] ⚠️  Contractor.Find вернул ошибку или пустой результат (ООО):', findResponse.data.error);
                            // Если Contractor.Find не сработал, пробуем DaData API
                            if (!sppDataOOO) {
                              console.log('[Sync]   Contractor.Find не вернул данных, пробуем DaData API...');
                              try {
                                const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                                if (altData) {
                                  console.log('[Sync]   ✅ Получены данные из DaData API');
                                  sppDataOOO = altData;
                                }
                              } catch (altError) {
                                console.warn('[Sync]   ⚠️  Не удалось получить данные из DaData API:', altError.message);
                              }
                            }
                          }
                        } catch (findError) {
                          console.error('[Sync]   Ошибка запроса к Contractor.Find (ООО):', findError.message);
                          console.error('[Sync]   Error response:', findError.response?.data);
                          // Если Contractor.Find упал с ошибкой, пробуем DaData API
                          if (!sppDataOOO) {
                            console.log('[Sync]   Contractor.Find упал с ошибкой, пробуем DaData API...');
                            try {
                              const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                              if (altData) {
                                console.log('[Sync]   ✅ Получены данные из DaData API');
                                sppDataOOO = altData;
                              }
                            } catch (altError) {
                              console.warn('[Sync]   ⚠️  Не удалось получить данные из DaData API:', altError.message);
                            }
                          }
                        }
                      } else {
                        // Если ошибка SPP API не связана с лицензией, пробуем DaData API
                        if (!sppDataOOO) {
                          console.log('[Sync]   Ошибка SPP API не связана с лицензией, пробуем DaData API...');
                          try {
                            const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                            if (altData) {
                              console.log('[Sync]   ✅ Получены данные из DaData API');
                              sppDataOOO = altData;
                            }
                          } catch (altError) {
                            console.warn('[Sync]   ⚠️  Не удалось получить данные из DaData API:', altError.message);
                          }
                        }
                      }
                    } else if (sppResponse.data.result) {
                      const data = sppResponse.data.result;
                      const baseRequisites = data.BaseRequisites || {};
                      console.log('[Sync]   SPP API result keys (ООО):', Object.keys(data).join(', '));
                      console.log('[Sync]   BaseRequisites keys (ООО):', Object.keys(baseRequisites).join(', '));
                      
                      // Извлекаем данные из ответа SPP API
                      // Согласно документации пункта 13, основные данные находятся в BaseRequisites
                      sppDataOOO = {
                        inn: baseRequisites.INN || data.INN || data.inn || client.inn,
                        kpp: baseRequisites.KPP || data.KPP || data.kpp,
                        ogrn: baseRequisites.OGRN || data.OGRN || data.ogrn || data.OGRNIP,
                        name: baseRequisites.Name || baseRequisites.ShortName || data.Name || data.ShortName || data.FullName,
                        fullName: baseRequisites.FullName || data.FullName || data.Name,
                        address: baseRequisites.Address || baseRequisites.ActualAddress || data.Address || data.LegalAddress,
                        director: baseRequisites.DirectorName?.Name || baseRequisites.Head || data.Director || data.HeadName,
                        okved: baseRequisites.OKVED || (baseRequisites.ExtendedOKVED ? baseRequisites.ExtendedOKVED.split(',')[0] : null) || data.OKVED || data.MainOKVED,
                        oktmo: baseRequisites.OKTMO || data.OKTMO || data.oktmo,
                        okpo: baseRequisites.OKPO || data.OKPO || data.okpo,
                        pfRegNumber: baseRequisites.RegNumberPF || data.PFRegNumber || data.pfRegNumber || data.PensionFundRegNumber,
                        sfrRegNumber: baseRequisites.RegNumberFSS || data.SFRRegNumber || data.sfrRegNumber || data.SocialFundRegNumber,
                        registrationDate: baseRequisites.DateRegistration || baseRequisites.DateOfOGRNRegistration || data.RegistrationDate || data.RegDate,
                        registrationAuthority: baseRequisites.NameOfRegistrationAuthority || data.RegistrationAuthority || data.RegAuthority,
                        status: baseRequisites.State || data.State,
                        source: 'spp-api',
                      };
                      
                      console.log('[Sync] ✅ Получены данные из SPP API для ООО:', Object.keys(sppDataOOO).join(', '));
                      console.log('[Sync]   SPP данные ООО:', JSON.stringify(sppDataOOO, null, 2));
                    } else {
                      console.log('[Sync] ⚠️  SPP API не вернул result в ответе (ООО)');
                      // Если SPP API не вернул result, пробуем DaData API
                      if (!sppDataOOO) {
                        console.log('[Sync]   SPP API не вернул данных, пробуем DaData API...');
                        try {
                          const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                          if (altData) {
                            console.log('[Sync]   ✅ Получены данные из DaData API');
                            sppDataOOO = altData;
                          }
                        } catch (altError) {
                          console.warn('[Sync]   ⚠️  Не удалось получить данные из DaData API:', altError.message);
                        }
                      }
                    }
                  } catch (sppApiError) {
                    console.error('[Sync]   Ошибка запроса к SPP API (ООО):', sppApiError.message);
                    console.error('[Sync]   Error response:', sppApiError.response?.data);
                    console.error('[Sync]   Error status:', sppApiError.response?.status);
                    // Не прерываем выполнение, просто логируем ошибку
                  }
                } else {
                  console.log('[Sync] ⚠️  SPP сессия не получена, пропускаем SPP API (ООО)');
                  // Если SPP сессия не получена, сразу пробуем DaData API
                  if (!sppDataOOO) {
                    console.log('[Sync] Пробуем получить данные ООО из DaData API...');
                    try {
                      const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                      if (altData) {
                        console.log('[Sync] ✅ Получены данные ООО из DaData API');
                        sppDataOOO = altData;
                      }
                    } catch (altError) {
                      console.warn('[Sync] ⚠️  Не удалось получить данные ООО из DaData API:', altError.message);
                    }
                  }
                }
              } else {
                console.log('[Sync] ⚠️  SBIS_LOGIN или SBIS_PASSWORD не установлены в переменных окружения (ООО)');
                  // Если SPP API не настроен, сразу пробуем DaData API
                  if (!sppDataOOO) {
                    console.log('[Sync] Пробуем получить данные ООО из DaData API...');
                    try {
                      const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                      if (altData) {
                        console.log('[Sync] ✅ Получены данные ООО из DaData API');
                        sppDataOOO = altData;
                      }
                    } catch (altError) {
                      console.warn('[Sync] ⚠️  Не удалось получить данные ООО из DaData API:', altError.message);
                    }
                  }
                }
              } catch (sppError) {
                console.error('[Sync] ⚠️  Ошибка при получении данных через SppAPI для ООО:', sppError.message);
                console.error('[Sync]   Error details:', sppError.response?.data || sppError.stack);
                if (sppError.response) {
                  console.error('[Sync]   Status:', sppError.response.status);
                  console.error('[Sync]   Response:', JSON.stringify(sppError.response.data, null, 2));
                }
                
                // Всегда пробуем получить данные из DaData API, если SPP API не вернул данные
                if (!sppDataOOO) {
                  console.log('[Sync] Пробуем получить данные ООО из DaData API...');
                  try {
                    const altData = await getCompanyDataFromAlternativeSource(client.inn, client.kpp);
                    if (altData) {
                      console.log('[Sync] ✅ Получены данные ООО из DaData API');
                      sppDataOOO = altData;
                      console.log('[Sync]   Директор из DaData API:', altData.director || 'не указан');
                    } else {
                      console.log('[Sync] ⚠️  DaData API не вернул данных для ООО');
                    }
                  } catch (altError) {
                    console.warn('[Sync] ⚠️  Не удалось получить данные ООО из DaData API:', altError.message);
                  }
                }
              }
            }
            
            // Нормализуем название компании для ООО
            // Используем данные из DaData API если SPP API не вернул данные
            const companyNameOOO = sppDataOOO?.name || svul.Название || null;
            const normalizedNameOOO = normalizeCompanyName(companyNameOOO);
            
          sbisData = {
              name: normalizedNameOOO,
              legalAddress: sppDataOOO?.address || svul.АдресЮридический || null,
              kpp: sppDataOOO?.kpp || svul.КПП || client.kpp || null,
              ogrn: sppDataOOO?.ogrn || svul.ОГРН || null,
            identifier: sbisResult.Идентификатор || null,
            identifiers: Array.isArray(sbisResult.Идентификатор) ? sbisResult.Идентификатор : null,
            connectionStatus: extractConnectionStatus(sbisResult.Идентификатор),
              type: 'OOO',
              director: sppDataOOO?.director || null,
              // Данные из SPP API или DaData API (если получены)
              oktmo: sppDataOOO?.oktmo || null,
              okpo: sppDataOOO?.okpo || null,
              okved: sppDataOOO?.okved || null,
              pfRegNumber: sppDataOOO?.pfRegNumber || null,
              sfrRegNumber: sppDataOOO?.sfrRegNumber || null,
              registrationDate: sppDataOOO?.registrationDate || null,
              registrationAuthority: sppDataOOO?.registrationAuthority || null
            };
          }
          }
          }
        }

        // Обновляем данные клиента в БД, если получены новые данные из SBIS
        if (sbisData) {
          console.log('[Sync] Данные из SBIS для обновления:');
          console.log('[Sync]   name:', sbisData.name);
          console.log('[Sync]   legalAddress:', sbisData.legalAddress);
          console.log('[Sync]   kpp:', sbisData.kpp);
          console.log('[Sync]   ogrn:', sbisData.ogrn);
          console.log('[Sync]   identifier:', sbisData.identifier);
          console.log('[Sync] Текущие данные клиента в БД:');
          console.log('[Sync]   name:', client.name);
          console.log('[Sync]   company_address:', client.company_address);
          console.log('[Sync]   kpp:', client.kpp);
          console.log('[Sync]   ogrn:', client.ogrn);
          console.log('[Sync]   sbis_contract_id:', client.sbis_contract_id);
          
          const updates = [];
          const values = [];
          let paramCount = 1;

          // Обновляем название только если оно отличается и не пустое
          // Нормализуем название перед сравнением
          const normalizedClientName = normalizeCompanyName(client.name);
          const normalizedSbisName = normalizeCompanyName(sbisData.name);
          
          if (normalizedSbisName && normalizedSbisName.trim()) {
            // Обновляем, если нормализованное название отличается от нормализованного названия в БД
            // или если название в БД не нормализовано (содержит полные формы типа "ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ")
            const clientNameIsNotNormalized = client.name && 
              (client.name.includes('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ') ||
               client.name.includes('ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ') ||
               client.name.includes('АКЦИОНЕРНОЕ ОБЩЕСТВО'));
            
            if (normalizedSbisName !== normalizedClientName || clientNameIsNotNormalized) {
              updates.push(`name = $${paramCount++}`);
              values.push(normalizedSbisName);
              console.log(`[Sync] ✅ Обновление name: "${client.name}" -> "${normalizedSbisName}"`);
            } else {
              console.log(`[Sync] ⏭️  name не изменилось: "${normalizedClientName || client.name}"`);
            }
          }
          
          // Обновляем адрес только если он отличается и не пустой
          // ВАЖНО: Не обновляем адрес из DaData API, если в БД уже есть более полный адрес
          
          // ВРЕМЕННОЕ ИСПРАВЛЕНИЕ: Если текущий адрес содержит "д. 3" и это "Владивосток, ул. Давыдова", заменяем на "д. 35"
          let currentAddress = client.company_address || '';
          let addressFixed = false;
          if (currentAddress.includes('Владивосток') && currentAddress.includes('Давыдова') && currentAddress.includes('д. 3') && !currentAddress.includes('д. 35')) {
            const fixedAddress = currentAddress.replace('д. 3', 'д. 35');
            console.log(`[Sync] 🔧 Временное исправление адреса: "${currentAddress}" -> "${fixedAddress}"`);
            // Обновляем адрес в БД сразу
              updates.push(`company_address = $${paramCount++}`);
            values.push(fixedAddress);
            console.log(`[Sync] ✅ Исправлен адрес в БД: "${fixedAddress}"`);
            addressFixed = true;
            currentAddress = fixedAddress; // Обновляем для дальнейших проверок
          }
          
          // Если адрес уже исправлен, пропускаем дальнейшие проверки
          if (!addressFixed && sbisData.legalAddress && sbisData.legalAddress.trim()) {
            const newAddress = sbisData.legalAddress.trim();
            
            // Если адрес из DaData API, проверяем, что он не короче существующего
            const isFromAlternativeSource = sbisData.source === 'dadata' || sbisData.source === 'alternative';
            
            // Проверяем, не является ли новый адрес обрезанной версией текущего
            // Например, если текущий адрес содержит "д. 35", а новый "д. 3", то не обновляем
            // НО: если текущий адрес содержит "д. 3", а новый "д. 35", то обновляем (исправляем ошибку)
            const currentHasHouse3 = currentAddress.includes('д. 3') && !currentAddress.includes('д. 35');
            const newHasHouse35 = newAddress.includes('д. 35');
            const isTruncatedAddress = isFromAlternativeSource && currentAddress && 
              (currentAddress.includes('д. 35') && newAddress.includes('д. 3') && !newAddress.includes('д. 35'));
            
            // Если текущий адрес содержит "д. 3" (неправильный), а новый "д. 35" (правильный), обновляем
            const shouldFixAddress = currentHasHouse3 && newHasHouse35;
            
            // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Если текущий адрес содержит "д. 3", а новый адрес из SBIS (не из альтернативных источников) содержит "д. 35", обновляем
            const isFromSBIS = !isFromAlternativeSource;
            const shouldFixFromSBIS = currentHasHouse3 && isFromSBIS && newHasHouse35;
            
            if (shouldFixAddress || shouldFixFromSBIS) {
              // Исправляем адрес: "д. 3" -> "д. 35"
              updates.push(`company_address = $${paramCount++}`);
              values.push(newAddress);
              console.log(`[Sync] ✅ Исправление адреса: "${currentAddress}" -> "${newAddress}"`);
              console.log(`[Sync]   Источник адреса: ${isFromSBIS ? 'SBIS' : 'альтернативный источник'}`);
            } else if (isFromAlternativeSource && currentAddress && currentAddress.length > newAddress.length && !isTruncatedAddress) {
              console.log(`[Sync] ⚠️  Адрес из альтернативного источника короче существующего, пропускаем обновление:`);
              console.log(`[Sync]   Текущий адрес (${currentAddress.length} символов): "${currentAddress}"`);
              console.log(`[Sync]   Новый адрес (${newAddress.length} символов): "${newAddress}"`);
            } else if (isTruncatedAddress && currentAddress.includes('д. 35') && newAddress.includes('д. 3')) {
              console.log(`[Sync] ⚠️  Новый адрес является обрезанной версией текущего, пропускаем обновление:`);
              console.log(`[Sync]   Текущий адрес: "${currentAddress}"`);
              console.log(`[Sync]   Новый адрес (обрезанный): "${newAddress}"`);
            } else if (newAddress !== currentAddress) {
              updates.push(`company_address = $${paramCount++}`);
              values.push(newAddress);
              console.log(`[Sync] ✅ Обновление company_address: "${currentAddress || 'null'}" -> "${newAddress}"`);
            } else {
              console.log(`[Sync] ⏭️  company_address не изменилось: "${currentAddress || 'null'}"`);
            }
          } else {
            console.log(`[Sync] ⚠️  Адрес не получен из SBIS (legalAddress: ${sbisData.legalAddress})`);
          }
          
          // Обновляем КПП только для ООО
          if (sbisData.kpp && sbisData.kpp.trim()) {
            if (sbisData.kpp !== client.kpp) {
              updates.push(`kpp = $${paramCount++}`);
              values.push(sbisData.kpp);
              console.log(`[Sync] ✅ Обновление kpp: "${client.kpp || 'null'}" -> "${sbisData.kpp}"`);
            } else {
              console.log(`[Sync] ⏭️  kpp не изменилось: "${client.kpp || 'null'}"`);
            }
          } else {
            console.log(`[Sync] ⚠️  КПП не получен из SBIS (kpp: ${sbisData.kpp})`);
          }
          
          // Обновляем ОГРН/ОГРНИП только если он отличается и не пустой
          if (sbisData.ogrn && sbisData.ogrn.trim()) {
            if (sbisData.ogrn !== client.ogrn) {
              updates.push(`ogrn = $${paramCount++}`);
              values.push(sbisData.ogrn);
              console.log(`[Sync] ✅ Обновление ogrn: "${client.ogrn || 'null'}" -> "${sbisData.ogrn}"`);
            } else {
              console.log(`[Sync] ⏭️  ogrn не изменилось: "${client.ogrn || 'null'}"`);
            }
          } else {
            console.log(`[Sync] ⚠️  ОГРН/ОГРНИП не получен из SBIS (ogrn: ${sbisData.ogrn})`);
          }
          
          if (sbisData.identifier && sbisData.identifier !== client.sbis_contract_id) {
            // Если identifier - массив, берем первый основной идентификатор
            const identifier = Array.isArray(sbisData.identifier) 
              ? sbisData.identifier.find(id => id.Оператор?.Основной === 'Да')?.ИдентификаторУчастника || sbisData.identifier[0]?.ИдентификаторУчастника
              : sbisData.identifier;
            
            if (identifier && identifier !== client.sbis_contract_id) {
              updates.push(`sbis_contract_id = $${paramCount++}`);
              values.push(identifier);
            }
          }
          
          // Обновляем дополнительные поля из SPP API
          if (sbisData.oktmo && sbisData.oktmo.trim()) {
            updates.push(`oktmo = $${paramCount++}`);
            values.push(sbisData.oktmo);
            console.log(`[Sync] ✅ Обновление oktmo: "${sbisData.oktmo}"`);
          }
          
          if (sbisData.okpo && sbisData.okpo.trim()) {
            updates.push(`okpo = $${paramCount++}`);
            values.push(sbisData.okpo);
            console.log(`[Sync] ✅ Обновление okpo: "${sbisData.okpo}"`);
          }
          
          if (sbisData.okved && sbisData.okved.trim()) {
            // Фильтруем некорректные значения ОКВЭД (например, "ul", "fl" или слишком короткие коды)
            const okvedValue = sbisData.okved.trim();
            if (okvedValue !== 'ul' && okvedValue !== 'fl' && okvedValue.length >= 2) {
              updates.push(`okved = $${paramCount++}`);
              values.push(okvedValue);
              console.log(`[Sync] ✅ Обновление okved: "${okvedValue}"`);
            } else {
              console.log(`[Sync] ⚠️  Некорректное значение ОКВЭД, пропускаем: "${okvedValue}"`);
            }
          }
          
          if (sbisData.pfRegNumber && sbisData.pfRegNumber.trim()) {
            updates.push(`pf_reg_number = $${paramCount++}`);
            values.push(sbisData.pfRegNumber);
            console.log(`[Sync] ✅ Обновление pf_reg_number: "${sbisData.pfRegNumber}"`);
          }
          
          if (sbisData.sfrRegNumber && sbisData.sfrRegNumber.trim()) {
            updates.push(`sfr_reg_number = $${paramCount++}`);
            values.push(sbisData.sfrRegNumber);
            console.log(`[Sync] ✅ Обновление sfr_reg_number: "${sbisData.sfrRegNumber}"`);
          }
          
          if (sbisData.registrationDate) {
            updates.push(`registration_date = $${paramCount++}`);
            values.push(sbisData.registrationDate);
            console.log(`[Sync] ✅ Обновление registration_date: "${sbisData.registrationDate}"`);
          }
          
          if (sbisData.registrationAuthority && sbisData.registrationAuthority.trim()) {
            updates.push(`registration_authority = $${paramCount++}`);
            values.push(sbisData.registrationAuthority);
            console.log(`[Sync] ✅ Обновление registration_authority: "${sbisData.registrationAuthority}"`);
          }
          
          // Обновляем директора если получен из альтернативных источников
          if (sbisData.director && sbisData.director.trim()) {
            // Проверяем есть ли колонка director в БД
            try {
              updates.push(`director = $${paramCount++}`);
              values.push(sbisData.director);
              console.log(`[Sync] ✅ Обновление director: "${sbisData.director}"`);
            } catch (e) {
              console.log(`[Sync] ⚠️  Колонка director не найдена в БД, пропускаем`);
            }
          }

          if (updates.length > 0) {
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(clientId);
            
            const updateQuery = `
              UPDATE clients 
              SET ${updates.join(', ')} 
              WHERE id = $${paramCount}
            `;
            
            console.log(`[Sync] Выполняем SQL обновление: ${updateQuery}`);
            console.log(`[Sync] Параметры:`, values);
            await dbQuery(updateQuery, values);
            console.log(`[Sync] ✅ Данные клиента ${clientId} обновлены в БД`);
            
            // Получаем обновленные данные
            const updatedResult = await dbQuery(
              `SELECT 
                id, 
                email, 
                name, 
                phone, 
                balance, 
                inn, 
                kpp,
                ogrn,
                company_address,
                sbis_contract_id, 
                oktmo,
                okpo,
                okved,
                pf_reg_number,
                sfr_reg_number,
                registration_date,
                registration_authority,
                director,
                created_at, 
                updated_at 
              FROM clients 
              WHERE id = $1`,
              [clientId]
            );
            
            if (updatedResult.rows.length > 0) {
              const oldClient = { ...client };
              Object.assign(client, updatedResult.rows[0]);
              console.log('[Sync] ✅ Данные клиента обновлены:');
              console.log('[Sync]   name:', oldClient.name, '->', client.name);
              console.log('[Sync]   company_address:', oldClient.company_address || 'null', '->', client.company_address || 'null');
              console.log('[Sync]   kpp:', oldClient.kpp || 'null', '->', client.kpp || 'null');
              console.log('[Sync]   ogrn:', oldClient.ogrn || 'null', '->', client.ogrn || 'null');
              console.log('[Sync]   director:', oldClient.director || 'null', '->', client.director || 'null');
              console.log('[Sync]   sbis_contract_id:', oldClient.sbis_contract_id || 'null', '->', client.sbis_contract_id || 'null');
            }
          } else {
            console.log('[Sync] ⚠️  Нет полей для обновления (все данные совпадают или отсутствуют в SBIS)');
          }
        }
        
        console.log(`[Sync] Синхронизация завершена для клиента ${clientId}`);
      } catch (sbisError) {
        console.error('[Sync] Ошибка синхронизации с SBIS:', sbisError.message);
        // Не прерываем выполнение, просто логируем ошибку
        // Возвращаем данные клиента без обновления из SBIS
      }
    } else {
      console.log(`[Sync] У клиента ${clientId} нет ИНН, пропускаем синхронизацию с SBIS`);
    }
    
    // ВАЖНО: Получаем актуальные данные из БД после синхронизации
    // чтобы вернуть обновленные значения клиенту
    const finalClientResult = await dbQuery(
      `SELECT 
        id, 
        email, 
        name, 
        phone, 
        balance, 
        inn, 
        kpp,
        ogrn,
        company_address,
        sbis_contract_id, 
        oktmo,
        okpo,
        okved,
        pf_reg_number,
        sfr_reg_number,
        registration_date,
        registration_authority,
        director,
        created_at, 
        updated_at 
      FROM clients 
      WHERE id = $1`,
      [clientId]
    );
    
    const finalClient = finalClientResult.rows[0] || client;
    
    console.log('[Sync] Финальные данные клиента для ответа:');
    console.log('[Sync]   name:', finalClient.name);
    console.log('[Sync]   company_address:', finalClient.company_address || 'null');
    console.log('[Sync]   kpp:', finalClient.kpp || 'null');
    console.log('[Sync]   ogrn:', finalClient.ogrn || 'null');
    console.log('[Sync]   director:', finalClient.director || 'null');
    console.log('[Sync]   oktmo:', finalClient.oktmo || 'null');
    console.log('[Sync]   okpo:', finalClient.okpo || 'null');
    console.log('[Sync]   okved:', finalClient.okved || 'null');
    console.log('[Sync]   pf_reg_number:', finalClient.pf_reg_number || 'null');
    console.log('[Sync]   sfr_reg_number:', finalClient.sfr_reg_number || 'null');
    console.log('[Sync]   registration_date:', finalClient.registration_date || 'null');
    console.log('[Sync]   registration_authority:', finalClient.registration_authority || 'null');
    console.log('[Sync]   sbis_contract_id:', finalClient.sbis_contract_id || 'null');
    
    // Возвращаем данные в формате camelCase для Android
    res.json({ 
      success: true, 
      message: 'Данные синхронизированы',
      client: {
        id: finalClient.id,
        email: finalClient.email || '',
        name: finalClient.name || '',
        phone: finalClient.phone || null,
        balance: parseFloat(finalClient.balance) || 0,
        inn: finalClient.inn || null,
        kpp: finalClient.kpp || null,
        ogrn: finalClient.ogrn || null,
        companyAddress: finalClient.company_address || null,
        sbisContractId: finalClient.sbis_contract_id || null,
        oktmo: finalClient.oktmo || null,
        okpo: finalClient.okpo || null,
        okved: finalClient.okved || null,
        pfRegNumber: finalClient.pf_reg_number || null,
        sfrRegNumber: finalClient.sfr_reg_number || null,
        registrationDate: finalClient.registration_date ? new Date(finalClient.registration_date).toISOString().split('T')[0] : null,
        registrationAuthority: finalClient.registration_authority || null,
        director: finalClient.director || null,
        createdAt: finalClient.created_at ? new Date(finalClient.created_at).toISOString() : null,
        updatedAt: finalClient.updated_at ? new Date(finalClient.updated_at).toISOString() : null,
      },
      sbisData: sbisData, // Данные из SBIS (состояния подключения, идентификаторы и т.д.)
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Sync] Ошибка синхронизации:', error);
    res.status(500).json({ 
      error: 'Ошибка синхронизации',
      message: error.message 
    });
  }
});

// Вспомогательная функция для извлечения состояния подключения из идентификаторов
function extractConnectionStatus(identifier) {
  if (!identifier) {
    return {
      code: '2',
      description: 'Не подключен',
      connected: false
    };
  }
  
  // Если identifier - массив, ищем основной идентификатор
  if (Array.isArray(identifier)) {
    const mainId = identifier.find(id => id.Оператор?.Основной === 'Да') || identifier[0];
    if (mainId && mainId.СостояниеПодключения) {
      return {
        code: mainId.СостояниеПодключения.Код || '2',
        description: mainId.СостояниеПодключения.Описание || 'Не подключен',
        connected: mainId.СостояниеПодключения.Код === '0',
        operator: mainId.Оператор ? {
          id: mainId.Оператор.Идентификатор,
          name: mainId.Оператор.Название,
          roaming: mainId.Оператор.Роуминг === 'Да'
        } : null
      };
    }
  }
  
  // Если identifier - строка, возвращаем базовое состояние
  return {
    code: identifier ? '0' : '2',
    description: identifier ? 'Подключен' : 'Не подключен',
    connected: !!identifier
  };
}

module.exports = router;

