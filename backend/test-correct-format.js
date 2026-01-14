/**
 * Тест с правильным форматом из документации (Python example)
 */

const axios = require('axios');

const SBIS_LOGIN = 'tenditnika';
const SBIS_PASSWORD = 'Tenditnik1!';
const TEST_INN = '253812528630';

async function testCorrectFormat() {
  console.log('\n🧪 ТЕСТ: Правильный формат из документации\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Авторизация С ПРАВИЛЬНЫМ ФОРМАТОМ
    console.log('\n1️⃣ Авторизация (с "Параметр" и "protocol": 2)...');
    const authResponse = await axios.post('https://online.sbis.ru/auth/service/', {
      jsonrpc: '2.0',
      method: 'СБИС.Аутентифицировать',
      params: {
        Параметр: {  // <-- ВАЖНО: обертка "Параметр"
          Логин: SBIS_LOGIN,
          Пароль: SBIS_PASSWORD,
        },
      },
      protocol: 2,  // <-- ВАЖНО: protocol версия 2
      id: 0,
    }, {
      headers: {
        'Host': 'online.sbis.ru',
        'Content-Type': 'application/json-rpc; charset=utf-8',
        'Accept': 'application/json-rpc',
      },
    });
    
    if (!authResponse.data.result) {
      console.log('❌ Авторизация не удалась');
      console.log(authResponse.data.error);
      return;
    }
    
    const sessionId = authResponse.data.result;
    console.log('✅ Авторизация успешна');
    console.log(`   Session: ${sessionId.substring(0, 30)}...\n`);
    
    // 2. Контрагент.ПоИННКППКФ С ПРАВИЛЬНЫМ ФОРМАТОМ
    console.log('2️⃣ Контрагент.ПоИННКППКФ (правильный формат)...');
    try {
      const contractorResponse = await axios.post('https://online.sbis.ru/service/', {
        jsonrpc: '2.0',
        method: 'Контрагент.ПоИННКППКФ',
        params: {
          params: {  // <-- ВАЖНО: двойная обертка "params"
            d: {
              ИНН: TEST_INN,
              КПП: '',
              Название: '',
            },
            s: {
              ИНН: 'Строка',
              КПП: 'Строка',
              Название: 'Строка',
            },
          },
        },
        protocol: 2,
        id: 0,
      }, {
        headers: {
          'Host': 'online.sbis.ru',
          'Content-Type': 'application/json-rpc; charset=utf-8',
          'Accept': 'application/json-rpc',
          'X-SBISSessionID': sessionId,
        },
      });
      
      if (contractorResponse.data.result) {
        console.log('✅ РАБОТАЕТ! Контрагент найден/создан:');
        console.log(JSON.stringify(contractorResponse.data.result, null, 2));
      } else if (contractorResponse.data.error) {
        console.log('❌ Ошибка:', contractorResponse.data.error.message);
        console.log('   Детали:', JSON.stringify(contractorResponse.data.error, null, 2));
      }
    } catch (error) {
      console.log('❌ Exception:', error.message);
      if (error.response?.status === 404) {
        console.log('   Метод не существует (404)');
      } else if (error.response?.data) {
        console.log('   Response:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    console.log('');
    
    // 3. CRM методы из примера
    const crmMethods = [
      {
        name: 'CRMClients.SaveCustomer',
        params: {
          CustomerData: {
            d: {
              Surname: 'Тестов',
              Name: 'Тест',
              Patronymic: 'Тестович',
              Gender: 0,
              Address: 'Тестовый адрес',
            },
            s: {
              Surname: 'Строка',
              Name: 'Строка',
              Patronymic: 'Строка',
              Gender: 'Число целое',
              Address: 'Строка',
            },
          },
        },
      },
      {
        name: 'CRMLead.getCRMThemeByName',
        params: {
          НаименованиеТемы: 'Продажи',
        },
      },
      {
        name: 'CRMLead.List',
        params: {
          Навигация: {
            Количество: 1,
          },
        },
      },
    ];
    
    console.log('3️⃣ Проверяем CRM методы из примера...\n');
    
    for (const test of crmMethods) {
      try {
        const response = await axios.post('https://online.sbis.ru/service/', {
          jsonrpc: '2.0',
          method: test.name,
          params: test.params,
          protocol: 2,
          id: 0,
        }, {
          headers: {
            'Host': 'online.sbis.ru',
            'Content-Type': 'application/json-rpc; charset=utf-8',
            'Accept': 'application/json-rpc',
            'X-SBISSessionID': sessionId,
          },
          timeout: 5000,
        });
        
        if (response.data.result) {
          console.log(`✅ ${test.name} - РАБОТАЕТ!`);
          console.log(`   Результат: ${JSON.stringify(response.data.result).substring(0, 200)}...`);
        } else if (response.data.error) {
          console.log(`❌ ${test.name} - ${response.data.error.message.substring(0, 80)}`);
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`❌ ${test.name} - 404 (не существует)`);
        } else {
          console.log(`⚠️  ${test.name} - ${error.message.substring(0, 60)}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n💡 РЕЗУЛЬТАТ:\n');
    console.log('Если Контрагент.ПоИННКППКФ заработал - отлично!');
    console.log('Если CRM методы работают - можем создавать клиентов и сделки!\n');
    
  } catch (error) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCorrectFormat();

