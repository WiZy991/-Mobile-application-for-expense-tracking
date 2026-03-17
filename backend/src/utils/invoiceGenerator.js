/**
 * Генератор PDF-счетов
 * Создает PDF-счет на основе HTML-шаблона
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const QRCode = require('qrcode');

// Директория для хранения сгенерированных счетов
const INVOICES_DIR = path.join(__dirname, '../../uploads/invoices');

// Убеждаемся, что директория существует
async function ensureInvoicesDir() {
  try {
    await fs.mkdir(INVOICES_DIR, { recursive: true });
  } catch (error) {
    console.error('[Invoice Generator] Ошибка создания директории:', error);
  }
}

/**
 * Генерация QR кода для оплаты
 */
async function generateQRCode(paymentData) {
  try {
    // Формируем строку для QR кода (формат СБП или просто реквизиты)
    const qrString = `ST00012|Name=${paymentData.sellerName}|PersonalAcc=${paymentData.account}|BankName=${paymentData.bankName}|BIC=${paymentData.bik}|CorrespAcc=${paymentData.corrAccount}|PayeeINN=${paymentData.inn}|KPP=${paymentData.kpp || ''}|Sum=${paymentData.amount}|Purpose=Оплата счета ${paymentData.invoiceNumber}`;
    
    // Генерируем QR код как base64
    const qrCodeDataURL = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 150,
      margin: 1
    });
    
    return qrCodeDataURL;
  } catch (error) {
    console.error('[Invoice Generator] Ошибка генерации QR кода:', error);
    return null;
  }
}

/**
 * Генерация HTML-шаблона счета
 */
