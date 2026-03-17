const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

const SBIS_API_URL = 'https://online.sbis.ru/service/';

// Ключ для шифрования паролей (в продакшене должен быть в переменных окружения)
// Если ключ не указан, используем JWT_SECRET или генерируем фиксированный ключ
const ENCRYPTION_KEY = process.env.SBIS_ENCRYPTION_KEY || 
                       process.env.JWT_SECRET?.substring(0, 64) || 
                       'default-encryption-key-32-chars-long!!'; // Фиксированный ключ по умолчанию
const ALGORITHM = 'aes-256-cbc';

/**
 * Получает ключ шифрования нужной длины (32 байта)
 */
function getEncryptionKey() {
  // Если ключ в hex формате (64 символа), используем его
  if (ENCRYPTION_KEY.length === 64 && /^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
    return Buffer.from(ENCRYPTION_KEY, 'hex');
  }
  // Иначе используем хеш от строки для получения 32 байт
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Шифрует пароль для безопасного хранения
 */
function encryptPassword(password) {
  if (!password) return null;
  try {
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (e) {
    console.error('[SBIS] Ошибка шифрования пароля:', e.message);
    return null;
  }
}

/**
 * Расшифровывает пароль
 */
function decryptPassword(encryptedPassword) {
  if (!encryptedPassword) return null;
  try {
    const parts = encryptedPassword.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('[SBIS] Ошибка расшифровки пароля:', e.message);
    return null;
  }
}

// Хранилище для кода 2FA (можно обновлять через API без перезапуска сервера)
let current2FACode = process.env.SBIS_2FA_CODE || null;

// Кэш для сохранения сессии после успешного подтверждения 2FA
// Структура: { sid: string, expiresAt: number, resourceId: string, methodToValidate: string }
let cached2FASession = null;
const SESSION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах

// Хранилище сессий пользователей СБИС
// Ключ: userId (из приложения), Значение: { sid, expiresAt, login }
const userSessions = new Map();
const USER_SESSION_TTL = 24 * 60 * 60 * 1000; // 24 часа

// Временное хранилище для данных 2FA по пользователям
// Ключ: userId, Значение: { sessionId, resourceId, methodToValidate, login }
const pending2FA = new Map();

/**
 * Проверяет, валидна ли кэшированная сессия 2FA
 * @returns {string|null} sid если сессия валидна, иначе null
 */
function getCached2FASession() {
  if (cached2FASession && cached2FASession.expiresAt > Date.now()) {
    console.log('[KKT API] ✅ Используем кэшированную сессию 2FA (истекает через', Math.round((cached2FASession.expiresAt - Date.now()) / 1000 / 60), 'минут)');
    return cached2FASession.sid;
  }
  if (cached2FASession) {
    console.log('[KKT API] ⚠️ Кэшированная сессия 2FA истекла');
    cached2FASession = null;
  }
  return null;
}

/**
 * Сохраняет сессию после успешного подтверждения 2FA
 * @param {string} sid - идентификатор сессии
 * @param {string} resourceId - идентификатор ресурса
 * @param {string} methodToValidate - метод для валидации
 */
function cache2FASession(sid, resourceId, methodToValidate) {
  cached2FASession = {
    sid: sid,
    expiresAt: Date.now() + SESSION_CACHE_TTL,
    resourceId: resourceId,
    methodToValidate: methodToValidate
  };
  console.log('[KKT API] ✅ Сессия 2FA сохранена в кэш (действительна 24 часа)');
}

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken);

/**
 * GET /api/sbis-resources/credentials
 * Получение сохраненных данных СБИС (логин, заметки)
 * Пароль не возвращается из соображений безопасности
 */
router.get('/credentials', async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в приложении'
      });
    }
    
    const { dbQuery } = require('../database/init');
    const result = await dbQuery(
      'SELECT sbis_login, sbis_notes FROM clients WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }
    
    const client = result.rows[0];
    
    res.json({
      success: true,
      data: {
        login: client.sbis_login || null,
        hasPassword: !!client.sbis_password, // Только флаг, что пароль сохранен
        notes: client.sbis_notes || null
      }
    });
  } catch (error) {
    console.error('[SBIS Credentials] Ошибка получения данных:', error.message);
    res.status(500).json({
      success: false,
      error: 'Ошибка при получении данных',
      details: error.message
    });
  }
});

/**
 * PUT /api/sbis-resources/credentials
 * Сохранение/обновление данных СБИС (логин, пароль, заметки)
 * 
 * Body: { login?: "user@example.com", password?: "password", notes?: "Заметки" }
 */
