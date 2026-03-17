const axios = require('axios');

/**
 * Нормализация названия компании - замена полных форм на сокращения
 */
function normalizeCompanyName(name) {
  if (!name) return name;
  
  let normalized = name;
  
  // Заменяем полные формы на сокращения (регистронезависимо)
  // Важно: используем более гибкие паттерны, которые учитывают возможные пробелы и кавычки
  const replacements = [
    { pattern: /\bОБЩЕСТВО\s+С\s+ОГРАНИЧЕННОЙ\s+ОТВЕТСТВЕННОСТЬЮ\b/gi, replacement: 'ООО' },
    { pattern: /\bОБЩЕСТВО\s+С\s+ОГРАНИЧЕННОЙ\s+ОТВЕТСТВЕННОСТЬЮ\b/gi, replacement: 'ООО' },
    { pattern: /\bИНДИВИДУАЛЬНЫЙ\s+ПРЕДПРИНИМАТЕЛЬ\b/gi, replacement: 'ИП' },
    { pattern: /\bАКЦИОНЕРНОЕ\s+ОБЩЕСТВО\b/gi, replacement: 'АО' },
    { pattern: /\bПУБЛИЧНОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\b/gi, replacement: 'ПАО' },
    { pattern: /\bНЕПУБЛИЧНОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\b/gi, replacement: 'НАО' },
    { pattern: /\bЗАКРЫТОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\b/gi, replacement: 'ЗАО' },
    { pattern: /\bОТКРЫТОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\b/gi, replacement: 'ОАО' },
    { pattern: /\bПОЛНОЕ\s+ТОВАРИЩЕСТВО\b/gi, replacement: 'ПТ' },
    { pattern: /\bТОВАРИЩЕСТВО\s+НА\s+ВЕРЕ\b/gi, replacement: 'ТНВ' },
    { pattern: /\bПРОИЗВОДСТВЕННЫЙ\s+КООПЕРАТИВ\b/gi, replacement: 'ПК' },
    { pattern: /\bПОТРЕБИТЕЛЬСКИЙ\s+КООПЕРАТИВ\b/gi, replacement: 'ПК' },
  ];
  
  replacements.forEach(({ pattern, replacement }) => {
    normalized = normalized.replace(pattern, replacement);
  });
  
  // Убираем лишние пробелы (двойные, тройные и т.д.)
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Получение данных компании из DaData API по ИНН
 * Извлекает все необходимые поля для приложения из JSON ответа DaData
 */
async function getCompanyDataFromAlternativeSource(inn, kpp = null) {
  if (!inn) {
    return null;
  }

  const cleanInn = inn.replace(/\D/g, '');
  
  try {
    const DADATA_API_KEY = process.env.DADATA_API_KEY;
    const DADATA_SECRET = process.env.DADATA_SECRET_KEY || process.env.DADATA_SECRET;
    
    if (!DADATA_API_KEY) {
      console.warn('[CompanyData] ⚠️  DADATA_API_KEY не установлен в переменных окружения');
      return null;
    }
    
    console.log('[CompanyData] Получение данных через DaData API для ИНН:', cleanInn);
    
    // DaData API может работать с одним только API ключом (без секрета)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Token ${DADATA_API_KEY}`
    };
    
    // Добавляем секрет, если он есть
    if (DADATA_SECRET) {
      headers['X-Secret'] = DADATA_SECRET;
    }
    
    const response = await axios.post(
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party',
      {
        query: cleanInn,
        kpp: kpp ? kpp.replace(/\D/g, '') : null
      },
      {
        headers: headers,
        timeout: 15000
      }
    );
    
    if (response.data?.suggestions && response.data.suggestions.length > 0) {
      const company = response.data.suggestions[0].data;
      
      console.log('[CompanyData] ✅ Данные получены из DaData API');
      console.log('[CompanyData] Сырые данные DaData (JSON):', JSON.stringify(company, null, 2));
      
      // Извлекаем ВСЕ необходимые данные из JSON ответа DaData
      // Структура ответа DaData: https://dadata.ru/api/find-party/
      const result = {
        // Основные данные
        name: normalizeCompanyName(
          company.name?.full_with_opf || 
          company.name?.short_with_opf || 
          company.name?.short || 
          company.name?.full || 
          null
        ),
        fullName: normalizeCompanyName(
          company.name?.full_with_opf || 
          company.name?.full || 
          null
        ),
        inn: company.inn || cleanInn,
        kpp: company.kpp || kpp || null,
        ogrn: company.ogrn || null,
        ogrnip: company.ogrnip || null,
        
        // Адрес (полный адрес из DaData)
        address: company.address?.unrestricted_value || 
                 company.address?.value || 
                 company.address?.data?.source || 
                 null,
        
        // Классификаторы
        okved: company.okved || null,
        oktmo: company.address?.data?.oktmo || 
               company.oktmo || 
               null,
        okpo: company.okpo || null,
        
        // Руководитель (директор)
        director: company.management?.name || 
                  (company.management?.post && company.management?.name 
                    ? `${company.management.post} ${company.management.name}` 
                    : null) ||
                  null,
        
        // Регистрационные данные
        registrationDate: company.state?.registration_date || null,
        registrationAuthority: company.state?.registration_authority || 
                              company.state?.registration_authority_name ||
                              null,
        
        // Номера регистрации в ПФР и СФР
        // DaData может возвращать их в разных местах структуры
        pfRegNumber: company.fns_reg_numbers?.pfr || 
                     company.pfr_reg_number || 
                     company.pfr?.reg_number ||
                     null,
        sfrRegNumber: company.fns_reg_numbers?.fss || 
                      company.fss_reg_number || 
                      company.fss?.reg_number ||
                      null,
        
        // Дополнительные данные
        status: company.state?.status || null,
        source: 'dadata'
      };
      
      console.log('[CompanyData] Обработанные данные для приложения:');
      console.log('[CompanyData]   name:', result.name);
      console.log('[CompanyData]   inn:', result.inn);
      console.log('[CompanyData]   kpp:', result.kpp);
      console.log('[CompanyData]   ogrn:', result.ogrn);
      console.log('[CompanyData]   ogrnip:', result.ogrnip);
      console.log('[CompanyData]   address:', result.address);
      console.log('[CompanyData]   okved:', result.okved);
      console.log('[CompanyData]   oktmo:', result.oktmo);
      console.log('[CompanyData]   okpo:', result.okpo);
      console.log('[CompanyData]   director:', result.director);
      console.log('[CompanyData]   registrationDate:', result.registrationDate);
      console.log('[CompanyData]   registrationAuthority:', result.registrationAuthority);
      console.log('[CompanyData]   pfRegNumber:', result.pfRegNumber);
      console.log('[CompanyData]   sfrRegNumber:', result.sfrRegNumber);
      
      return result;
    } else {
      console.warn('[CompanyData] ⚠️  DaData API вернул пустой ответ для ИНН:', cleanInn);
      return null;
    }
  } catch (dadataError) {
    console.error('[CompanyData] ❌ Ошибка DaData API:', dadataError.message);
    if (dadataError.response) {
      console.error('[CompanyData]   Status:', dadataError.response.status);
      console.error('[CompanyData]   Response:', JSON.stringify(dadataError.response.data, null, 2));
    }
    if (dadataError.response?.status === 403) {
      console.error('[CompanyData]   Возможно, закончился бесплатный лимит или неверный API ключ');
    }
    return null;
  }
}

module.exports = {
  normalizeCompanyName,
  getCompanyDataFromAlternativeSource
};
