const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Создаем папку для загрузки файлов, если её нет
const uploadDir = path.join(__dirname, '../../uploads/support');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Настройка хранилища
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `ticket-${uniqueSuffix}${ext}`);
  }
});

// Фильтр файлов (изображения, видео, документы, архивы, электронная подпись)
const fileFilter = (req, file, cb) => {
  console.log('[Upload] File filter check:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    encoding: file.encoding
  });
  
  const allowedMimes = [
    // Изображения
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    // Видео
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/avi',
    // Документы
    'application/pdf', // PDF
    'application/msword', // DOC
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.ms-excel', // XLS
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'application/vnd.ms-powerpoint', // PPT
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.oasis.opendocument.text', // ODT
    'application/vnd.oasis.opendocument.spreadsheet', // ODS
    'text/plain', // TXT
    'text/csv', // CSV
    // Архивы
    'application/zip', // ZIP
    'application/x-zip-compressed', // ZIP (альтернативный MIME)
    'application/x-rar-compressed', // RAR
    'application/x-7z-compressed', // 7Z
    'application/gzip', // GZ
    'application/x-tar', // TAR
    // Электронная подпись
    'application/pkcs7-signature', // P7S, P7M
    'application/x-pkcs7-signature', // P7S (альтернативный)
    'application/pkcs7-mime', // P7M
    'application/x-pkcs7-mime', // P7M (альтернативный)
    'application/octet-stream' // Для файлов с неизвестным MIME типом (например, .sig)
  ];

  // Получаем расширение файла для дополнительной проверки
  const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
  const allowedExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff',
    'mp4', 'mov', 'avi', 'webm',
    'pdf',
    'doc', 'docx',
    'xls', 'xlsx',
    'ppt', 'pptx',
    'odt', 'ods',
    'txt', 'csv',
    'zip', 'rar', '7z', 'gz', 'tar',
    'sig', 'p7s', 'p7m', 'p7c'
  ];

  // Проверяем по MIME типу
  const isValidMime = allowedMimes.includes(file.mimetype);
  // Проверяем по расширению (на случай, если MIME тип не определен)
  const isValidExtension = fileExtension && allowedExtensions.includes(fileExtension);

  if (isValidMime || isValidExtension) {
    console.log('[Upload] ✅ File accepted:', file.originalname, 'mimetype:', file.mimetype);
    cb(null, true);
  } else {
    console.log('[Upload] ❌ File rejected:', file.originalname, 'mimetype:', file.mimetype, 'extension:', fileExtension);
    cb(new Error(`Недопустимый тип файла: ${file.mimetype || 'неизвестный'}. Разрешены изображения, видео, документы (PDF, DOC, XLS), архивы (ZIP, RAR) и файлы электронной подписи.`), false);
  }
};

// Настройка multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB максимум (увеличено для документов и архивов)
  }
});

module.exports = { upload };