router.put('/credentials', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { login, password, notes } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в приложении'
      });
    }
    
    const { dbQuery } = require('../database/init');
    
    // Получаем текущие данные
    const currentResult = await dbQuery(
      'SELECT sbis_login, sbis_password, sbis_notes FROM clients WHERE id = $1',
      [userId]
    );
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }
    
    const current = currentResult.rows[0];
    
    // Обновляем только переданные поля
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (login !== undefined) {
      updates.push(`sbis_login = $${paramIndex++}`);
      values.push(login || null);
    }
    
    if (password !== undefined) {
      if (password) {
        // Шифруем пароль перед сохранением
        const encryptedPassword = encryptPassword(password);
        updates.push(`sbis_password = $${paramIndex++}`);
        values.push(encryptedPassword);
      } else {
        // Если передан пустой пароль, удаляем его
        updates.push(`sbis_password = $${paramIndex++}`);
        values.push(null);
      }
    }
    
    if (notes !== undefined) {
      updates.push(`sbis_notes = $${paramIndex++}`);
      values.push(notes || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Не указаны данные для обновления'
      });
    }
    
    values.push(userId);
    const updateQuery = `
      UPDATE clients 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
    `;
    
    await dbQuery(updateQuery, values);
    
    console.log(`[SBIS Credentials] Данные обновлены для пользователя ${userId}`);
    
    res.json({
      success: true,
      message: 'Данные успешно сохранены',
      data: {
        login: login !== undefined ? (login || null) : current.sbis_login,
        hasPassword: password !== undefined ? !!password : !!current.sbis_password,
        notes: notes !== undefined ? (notes || null) : current.sbis_notes
      }
    });
  } catch (error) {
    console.error('[SBIS Credentials] Ошибка сохранения данных:', error.message);
    res.status(500).json({
      success: false,
      error: 'Ошибка при сохранении данных',
      details: error.message
    });
  }
});

/**
 * POST /api/sbis-resources/auth
 * Авторизация пользователя в СБИС с его логином и паролем
 * Автоматически определяет, требуется ли 2FA
 * 
 * Body: { login: "user@example.com", password: "password" }
 * Returns: { 
 *   success: true, 
 *   requires2FA: true/false,
 *   sid?: "session_id", // если 2FA не требуется
 *   sessionId?: "...", // если требуется 2FA
 *   resourceId?: "...",
 *   methodToValidate?: "..."
 * }
 */
router.post('/auth', async (req, res) => {
  try {
    let { login, password } = req.body;
    const userId = req.user?.id; // ID пользователя из приложения
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в приложении'
      });
    }
    
    // Если login/password не переданы, пытаемся использовать сохраненные данные
    if (!login || !password) {
      const { dbQuery } = require('../database/init');
      const result = await dbQuery(
        'SELECT sbis_login, sbis_password FROM clients WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length > 0 && result.rows[0].sbis_login && result.rows[0].sbis_password) {
        login = login || result.rows[0].sbis_login;
        password = password || decryptPassword(result.rows[0].sbis_password);
        console.log(`[SBIS Auth] Используются сохраненные данные для пользователя ${userId}`);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Логин и пароль обязательны',
          message: 'Укажите логин и пароль или сохраните их через PUT /api/sbis-resources/credentials'
        });
      }
    }
    
    if (!login || !password) {
      return res.status(400).json({
        success: false,
        error: 'Логин и пароль обязательны'
      });
    }
    
    console.log(`[SBIS Auth] Пользователь ${userId} пытается авторизоваться в СБИС с логином: ${login}`);
    
    const SBIS_OFD_AUTH_URL = 'https://api.sbis.ru/oauth/service/';
    const SBIS_OFD_APP_CLIENT_ID = process.env.SBIS_OFD_APP_CLIENT_ID || '9626671909002956';
    
    // Пункт 23: Аутентификация через POST https://api.sbis.ru/oauth/service/
    try {
      const authResponse = await axios.post(SBIS_OFD_AUTH_URL, {
        app_client_id: SBIS_OFD_APP_CLIENT_ID,
        login: login,
        password: password,
      }, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        timeout: 30000,
        validateStatus: () => true,
      });
      
      console.log('[SBIS Auth] Response status:', authResponse.status);
      console.log('[SBIS Auth] Response data:', JSON.stringify(authResponse.data).substring(0, 500));
      
      // Проверяем, требуется ли 2FA
      const errorText = authResponse.data?.error || '';
      const requires2FA = 
        authResponse.data?.code === 303 || 
        authResponse.data?.error?.code === 303 ||
        ((authResponse.status === 400 || authResponse.status === 401) && 
        (errorText.includes('Требуется подтверждение действия') || errorText.includes('подтверждение')));
      
      if (requires2FA) {
        console.log('[SBIS Auth] Требуется 2FA для пользователя', userId);
        
        let dump = authResponse.data?.dump || authResponse.data?.error?.dump;
        
        // Если dump нет, пробуем через online.sbis.ru
        if (!dump || !dump.ResourceID || !dump.SessionID || !dump.MethodToValidate) {
          console.log('[SBIS Auth] dump не найден, пробуем через online.sbis.ru...');
          try {
            const onlineAuthResponse = await axios.post('https://online.sbis.ru/oauth/service/', {
              app_client_id: SBIS_OFD_APP_CLIENT_ID,
              login: login,
              password: password,
            }, {
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
              },
              timeout: 30000,
              validateStatus: () => true,
            });
            
            dump = onlineAuthResponse.data?.dump || onlineAuthResponse.data?.error?.dump;
          } catch (e) {
            console.error('[SBIS Auth] Ошибка при запросе к online.sbis.ru:', e.message);
          }
        }
        
        if (!dump || !dump.ResourceID || !dump.SessionID || !dump.MethodToValidate) {
          return res.status(401).json({
            success: false,
            error: 'Требуется двухфакторная аутентификация, но данные для 2FA не получены',
            requires2FA: true
          });
        }
        
        // Сохраняем данные 2FA для пользователя (включая пароль для последующего сохранения)
        pending2FA.set(userId, {
          sessionId: dump.SessionID,
          resourceId: dump.ResourceID,
          methodToValidate: dump.MethodToValidate,
          login: login,
          password: req.body.password || null // Сохраняем пароль, если он был передан
        });
        
        // Отправляем код на телефон пользователя (пункт 24)
        try {
          const sendCodeResponse = await axios.post('https://online.sbis.ru/service/?srv=1', {
            jsonrpc: '2.0',
            method: 'ExtSdk2.AuthSendCode',
            params: {
              ResourceID: dump.ResourceID,
              SessionID: dump.SessionID
            },
            id: Date.now()
          }, {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            timeout: 30000,
            validateStatus: () => true,
          });
          
          console.log('[SBIS Auth] Код 2FA отправлен на телефон пользователя');
          
          return res.json({
            success: true,
            requires2FA: true,
            message: 'Код подтверждения отправлен на ваш телефон',
            sessionId: dump.SessionID,
            resourceId: dump.ResourceID,
            methodToValidate: dump.MethodToValidate
          });
        } catch (e) {
          console.error('[SBIS Auth] Ошибка отправки кода 2FA:', e.message);
          return res.status(500).json({
            success: false,
            error: 'Ошибка при отправке кода подтверждения',
            requires2FA: true
          });
        }
      } else if (authResponse.status === 200 && authResponse.data?.sid) {
        // 2FA не требуется, сохраняем сессию
        const sid = authResponse.data.sid;
        userSessions.set(userId, {
          sid: sid,
          expiresAt: Date.now() + USER_SESSION_TTL,
          login: login
        });
        
        // Сохраняем логин и пароль в БД, если они были переданы в запросе
        if (req.body.login && req.body.password) {
          try {
            const { dbQuery } = require('../database/init');
            const encryptedPassword = encryptPassword(req.body.password);
            await dbQuery(
              'UPDATE clients SET sbis_login = $1, sbis_password = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
              [req.body.login, encryptedPassword, userId]
            );
            console.log('[SBIS Auth] Логин и пароль сохранены для пользователя', userId);
          } catch (saveError) {
            console.error('[SBIS Auth] Ошибка сохранения данных:', saveError.message);
            // Не прерываем процесс, если не удалось сохранить
          }
        }
        
        console.log('[SBIS Auth] ✅ Авторизация успешна без 2FA для пользователя', userId);
        
        return res.json({
          success: true,
          requires2FA: false,
          sid: sid,
          message: 'Авторизация успешна'
        });
      } else {
        const errorMsg = authResponse.data?.error || authResponse.data?.message || 'Неизвестная ошибка';
        console.error('[SBIS Auth] Ошибка авторизации:', errorMsg);
        return res.status(authResponse.status || 401).json({
          success: false,
          error: 'Ошибка авторизации в СБИС',
          details: errorMsg
        });
      }
    } catch (e) {
      console.error('[SBIS Auth] Исключение при авторизации:', e.message);
      if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
        return res.status(504).json({
          success: false,
          error: 'Превышено время ожидания ответа от СБИС'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Ошибка при авторизации в СБИС',
        details: e.message
      });
    }
  } catch (error) {
    console.error('[SBIS Auth] Критическая ошибка:', error.message);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
      details: error.message
    });
  }
});