async function generateInvoiceHTML(invoiceData) {
  const {
    invoiceNumber,
    invoiceDate,
    sellerName,
    sellerINN,
    sellerKPP,
    sellerAddress,
    sellerPhone,
    sellerEmail,
    sellerWebsite,
    sellerBankName,
    sellerBIK,
    sellerAccount,
    sellerCorrAccount,
    buyerName,
    buyerINN,
    buyerKPP,
    buyerAddress,
    buyerPhone,
    items,
    totalAmount,
    totalVAT,
    dealName,
    notes
  } = invoiceData;

  // Форматирование суммы прописью (упрощенная версия)
  function numberToWords(num) {
    const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    
    if (num === 0) return 'ноль';
    
    let result = '';
    const rubles = Math.floor(num);
    const kopecks = Math.round((num - rubles) * 100);
    
    // Обработка рублей
    if (rubles >= 1000) {
      const thousands = Math.floor(rubles / 1000);
      if (thousands === 1) result += 'одна тысяча ';
      else if (thousands === 2) result += 'две тысячи ';
      else if (thousands >= 3 && thousands <= 4) result += ones[thousands] + ' тысячи ';
      else result += ones[thousands] + ' тысяч ';
    }
    
    const remainder = rubles % 1000;
    if (remainder >= 100) {
      result += hundreds[Math.floor(remainder / 100)] + ' ';
    }
    
    const remainderTens = remainder % 100;
    if (remainderTens >= 20) {
      result += tens[Math.floor(remainderTens / 10)] + ' ';
      if (remainderTens % 10 > 0) {
        result += ones[remainderTens % 10] + ' ';
      }
    } else if (remainderTens >= 10) {
      result += teens[remainderTens - 10] + ' ';
    } else if (remainderTens > 0) {
      result += ones[remainderTens] + ' ';
    }
    
    // Определение правильной формы слова "рубль"
    const lastDigit = rubles % 10;
    const lastTwoDigits = rubles % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      result += 'рублей';
    } else if (lastDigit === 1) {
      result += 'рубль';
    } else if (lastDigit >= 2 && lastDigit <= 4) {
      result += 'рубля';
    } else {
      result += 'рублей';
    }
    
    if (kopecks > 0) {
      result += ' ' + kopecks;
      if (kopecks === 1) result += ' копейка';
      else if (kopecks >= 2 && kopecks <= 4) result += ' копейки';
      else result += ' копеек';
    }
    
    return result.trim();
  }

  const totalAmountWords = numberToWords(totalAmount);

  // Форматирование даты
  const formattedDate = invoiceDate || new Date().toLocaleDateString('ru-RU');

  // Генерация строк таблицы товаров
  let itemsRows = '';
  items.forEach((item, index) => {
    const price = parseFloat(item.price || item.Цена || 0);
    const quantity = parseFloat(item.quantity || item.Количество || 1);
    const amount = price * quantity;
    const unit = item.unit || item.ЕдиницаИзмерения || 'шт';
    
    itemsRows += `
      <tr style="height: 1.5em; font-size: 14px;">
        <td style="border-right: 1px solid black; white-space: nowrap; text-align: center; font-size: 9pt;">${index + 1}</td>
        <td style="border-right: 1px solid black;">${item.name || item.Наименование || ''}</td>
        <td style="text-align: right; border-right: 1px solid black; white-space: nowrap;">${quantity.toFixed(2)} ${unit}</td>
        <td style="text-align: right; border-right: 1px solid black; white-space: nowrap;">${price.toFixed(2)}</td>
        <td style="text-align: right; white-space: nowrap;">${amount.toFixed(2)}</td>
      </tr>
    `;
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      margin: 0;
      padding: 0.5cm;
      width: 20cm;
      max-width: 20cm;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    td {
      padding: 3px;
      vertical-align: top;
    }
    .header-table {
      border: 1px solid gray;
      width: 650px;
      float: right;
    }
    .header-table td {
      border: 1px solid rgb(128, 128, 128);
    }
    .items-table {
      border-top: none;
      border-right: none;
      border-left: none;
      border-bottom: 1px solid black;
      width: 100%;
    }
    .items-table thead tr {
      border-bottom: 2px solid black;
      font-size: 9pt;
    }
    .items-table td {
      border-right: 1px solid black;
    }
    .items-table td:last-child {
      border-right: none;
    }
    .signature-table {
      width: 100%;
      font-size: 14px;
    }
    .signature-table td {
      border-bottom: 1px solid black;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .bold {
      font-weight: bold;
    }
    .invoice-title {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <!-- Шапка с реквизитами продавца -->
  <table class="header-table">
    <tr>
      <td rowspan="2" style="width: 10%;"></td>
      <td style="width: 20%;">ИНН ${sellerINN || ''}</td>
      <td style="width: 20%;">КПП ${sellerKPP || ''}</td>
      <td style="width: 10%;" rowspan="2">Р/Счет</td>
      <td style="width: 34%;" rowspan="2">${sellerAccount || ''}</td>
      <td rowspan="4" style="width: 16%; vertical-align: top; text-align: right;">
        ${invoiceData.qrCode ? `<img src="${invoiceData.qrCode}" style="width: 101.79px; height: 101.79px;" alt="QR код для оплаты" />` : ''}
      </td>
    </tr>
    <tr>
      <td colspan="2"><strong>${sellerName || 'Наша организация'}</strong><br>Поставщик (получатель платежа)</td>
    </tr>
    <tr>
      <td rowspan="2"></td>
      <td colspan="2" rowspan="2"><strong>${sellerBankName || 'Банк'}</strong><br>Банк</td>
      <td>БИК</td>
      <td>${sellerBIK || ''}</td>
    </tr>
    <tr>
      <td>Корр.счет</td>
      <td>${sellerCorrAccount || ''}</td>
    </tr>
  </table>

  <p style="clear: both;"><br></p>

  <!-- Адрес и контакты продавца -->
  <table style="width: 100%;">
    <tr>
      <td width="11%" class="text-right">Адрес:</td>
      <td width="89%">${sellerAddress || ''}</td>
    </tr>
    ${sellerPhone ? `
    <tr>
      <td class="text-right">Телефон:</td>
      <td>${sellerPhone}</td>
    </tr>
    ` : ''}
    ${(sellerEmail || sellerWebsite) ? `
    <tr>
      <td class="text-right">${sellerEmail && sellerWebsite ? 'E-mail:' : (sellerEmail ? 'E-mail:' : 'Web:')}</td>
      <td>${sellerEmail || ''}${sellerEmail && sellerWebsite ? ' Web: ' : ''}${sellerWebsite || ''}</td>
    </tr>
    ` : ''}
  </table>

  <p><br></p>

  <!-- Заголовок счета -->
  <p class="invoice-title">
    СЧЕТ № ${invoiceNumber || ''} от ${formattedDate}
  </p>

  <p><br></p>

  <!-- Данные покупателя -->
  <table style="width: 100%;">
    <tr>
      <td width="77px" class="text-right">Покупатель:</td>
      <td width="678px"><strong>${buyerName || ''}</strong>${buyerINN ? `, ИНН ${buyerINN}` : ''}${buyerKPP ? `, КПП ${buyerKPP}` : ''}</td>
    </tr>
    ${buyerAddress ? `
    <tr>
      <td class="text-right">Адрес:</td>
      <td>${buyerAddress}</td>
    </tr>
    ` : ''}
    ${buyerPhone ? `
    <tr>
      <td class="text-right">Телефон:</td>
      <td>${buyerPhone}</td>
    </tr>
    ` : ''}
  </table>

  <p><br></p>

  <!-- Примечание (название сделки) -->
  ${dealName ? `
  <p style="font-size: 9px;">${dealName}</p>
  ` : ''}

  <p style="font-size: 14px;"><br></p>

  <!-- Таблица товаров -->
  <table class="items-table">
    <thead>
      <tr>
        <td style="text-align: center; width: 3%;">№</td>
        <td style="width: 52%;">Наименование</td>
        <td style="text-align: right; width: 9%;">Кол-во</td>
        <td style="text-align: right; width: 9%;">Цена</td>
        <td style="text-align: right; width: 9%;">Сумма с НДС</td>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
      <tr style="font-size: 14px; font-weight: bold;">
        <td class="text-right" colspan="4" style="border-right: 1px solid black;">Итого</td>
        <td class="text-right">${totalAmount.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <p class="text-right" style="font-size: 14px;">
    <strong>Итого к оплате: ${totalAmountWords}</strong>
  </p>
  <p class="text-right" style="font-size: 14px;">
    В том числе НДС: ${totalVAT ? totalVAT.toFixed(2) : 'без НДС'}
  </p>

  <p style="font-size: 14px;"><br></p>
  <p style="font-size: 14px;"><strong>Счет действителен в течение 7 дней</strong></p>

  <p style="font-size: 14px;"><br></p>

  <!-- Подписи -->
  <table class="signature-table">
    <tr>
      <td width="13%" style="vertical-align: bottom;">Руководитель</td>
      <td width="17.5%" style="border-bottom: 1px solid black; vertical-align: bottom;"></td>
      <td width="17.5%" style="border-bottom: 1px solid black; vertical-align: bottom;"></td>
      <td width="5%"></td>
      <td width="12%">Бухгалтер</td>
      <td width="17.5%" style="border-bottom: 1px solid black;"></td>
      <td width="17.5%" style="border-bottom: 1px solid black; vertical-align: bottom;"></td>
    </tr>
  </table>

  ${notes ? `
  <p style="font-size: 9px; margin-top: 20px;">Примечание: ${notes}</p>
  ` : ''}
</body>
</html>
  `;
}

/**
 * Генерация PDF-счета
 * @param {Object} invoiceData - Данные счета
 * @returns {Promise<Object>} { success: boolean, filePath: string, fileName: string }
 */
async function generateInvoicePDF(invoiceData) {
  await ensureInvoicesDir();
  
  // Генерируем номер счета без префикса WCB
  const invoiceNumber = invoiceData.invoiceNumber || `${Date.now()}`;
  const fileName = `invoice-${invoiceNumber}-${Date.now()}.pdf`;
  const filePath = path.join(INVOICES_DIR, fileName);

  try {
    console.log('[Invoice Generator] Генерация PDF-счета...');
    
    // Генерируем QR код для оплаты
    const qrCodeDataURL = await generateQRCode({
      sellerName: invoiceData.sellerName,
      account: invoiceData.sellerAccount,
      bankName: invoiceData.sellerBankName,
      bik: invoiceData.sellerBIK,
      corrAccount: invoiceData.sellerCorrAccount,
      inn: invoiceData.sellerINN,
      kpp: invoiceData.sellerKPP,
      amount: invoiceData.totalAmount,
      invoiceNumber: invoiceNumber
    });
    
    // Добавляем QR код в данные для HTML
    invoiceData.qrCode = qrCodeDataURL;
    
    // Генерируем HTML
    const html = await generateInvoiceHTML(invoiceData);
    
    // Запускаем браузер
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Устанавливаем размер страницы A4
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Генерируем PDF
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5cm',
        right: '0.5cm',
        bottom: '0.5cm',
        left: '0.5cm'
      }
    });
    
    await browser.close();
    
    // Проверяем, что файл действительно создан
    try {
      const stats = await fs.stat(filePath);
      console.log('[Invoice Generator] ✅ PDF-счет создан:', filePath);
      console.log('[Invoice Generator] Размер файла:', stats.size, 'байт');
    } catch (error) {
      console.error('[Invoice Generator] ❌ Файл не найден после создания:', error);
      throw new Error('Файл не был создан');
    }
    
    return {
      success: true,
      filePath: filePath,
      fileName: fileName,
      invoiceNumber: invoiceNumber
    };
  } catch (error) {
    console.error('[Invoice Generator] ❌ Ошибка генерации PDF:', error);
    throw error;
  }
}

module.exports = {
  generateInvoicePDF,
  INVOICES_DIR
};
