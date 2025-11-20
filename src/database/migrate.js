const { initDatabase } = require('./init');

initDatabase()
  .then(() => {
    console.log('✅ Database migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  });