/**
 * POST /api/sbis-resources/confirm-2fa
 * Подтверждение кода двухфакторной аутентификации
 * 
 * Body: { code: "123456" }
 * Returns: { success: true, sid: "session_id" }
 */
router.post('/confirm-2fa', async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user?.id;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Код 2FA обязателен'
      });
    }
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в приложении'
      });
    }
    
    const pendingData = pending2FA.get(userId);
    if (!pendingData) {
      return res.status(400).json({
        success: false,
        error: 'Нет активного процесса 2FA. Сначала выполните авторизацию через /auth'
      });
    }
    
    const { sessionId, resourceId, methodToValidate, login } = pendingData;
    
    console.log(`[SBIS 2FA] Пользователь ${userId} подтверждает код 2FA`);
    
    // Пункт 25: AuthConfirmCode
    try {
      const confirmCodeResponse = await axios.post('https://online.sbis.ru/service/?srv=1', {
        jsonrpc: '2.0',
        method: 'ExtSdk2.AuthConfirmCode',
        params: {
          Param: {
            Код: String(code).trim(),
            Идентификатор: resourceId,
            ВызываемыйМетод: methodToValidate
          }
        },
        id: Date.now()
      }, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        timeout: 30000,
        validateStatus: () => true,
      });
      
      console.log('[SBIS 2FA] ConfirmCode response:', JSON.stringify(confirmCodeResponse.data).substring(0, 300));
      
      if (confirmCodeResponse.data?.result && !confirmCodeResponse.data?.error) {
        // По документации пункта 25, результат AuthConfirmCode - это sid, который можно использовать
        const sid = confirmCodeResponse.data.result;
        
        if (sid) {
          // Сохраняем сессию для пользователя
          userSessions.set(userId, {
            sid: sid,
            expiresAt: Date.now() + USER_SESSION_TTL,
            login: login
          });
          
          // Сохраняем логин и пароль в БД, если они были переданы
          const password = pendingData.password;
          if (login && password) {
            try {
              const { dbQuery } = require('../database/init');
              const encryptedPassword = encryptPassword(password);
              await dbQuery(
                'UPDATE clients SET sbis_login = $1, sbis_password = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                [login, encryptedPassword, userId]
              );
              console.log('[SBIS 2FA] Логин и пароль сохранены для пользователя', userId);
            } catch (saveError) {
              console.error('[SBIS 2FA] Ошибка сохранения данных:', saveError.message);
              // Не прерываем процесс, если не удалось сохранить
            }
          }
          
          // Удаляем данные 2FA
          pending2FA.delete(userId);
          
          console.log('[SBIS 2FA] ✅ 2FA подтверждена, сессия сохранена для пользователя', userId);
          
          return res.json({
            success: true,
            sid: sid,
            message: 'Код подтвержден, авторизация успешна'
          });
        } else {
          return res.status(401).json({
            success: false,
            error: 'Не удалось получить сессию после подтверждения 2FA'
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          error: 'Неверный код подтверждения',
          details: confirmCodeResponse.data?.error || 'Проверьте код и попробуйте снова'
        });
      }
    } catch (e) {
      console.error('[SBIS 2FA] Ошибка подтверждения кода:', e.message);
      return res.status(500).json({
        success: false,
        error: 'Ошибка при подтверждении кода 2FA',
        details: e.message
      });
    }
  } catch (error) {
    console.error('[SBIS 2FA] Критическая ошибка:', error.message);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
      details: error.message
    });
  }
});

