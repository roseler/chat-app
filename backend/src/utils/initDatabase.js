const db = require('./database');

async function initDatabase() {
  try {
    console.log('Initializing database...');
    await db.connect();
    console.log('Database initialized successfully!');
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

initDatabase();

