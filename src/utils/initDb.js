const { pool } = require('./db'); // Assicurati che il percorso sia corretto

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'offline',
        position_x INTEGER DEFAULT 0,
        position_y INTEGER DEFAULT 0,
        action VARCHAR(20) DEFAULT 'IDLE',
        score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialized successfully!');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
};

initDb();