// Получаем сессию через внутренний вызов API
async function checkSession(userId) {
  const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    await axios.post(
      `${apiBaseUrl}/api/sbis-proxy/proxy`,
      {
        method: 'СБИС.ИнформацияОПользователе',
        params: {},
        userId: userId || 'default',
      },
      { timeout: 5000 }
    );
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Попытка получить список ККТ через JSON-RPC API СБИС (online.sbis.ru)
 * Используется как запасной вариант когда OFD REST API не находит ИНН.
 * Причина: клиент может использовать другой ОФД-оператор, но сами ККТ
 * могут быть зарегистрированы в базе СБИС как оборудование.
 */
async function tryKktViaJsonRpc(inn, userId) {
  try {
    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    
    // Методы для перебора — от наиболее вероятных к менее
    const methods = [
      // Оборудование / КАссовые аппараты через ОФД модуль СБИС
      { name: 'ОФД.СписокКасс', params: { Контрагент: { ИНН: inn } } },
      { name: 'ОФД.КаccыСписок', params: { ИНН: inn } },
      // Общий список оборудования
      { name: 'СБИС.СписокОборудования', params: { Фильтр: { КонтрагентИНН: inn, Тип: 'ккт' } } },
      { name: 'СБИС.СписокОборудования', params: { Фильтр: { КонтрагентИНН: inn } } },
      // Контрагент — список ТО и оборудования
      { name: 'КонтрагентТО.Список', params: { Контрагент: { ИНН: inn } } },
      // Розница
      { name: 'Розница.СписокКасс', params: { КонтрагентИНН: inn } },
      { name: 'Kkt.List', params: { inn: inn } },
    ];

    for (const method of methods) {
      try {
        console.log(`🔍 Пробуем JSON-RPC метод: ${method.name}`);
        const resp = await axios.post(
          `${apiBaseUrl}/api/sbis-proxy/proxy`,
          { method: method.name, params: method.params, userId: userId || 'default' },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        
        if (resp.data?.result && !resp.data?.error) {
          const raw = resp.data.result;
          const list = Array.isArray(raw) ? raw
            : (raw?.Кассы || raw?.Список || raw?.items || raw?.data || []);
          
          if (Array.isArray(list) && list.length > 0) {
            console.log(`✅ ${method.name} вернул ${list.length} записей`);
            return list.map((kkt) => ({
              factoryId: kkt.ЗаводскойНомер || kkt.factoryId || kkt.SerialNumber || null,
              model: kkt.Модель || kkt.model || kkt.Model || null,
              fsNumber: kkt.НомерФН || kkt.fsNumber || kkt.FiscalDriveNumber || null,
              fsFinishDate: kkt.ДатаОкончанияФН || kkt.fsFinishDate || null,
              regId: kkt.РегНомер || kkt.regId || kkt.reg_id || kkt.KktId || null,
              status: kkt.Статус || kkt.status || 0,
              organizationName: kkt.НазваниеОрганизации || kkt.organizationName || null,
              kktSalesPoint: kkt.ТочкаПродаж || kkt.kktSalesPoint || null,
              address: kkt.Адрес || kkt.address || null,
              kpp: kkt.КПП || kkt.kpp || null,
              firstShiftDate: kkt.firstShiftDate || null,
              licenseStartDate: kkt.licenseStartDate || null,
              licenseFinishDate: kkt.licenseFinishDate || null,
              metadata: kkt
            }));
          }
        }
      } catch (e) {
        console.log(`  ↳ ${method.name}: ${e.message}`);
      }
    }
    
    console.warn('⚠️  Все JSON-RPC методы исчерпаны, ккт не найдены');
    return [];
  } catch (e) {
    console.error('tryKktViaJsonRpc error:', e.message);
    return [];
  }
}

/**
 * POST /api/sbis-resources/get-fn-list
 * Получение списка фискальных накопителей из СБИС
 * 
 * Документация: https://saby.ru/help/integration/api/ofd
 */
router.post('/get-fn-list', async (req, res) => {
  try {
    const { userId, contractorINN } = req.body;
    
    if (!(await checkSession(userId))) {
      return res.status(401).json({ error: 'Требуется авторизация в СБИС' });
    }

    console.log('=== Getting FN list from SBIS ===');

    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Пробуем разные методы API ОФД для получения ФН
    const methods = [
      {
        name: 'ОФД.СписокФН',
        params: {
          Контрагент: {
            ИНН: contractorINN,
          },
        },
      },
      {
        name: 'СБИС.СписокФН',
        params: {
          Фильтр: {
            КонтрагентИНН: contractorINN,
          },
        },
      },
      {
        name: 'ОФД.ПолучитьФН',
        params: {
          ИНН: contractorINN,
        },
      },
    ];

    for (const method of methods) {
      try {
        const response = await axios.post(
          `${apiBaseUrl}/api/sbis-proxy/proxy`,
          {
            method: method.name,
            params: method.params,
            userId: userId || 'default',
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
          }
        );

        if (response.data?.result && !response.data?.error) {
          console.log(`✅ ${method.name} worked`);
          
          const fnList = Array.isArray(response.data.result)
            ? response.data.result
            : response.data.result?.ФН || response.data.result?.Список || [];

          const formattedFN = fnList.map((fn) => ({
            id: fn.Идентификатор || fn.id,
            serial_number: fn.СерийныйНомер || fn.НомерФН || fn.serial_number,
            model: fn.Модель || fn.model,
            registration_date: fn.ДатаРегистрации || fn.registration_date,
            expiry_date: fn.ДатаОкончания || fn.expiry_date,
            status: fn.Статус || fn.status,
            ofd_name: fn.ОФД || fn.ofd_name,
            metadata: fn,
          }));

          return res.json({
            success: true,
            method: method.name,
            data: formattedFN,
          });
        }
      } catch (methodError) {
        console.log(`Method ${method.name} failed:`, methodError.message);
      }
    }

    // Если ни один метод не сработал
    res.json({
      success: false,
      message: 'API методы для получения ФН недоступны',
      data: [],
    });
  } catch (error) {
    console.error('Get FN list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sbis-resources/get-licenses
 * Получение лицензий (Эвотор, Атол и др.) из СБИС
 */
router.post('/get-licenses', async (req, res) => {
  try {
    const { userId, contractorINN, licenseType } = req.body;
    
    if (!(await checkSession(userId))) {
      return res.status(401).json({ error: 'Требуется авторизация в СБИС' });
    }

    console.log('=== Getting licenses from SBIS ===');

    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Пробуем получить лицензии через номенклатуру или CRM
    const methods = [
      {
        name: 'СБИС.СписокНоменклатуры',
        params: {
          Фильтр: {
            Тип: 'Услуга',
            Наименование: licenseType ? `*${licenseType}*` : undefined,
          },
          Навигация: {
            Количество: 100,
          },
        },
      },
      {
        name: 'CRMLead.СписокЛицензий',
        params: {
          Контрагент: {
            ИНН: contractorINN,
          },
        },
      },
    ];

    const licenses = [];

    for (const method of methods) {
      try {
        const response = await axios.post(
          `${apiBaseUrl}/api/sbis-proxy/proxy`,
          {
            method: method.name,
            params: method.params,
            userId: userId || 'default',
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
          }
        );

        if (response.data?.result && !response.data?.error) {
          const items = Array.isArray(response.data.result)
            ? response.data.result
            : response.data.result?.Номенклатура || response.data.result?.Лицензии || [];

          for (const item of items) {
            const name = item.Наименование || item.name || '';
            let type = 'license';

            if (name.toLowerCase().includes('эвотор')) {
              type = 'evotor';
            } else if (name.toLowerCase().includes('атол')) {
              type = 'atol';
            }

            licenses.push({
              id: item.Идентификатор || item.id,
              name: name,
              type: type,
              price: parseFloat(item.Цена || item.price || 0),
              expiry_date: item.ДатаОкончания || item.expiry_date,
              status: item.Статус || item.status || 'active',
              metadata: item,
            });
          }
        }
      } catch (methodError) {
        console.log(`Method ${method.name} failed:`, methodError.message);
      }
    }

    res.json({
      success: true,
      data: licenses,
    });
  } catch (error) {
    console.error('Get licenses error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sbis-resources/get-ofd-subscriptions
 * Получение подписок ОФД из СБИС
 */
router.post('/get-ofd-subscriptions', async (req, res) => {
  try {
    const { userId, contractorINN } = req.body;
    
    if (!(await checkSession(userId))) {
      return res.status(401).json({ error: 'Требуется авторизация в СБИС' });
    }

    console.log('=== Getting OFD subscriptions from SBIS ===');

    const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Пробуем получить подписки ОФД
    const methods = [
      {
        name: 'ОФД.СписокПодписок',
        params: {
          Контрагент: {
            ИНН: contractorINN,
          },
        },
      },
      {
        name: 'СБИС.СписокПодписокОФД',
        params: {
          Фильтр: {
            КонтрагентИНН: contractorINN,
          },
        },
      },
    ];

    for (const method of methods) {
      try {
        const response = await axios.post(
          `${apiBaseUrl}/api/sbis-proxy/proxy`,
          {
            method: method.name,
            params: method.params,
            userId: userId || 'default',
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
          }
        );

        if (response.data?.result && !response.data?.error) {
          const subscriptions = Array.isArray(response.data.result)
            ? response.data.result
            : response.data.result?.Подписки || [];

          const formatted = subscriptions.map((sub) => ({
            id: sub.Идентификатор || sub.id,
            name: sub.Название || sub.name || 'Подписка ОФД',
            ofd_name: sub.ОФД || sub.ofd_name,
            start_date: sub.ДатаНачала || sub.start_date,
            expiry_date: sub.ДатаОкончания || sub.expiry_date,
            price: parseFloat(sub.Цена || sub.price || 0),
            status: sub.Статус || sub.status,
            metadata: sub,
          }));

          return res.json({
            success: true,
            method: method.name,
            data: formatted,
          });
        }
      } catch (methodError) {
        console.log(`Method ${method.name} failed:`, methodError.message);
      }
    }

    res.json({
      success: false,
      message: 'API методы для получения подписок ОФД недоступны',
      data: [],
    });
  } catch (error) {
    console.error('Get OFD subscriptions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sbis-resources/set-2fa-code
 * Установка кода двухфакторной аутентификации для автоматической обработки 2FA
 * 
 * Body: { code: "123456" }
 */
router.post('/set-2fa-code', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Код 2FA не указан',
        instructions: 'Отправьте код в формате: { "code": "123456" }'
      });
    }
    current2FACode = String(code).trim();
    console.log('========================================');
    console.log('[KKT API] ✅ Код 2FA установлен:', current2FACode);
    console.log('[KKT API] Система автоматически попытается подтвердить код...');
    console.log('========================================');
    res.json({
      success: true,
      message: 'Код 2FA установлен. Система автоматически попытается подтвердить его при следующем запросе.',
      code: current2FACode.replace(/\d/g, '*') // Показываем только звездочки для безопасности
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка при установке кода 2FA'
    });
  }
});

/**
 * GET /api/sbis-resources/kkts
 * Получение списка ККТ (контрольно-кассовой техники) по организации из СБИС ОФД API
 * 
 * Документация: пункт 19 из sbis_api.txt
 * GET https://api.sbis.ru/ofd/v1/orgs/<inn>/kkts?status=<status>
 */
router.get('/kkts', async (req, res) => {
  console.log('========================================');
  console.log('[KKT API] === ЗАПРОС НА ПОЛУЧЕНИЕ ККТ ===');
  console.log('[KKT API] Реализация строго по документации: пункт 19');
  console.log('========================================');
  
  try {
    const { inn, status } = req.query;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в приложении'
      });
    }
    
    // Получаем ИНН из query или из данных клиента
    let clientInn = inn;
    if (!clientInn) {
      const { dbQuery } = require('../database/init');
      const clientResult = await dbQuery(
        'SELECT inn FROM clients WHERE id = $1',
        [userId]
      );
      if (clientResult.rows.length > 0) {
        clientInn = clientResult.rows[0].inn;
      }
    }
    
    if (!clientInn) {
      return res.status(400).json({ 
        success: false,
        error: 'ИНН не найден. Укажите ИНН в параметрах запроса или в профиле клиента.' 
      });
    }

    clientInn = String(clientInn).trim().replace(/\s+/g, '');
    console.log('[KKT API] ИНН для запроса:', clientInn);
    console.log('[KKT API] Пользователь:', userId);

    // Получаем сессию пользователя из хранилища
    const userSession = userSessions.get(userId);
    let sid = null;
    
    if (userSession && userSession.expiresAt > Date.now()) {
      sid = userSession.sid;
      console.log('[KKT API] ✅ Используем сессию пользователя (истекает через', Math.round((userSession.expiresAt - Date.now()) / 1000 / 60), 'минут)');
    } else {
      if (userSession) {
        console.log('[KKT API] ⚠️ Сессия пользователя истекла');
        userSessions.delete(userId);
      }
      
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в СБИС',
        requiresAuth: true,
        message: 'Сначала выполните авторизацию через POST /api/sbis-resources/auth с вашими логином и паролем от СБИС'
      });
    }
    
    if (!sid) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в СБИС',
        requiresAuth: true,
        message: 'Сначала выполните авторизацию через POST /api/sbis-resources/auth с вашими логином и паролем от СБИС'
      });
    }

    // Пункт 19: Список ККТ по организации
    // GET https://api.sbis.ru/ofd/v1/orgs/<inn>/kkts?status=<status>
    // Cookie: sid (строго по документации)
    console.log('[KKT API] Пункт 19: Получение списка ККТ...');
    const statusParam = status ? `?status=${status}` : '';
    const kktUrl = `https://api.sbis.ru/ofd/v1/orgs/${clientInn}/kkts${statusParam}`;
    
    try {
      // Пункт 19: Используем только Cookie: sid (строго по документации)
      const kktResponse = await axios.get(kktUrl, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cookie': `sid=${sid}`
        },
        timeout: 30000,
        validateStatus: () => true
      });
      
      console.log('[KKT API] Пункт 19: Response status:', kktResponse.status);
      console.log('[KKT API] Пункт 19: Response data:', JSON.stringify(kktResponse.data).substring(0, 500));
      
      if (kktResponse.status === 200 && !kktResponse.data?.error) {
        let data = [];
        if (Array.isArray(kktResponse.data)) {
          data = kktResponse.data;
        } else if (kktResponse.data && typeof kktResponse.data === 'object') {
          if (kktResponse.data.regId || kktResponse.data.factoryId) {
            data = [kktResponse.data];
          } else if (Array.isArray(kktResponse.data.data)) {
            data = kktResponse.data.data;
          } else if (Array.isArray(kktResponse.data.kkts)) {
            data = kktResponse.data.kkts;
          }
        }

        const kktData = data.map((kkt) => {
          // Обрабатываем kpp: может быть пустой строкой, нужно конвертировать в null
          let kppValue = null;
          if (kkt.kpp !== undefined && kkt.kpp !== null && String(kkt.kpp).trim() !== '') {
            kppValue = String(kkt.kpp).trim();
          }
          
          // Обрабатываем kktSalesPointSPPId: может быть числом или строкой
          let sppIdValue = null;
          if (kkt.kktSalesPointSPPId !== undefined && kkt.kktSalesPointSPPId !== null) {
            sppIdValue = String(kkt.kktSalesPointSPPId);
          } else if (kkt.kkt_sales_point_spp_id !== undefined && kkt.kkt_sales_point_spp_id !== null) {
            sppIdValue = String(kkt.kkt_sales_point_spp_id);
          }
          
          return {
            factoryId: kkt.factoryId || kkt.factory_id || null,
            model: kkt.model || null,
            fsNumber: kkt.fsNumber || kkt.fs_number || null,
            fsFinishDate: kkt.fsFinishDate || kkt.fs_finish_date || null,
            regId: kkt.regId || kkt.reg_id || null,
            status: parseInt(kkt.status) || 0,
            organizationName: kkt.organizationName || kkt.organization_name || null,
            kktSalesPoint: kkt.kktSalesPoint || kkt.kkt_sales_point || null,
            kktSalesPointSPPId: sppIdValue,
            address: kkt.address || null,
            kpp: kppValue,
            firstShiftDate: kkt.firstShiftDate || kkt.firstShiftdate || kkt.first_shift_date || null,
            licenseStartDate: kkt.licenseStartDate || kkt.license_start_date || null,
            licenseFinishDate: kkt.licenseFinishDate || kkt.license_finish_date || null,
            metadata: kkt
          };
        });
        
        console.log(`[KKT API] ✅ Пункт 19: Получено ${kktData.length} ККТ`);
        
        return res.json({
          success: true,
          data: kktData,
          count: kktData.length
        });
      } else if (kktResponse.data?.error) {
        const errMsg = kktResponse.data.error.message || 'Ошибка СБИС';
        const errDetails = kktResponse.data.error.details || '';
        console.error('[KKT API] Пункт 19: Ошибка:', errMsg, errDetails);
        
        if (errMsg.includes('недостаточно прав') || errMsg.includes('заблокирован') || errDetails.includes('заблокирован')) {
          return res.status(403).json({
            success: false,
            error: 'У вас нет прав на доступ к ОФД API. Проверьте настройки вашего аккаунта в СБИС.',
            details: errDetails || errMsg
          });
        }
        
        return res.status(kktResponse.status || 500).json({
          success: false,
          error: errMsg,
          details: errDetails
        });
      } else {
        return res.status(kktResponse.status || 500).json({
          success: false,
          error: 'Ошибка при запросе к СБИС ОФД'
        });
      }
    } catch (e) {
      if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
        return res.status(504).json({
          success: false,
          error: 'Превышено время ожидания ответа от СБИС ОФД. Попробуйте позже.'
        });
      }
      console.error('[KKT API] Пункт 19: Ошибка при запросе:', e.message);
      return res.status(500).json({
        success: false,
        error: 'Ошибка при запросе к СБИС ОФД API',
        details: e.message
      });
    }
  } catch (error) {
    console.error('[KKT API] Общая ошибка при получении списка ККТ:', error.message);
    res.status(500).json({
      success: false,
      error: 'Ошибка при получении списка ККТ',
      details: error.message
    });
  }
});

