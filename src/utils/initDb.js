const { pool } = require('./db');

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'offline',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialized successfully!');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
};

initDb();
