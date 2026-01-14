/**
 * Полный тест CRM workflow:
 * 1. Создание/поиск контрагента (организация)
 * 2. Создание клиента (физ. лицо)
 * 3. Получение темы отношений
 * 4. Создание сделки по клиенту
 */

const axios = require('axios');

const API_URL = 'http://localhost:3000/api/sbis-proxy';
const SBIS_LOGIN = 'tenditnika';
const SBIS_PASSWORD = 'Tenditnik1!';
const TEST_INN = '253812528630'; // Ваш реальный ИНН

async function testFullWorkflow() {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 ПОЛНЫЙ ТЕСТ CRM WORKFLOW');
  console.log('='.repeat(70) + '\n');

  try {
    // ========================================
    // 1. АВТОРИЗАЦИЯ
    // ========================================
    console.log('1️⃣  АВТОРИЗАЦИЯ');
    console.log('─'.repeat(70));
    
    const authResponse = await axios.post(`${API_URL}/auth`, {
      login: SBIS_LOGIN,
      password: SBIS_PASSWORD,
    });

    if (!authResponse.data.success) {
      console.log('❌ Авторизация не удалась');
      return;
    }

    console.log('✅ Авторизация успешна\n');

    // ========================================
    // 2. СОЗДАНИЕ/ПОИСК КОНТРАГЕНТА (ОРГАНИЗАЦИЯ)
    // ========================================
    console.log('2️⃣  СОЗДАНИЕ/ПОИСК КОНТРАГЕНТА');
    console.log('─'.repeat(70));
    console.log(`ℹ️  ИНН: ${TEST_INN}`);

    const contractorResponse = await axios.post(`${API_URL}/crm-client-oauth`, {
      inn: TEST_INN,
    });

    if (!contractorResponse.data.success) {
      console.log('❌ Контрагент не найден/не создан');
      console.log('   Ошибка:', contractorResponse.data.error || 'Неизвестная ошибка');
      return;
    }

    const contractorId = contractorResponse.data.data.contractor.id;
    console.log(`✅ Контрагент найден/создан`);
    console.log(`   ID: ${contractorId}`);
    console.log(`   ИНН: ${contractorResponse.data.data.contractor.inn}`);
    console.log(`   Название: ${contractorResponse.data.data.contractor.name || 'N/A'}\n`);

    // ========================================
    // 3. СОЗДАНИЕ КЛИЕНТА (ФИЗИЧЕСКОЕ ЛИЦО)
    // ========================================
    console.log('3️⃣  СОЗДАНИЕ КЛИЕНТА (ФИЗИЧЕСКОЕ ЛИЦО)');
    console.log('─'.repeat(70));

    const customerResponse = await axios.post(`${API_URL}/crm-create-customer`, {
      surname: 'Тестов',
      name: 'Иван',
      patronymic: 'Петрович',
      gender: 0,
      address: 'г. Москва, ул. Тестовая, д. 1',
      phone: '+7 (999) 123-45-67',
      email: 'test@example.com',
    });

    if (!customerResponse.data.success) {
      console.log('❌ Ошибка создания клиента:', customerResponse.data.error);
      return;
    }

    const customerId = customerResponse.data.customerId;
    console.log('✅ Клиент создан');
    console.log(`   ID: ${customerId}`);
    console.log(`   ФИО: Тестов Иван Петрович\n`);

    // ========================================
    // 4. ПОЛУЧЕНИЕ ТЕМЫ ОТНОШЕНИЙ
    // ========================================
    console.log('4️⃣  ПОЛУЧЕНИЕ ТЕМЫ ОТНОШЕНИЙ');
    console.log('─'.repeat(70));

    const themeResponse = await axios.post(`${API_URL}/crm-get-themes`, {
      themeName: 'Продажи',
    });

    if (!themeResponse.data.success) {
      console.log('❌ Ошибка получения темы:', themeResponse.data.error);
      console.log('⚠️  Попробуем использовать дефолтную тему...');
      
      // Пробуем получить первую доступную тему
      const themeResponse2 = await axios.post(`${API_URL}/crm-get-themes`, {
        themeName: 'Отчетность и бухгалтерия', // Из логов теста
      });
      
      if (!themeResponse2.data.success) {
        console.log('❌ Не удалось получить тему отношений');
        console.log('ℹ️  Пропускаем создание сделки...\n');
        
        console.log('='.repeat(70));
        console.log('✅ ТЕСТ ЗАВЕРШЕН (частично)');
        console.log('='.repeat(70));
        console.log('\n📊 РЕЗУЛЬТАТЫ:');
        console.log(`   ✅ Контрагент создан (ID: ${contractorId})`);
        console.log(`   ✅ Клиент создан (ID: ${customerId})`);
        console.log(`   ⚠️  Сделка не создана (нет темы)\n`);
        return;
      }

      var themeId = themeResponse2.data.theme.d.Регламент;
      var themeName = themeResponse2.data.theme.d.НаименованиеТемы;
    } else {
      var themeId = themeResponse.data.theme.d.Регламент;
      var themeName = themeResponse.data.theme.d.НаименованиеТемы;
    }

    console.log('✅ Тема получена');
    console.log(`   ID: ${themeId}`);
    console.log(`   Название: ${themeName}\n`);

    // ========================================
    // 5. СОЗДАНИЕ СДЕЛКИ
    // ========================================
    console.log('5️⃣  СОЗДАНИЕ СДЕЛКИ');
    console.log('─'.repeat(70));

    const leadResponse = await axios.post(`${API_URL}/crm-create-lead`, {
      clientId: contractorId, // Используем ID контрагента
      themeId: themeId,
      userConds: {
        'Источник': 'Мобильное приложение',
        'Комментарий': 'Тестовая сделка из API',
      },
      nomenclatures: [
        {
          code: 'SERVICE-001',
          price: 5000,
          count: 1,
        },
      ],
    });

    if (!leadResponse.data.success) {
      console.log('❌ Ошибка создания сделки:', leadResponse.data.error);
      console.log('\n⚠️  Возможно, для создания сделок нужны дополнительные права');
    } else {
      console.log('✅ Сделка создана');
      console.log(`   Результат:`, JSON.stringify(leadResponse.data.lead).substring(0, 200));
    }

    // ========================================
    // ИТОГИ
    // ========================================
    console.log('\n' + '='.repeat(70));
    console.log('✅ ТЕСТ ЗАВЕРШЕН');
    console.log('='.repeat(70));
    console.log('\n📊 РЕЗУЛЬТАТЫ:');
    console.log(`   ✅ Контрагент (ID: ${contractorId})`);
    console.log(`   ✅ Клиент (ID: ${customerId})`);
    console.log(`   ✅ Тема: ${themeName}`);
    if (leadResponse.data.success) {
      console.log(`   ✅ Сделка создана`);
    } else {
      console.log(`   ⚠️  Сделка не создана`);
    }
    console.log('');

    console.log('💡 NEXT STEPS:');
    console.log('   1. Используйте эти ID для привязки к вашим пользователям');
    console.log('   2. Сохраните контрагента в вашей БД PostgreSQL');
    console.log('   3. Добавьте эти методы в мобильное приложение\n');

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFullWorkflow();