/**
 * GET /api/sbis-resources/storages
 * Получение списка фискальных накопителей по ККТ из СБИС ОФД API
 * 
 * Документация: пункт 20 из sbis_api.txt
 * GET https://api.sbis.ru/ofd/v1/orgs/<inn>/kkts/<regId>/storages?status=<status>
 */
router.get('/storages', async (req, res) => {
  console.log('========================================');
  console.log('[FN API] === ЗАПРОС НА ПОЛУЧЕНИЕ ФИСКАЛЬНЫХ НАКОПИТЕЛЕЙ ===');
  console.log('[FN API] Реализация строго по документации: пункт 20');
  console.log('========================================');
  
  try {
    const { inn, regId, status } = req.query;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в приложении'
      });
    }
    
    if (!regId) {
      return res.status(400).json({ 
        success: false,
        error: 'regId (регистрационный номер ККТ) обязателен' 
      });
    }
    
    // Получаем ИНН из query или из данных клиента
    let clientInn = inn;
    if (!clientInn) {
      const { dbQuery } = require('../database/init');
      const clientResult = await dbQuery(
        'SELECT inn FROM clients WHERE id = $1',
        [userId]
      );
      if (clientResult.rows.length > 0) {
        clientInn = clientResult.rows[0].inn;
      }
    }
    
    if (!clientInn) {
      return res.status(400).json({ 
        success: false,
        error: 'ИНН не найден. Укажите ИНН в параметрах запроса или в профиле клиента.' 
      });
    }

    clientInn = String(clientInn).trim().replace(/\s+/g, '');
    console.log('[FN API] ИНН для запроса:', clientInn);
    console.log('[FN API] Регистрационный номер ККТ:', regId);
    console.log('[FN API] Пользователь:', userId);

    // Получаем сессию пользователя из хранилища
    const userSession = userSessions.get(userId);
    let sid = null;
    
    if (userSession && userSession.expiresAt > Date.now()) {
      sid = userSession.sid;
      console.log('[FN API] ✅ Используем сессию пользователя (истекает через', Math.round((userSession.expiresAt - Date.now()) / 1000 / 60), 'минут)');
    } else {
      if (userSession) {
        console.log('[FN API] ⚠️ Сессия пользователя истекла');
        userSessions.delete(userId);
      }
      
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в СБИС',
        requiresAuth: true,
        message: 'Сначала выполните авторизацию через POST /api/sbis-resources/auth с вашими логином и паролем от СБИС'
      });
    }
    
    if (!sid) {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в СБИС',
        requiresAuth: true,
        message: 'Сначала выполните авторизацию через POST /api/sbis-resources/auth с вашими логином и паролем от СБИС'
      });
    }

    // Пункт 20: Список фискальных накопителей по ККТ
    // GET https://api.sbis.ru/ofd/v1/orgs/<inn>/kkts/<regId>/storages?status=<status>
    // Cookie: sid (строго по документации)
    console.log('[FN API] Пункт 20: Получение списка фискальных накопителей...');
    const statusParam = status ? `?status=${status}` : '';
    const storageUrl = `https://api.sbis.ru/ofd/v1/orgs/${clientInn}/kkts/${regId}/storages${statusParam}`;
    
    try {
      // Пункт 20: Используем только Cookie: sid (строго по документации)
      const storageResponse = await axios.get(storageUrl, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cookie': `sid=${sid}`
        },
        timeout: 30000,
        validateStatus: () => true
      });
      
      console.log('[FN API] Пункт 20: Response status:', storageResponse.status);
      console.log('[FN API] Пункт 20: Response data:', JSON.stringify(storageResponse.data).substring(0, 500));
      
      if (storageResponse.status === 200 && !storageResponse.data?.error) {
        let data = [];
        if (Array.isArray(storageResponse.data)) {
          data = storageResponse.data;
        } else if (storageResponse.data && typeof storageResponse.data === 'object') {
          if (storageResponse.data.storageId || storageResponse.data.storage_id) {
            data = [storageResponse.data];
          } else if (Array.isArray(storageResponse.data.data)) {
            data = storageResponse.data.data;
          } else if (Array.isArray(storageResponse.data.storages)) {
            data = storageResponse.data.storages;
          }
        }

        // Пункт 20: Маппинг всех полей согласно документации
        const storageData = data.map((storage) => {
          const effectiveFrom = storage.effectiveFrom || storage.effective_from || null;
          const effectiveTo = storage.effectiveTo || storage.effective_to || null;
          const fsFinishDate = storage.fsFinishDate || storage.fs_finish_date || null;
          
          // Вычисляем workDurationDays (количество дней работы)
          let workDurationDays = null;
          if (effectiveFrom) {
            const fromDate = new Date(effectiveFrom);
            const toDate = effectiveTo ? new Date(effectiveTo) : new Date();
            workDurationDays = Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24));
          }
          
          // Вычисляем daysRemaining (осталось дней до окончания срока действия)
          let daysRemaining = null;
          if (fsFinishDate) {
            const finishDate = new Date(fsFinishDate);
            const now = new Date();
            daysRemaining = Math.floor((finishDate - now) / (1000 * 60 * 60 * 24));
          }
          
          // Определяем isActive (активен ли накопитель)
          const isActive = !effectiveTo && (effectiveFrom ? new Date(effectiveFrom) <= new Date() : false);
          
          return {
            // Пункт 20: Все поля из документации
            storageId: storage.storageId || storage.storage_id || null,
            model: storage.model || null,
            status: parseInt(storage.status) || 0,
            effectiveFrom: effectiveFrom,
            effectiveTo: effectiveTo,
            fsFinishDate: fsFinishDate,
            workDurationDays: workDurationDays,
            daysRemaining: daysRemaining,
            isActive: isActive,
            metadata: storage
          };
        });
        
        console.log(`[FN API] ✅ Пункт 20: Получено ${storageData.length} фискальных накопителей`);
        
        return res.json({
          success: true,
          data: storageData,
          count: storageData.length
        });
      } else if (storageResponse.data?.error) {
        const errMsg = storageResponse.data.error.message || 'Ошибка СБИС';
        const errDetails = storageResponse.data.error.details || '';
        console.error('[FN API] Пункт 20: Ошибка:', errMsg, errDetails);
        
        if (errMsg.includes('недостаточно прав') || errMsg.includes('заблокирован') || errDetails.includes('заблокирован')) {
          return res.status(403).json({
            success: false,
            error: 'У вас нет прав на доступ к ОФД API. Проверьте настройки вашего аккаунта в СБИС.',
            details: errDetails || errMsg
          });
        }
        
        if (errMsg.includes('не найден') || errDetails.includes('не найден')) {
          return res.status(404).json({
            success: false,
            error: 'Фискальные накопители не найдены для указанной ККТ',
            details: errDetails || errMsg
          });
        }
        
        return res.status(storageResponse.status || 500).json({
          success: false,
          error: errMsg,
          details: errDetails
        });
      } else {
        return res.status(storageResponse.status || 500).json({
          success: false,
          error: 'Ошибка при запросе к СБИС ОФД'
        });
      }
    } catch (e) {
      if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
        return res.status(504).json({
          success: false,
          error: 'Превышено время ожидания ответа от СБИС ОФД. Попробуйте позже.'
        });
      }
      console.error('[FN API] Ошибка при запросе к СБИС ОФД:', e);
      return res.status(500).json({
        success: false,
        error: 'Ошибка при получении списка фискальных накопителей',
        details: e.message
      });
    }
  } catch (error) {
    console.error('[FN API] Общая ошибка:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Ошибка при получении списка фискальных накопителей',
      details: error.message
    });
  }
});

module.exports = router;
