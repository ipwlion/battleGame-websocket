const { pool } = require('./db');

const initDb = async () => {
  try {
    // Crea la tabella se non esiste
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'offline',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Aggiorna la tabella per aggiungere le colonne mancanti
    await pool.query(`
ALTER TABLE users ALTER COLUMN position_x TYPE DOUBLE PRECISION USING position_x::DOUBLE PRECISION;
ALTER TABLE users ALTER COLUMN position_y TYPE DOUBLE PRECISION USING position_y::DOUBLE PRECISION;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS action VARCHAR(20) DEFAULT 'IDLE';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
    `);

    console.log('Database initialized and updated successfully!');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
};

initDb();
