const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/db');
const { registerSchema, loginSchema } = require('../utils/validationSchemas');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  const { error } = registerSchema.validate(req.body);
  if (error) return res.status(400).send({ error: error.details[0].message });

  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await pool.query('INSERT INTO users (username, password, status) VALUES ($1, $2, $3)', [
      username,
      hashedPassword,
      'offline',
    ]);
    res.status(201).send({ message: 'User registered!' });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return res.status(400).send({ error: error.details[0].message });

  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rowCount > 0) {
      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).send({ message: 'Login successful!', token });
      } else {
        res.status(401).send({ message: 'Invalid credentials' });
      }
    } else {
      res.status(401).send({ message: 'Invalid credentials' });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;