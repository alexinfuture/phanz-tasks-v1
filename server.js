const express = require('express');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

/*
 * Initialize a connection pool to Postgres. The DATABASE_URL environment
 * variable should be set in your Render dashboard to the connection string
 * provided by your Postgres instance. See README in the public folder for
 * details on setting up your database and environment variables.
 */
const pool = new Pool({
  connectionString: process.env.DAT  ABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Helper function to ensure database tables exist
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT
      );
    `);
    // Create tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date DATE,
        status VARCHAR(50) NOT NULL DEFAULT 'not started',
        user_name VARCHAR(255) NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}

// API routes

// Create a new project
app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create a new task
app.post('/api/tasks', async (req, res) => {
  const { project_id, title, description, due_date, status, user_name } = req.body;
  if (!title || !user_name) {
    return res.status(400).json({ error: 'Title and user name are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO tasks (project_id, title, description, due_date, status, user_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [project_id || null, title, description || null, due_date || null, status || 'not started', user_name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Get tasks, optionally filtered by user or project
app.get('/api/tasks', async (req, res) => {
  const { user_name, project_id } = req.query;
  try {
    let query = 'SELECT * FROM tasks';
    const conditions = [];
    const values = [];
    if (user_name) {
      values.push(user_name);
      conditions.push(`user_name = $${values.length}`);
    }
    if (project_id) {
      values.push(project_id);
      conditions.push(`project_id = $${values.length}`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY id DESC';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Update a task
app.put('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const { project_id, title, description, due_date, status, user_name } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tasks
       SET project_id = $1,
           title = $2,
           description = $3,
           due_date = $4,
           status = $5,
           user_name = $6
       WHERE id = $7
       RETURNING *`,
      [project_id || null, title, description || null, due_date || null, status, user_name, taskId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Start the server after ensuring database tables exist
initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
