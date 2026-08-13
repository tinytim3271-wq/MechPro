import { Pool, PoolClient } from 'pg';

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function getDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const host = env.DB_HOST ?? env.RDS_HOSTNAME;
  const port = Number(env.DB_PORT ?? env.RDS_PORT ?? 5432);
  const database = env.DB_NAME ?? env.RDS_DB_NAME ?? 'mechpro';
  const user = env.DB_USER ?? env.RDS_USERNAME ?? 'postgres';
  const password = env.DB_PASSWORD ?? env.RDS_PASSWORD ?? '';

  if (!host) {
    throw new Error('Database host is not configured. Set DB_HOST.');
  }

  if (!password) {
    throw new Error('Database password is not configured. Set DB_PASSWORD.');
  }

  return {
    host,
    port,
    database,
    user,
    password,
  };
}

export function createPool(env: NodeJS.ProcessEnv = process.env): Pool {
  const config = getDbConfig(env);
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.host.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

export async function withDb<T>(operation: (client: PoolClient) => Promise<T>, env: NodeJS.ProcessEnv = process.env): Promise<T> {
  const pool = createPool(env);

  try {
    await ensureSchema(pool);
    const client = await pool.connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(100),
      salary NUMERIC(12, 2),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      customer_id INTEGER NOT NULL,
      employee_id INTEGER,
      booking_date TIMESTAMP NOT NULL,
      service_type VARCHAR(255) NOT NULL,
      notes TEXT,
      status VARCHAR(50) DEFAULT 'scheduled',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      customer_id INTEGER NOT NULL,
      booking_id INTEGER,
      total_amount NUMERIC(12, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      payment_method VARCHAR(100),
      items JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inspections (
      id SERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      customer_id INTEGER NOT NULL,
      vehicle_vin VARCHAR(50) NOT NULL,
      findings TEXT,
      ai_analysis TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function listCustomers(shopId: string, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      'SELECT * FROM customers WHERE shop_id = $1 ORDER BY created_at DESC',
      [shopId]
    );
    return result.rows;
  }, env);
}

export async function getCustomerById(shopId: string, customerId: number | string, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      'SELECT * FROM customers WHERE shop_id = $1 AND id = $2',
      [shopId, Number(customerId)]
    );
    return result.rows[0] ?? null;
  }, env);
}

export async function createCustomer(shopId: string, payload: Record<string, any>, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      `INSERT INTO customers (shop_id, name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [shopId, payload.name, payload.email, payload.phone ?? null, payload.address ?? null]
    );
    return result.rows[0];
  }, env);
}

export async function updateCustomer(shopId: string, customerId: number | string, payload: Record<string, any>, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const fields: string[] = [];
    const values: any[] = [shopId, Number(customerId)];
    let index = 3;

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      fields.push(`${key} = $${index}`);
      values.push(value);
      index += 1;
    }

    if (fields.length === 0) {
      return getCustomerById(shopId, customerId, env);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    const result = await client.query(
      `UPDATE customers SET ${fields.join(', ')}
       WHERE shop_id = $1 AND id = $2
       RETURNING *`,
      values
    );

    return result.rows[0] ?? null;
  }, env);
}

export async function deleteCustomer(shopId: string, customerId: number | string, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      'DELETE FROM customers WHERE shop_id = $1 AND id = $2 RETURNING *',
      [shopId, Number(customerId)]
    );
    return result.rows[0] ?? null;
  }, env);
}

export async function listBookings(shopId: string, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query('SELECT * FROM bookings WHERE shop_id = $1 ORDER BY created_at DESC', [shopId]);
    return result.rows;
  }, env);
}

export async function createBooking(shopId: string, payload: Record<string, any>, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      `INSERT INTO bookings (shop_id, customer_id, employee_id, booking_date, service_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [shopId, payload.customer_id, payload.employee_id ?? null, payload.booking_date, payload.service_type, payload.notes ?? null]
    );
    return result.rows[0];
  }, env);
}

export async function listInvoices(shopId: string, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query('SELECT * FROM invoices WHERE shop_id = $1 ORDER BY created_at DESC', [shopId]);
    return result.rows;
  }, env);
}

export async function createInvoice(shopId: string, payload: Record<string, any>, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      `INSERT INTO invoices (shop_id, customer_id, booking_id, total_amount, status, payment_method, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [shopId, payload.customer_id, payload.booking_id ?? null, payload.total_amount, payload.status ?? 'pending', payload.payment_method ?? null, JSON.stringify(payload.items ?? [])]
    );
    return result.rows[0];
  }, env);
}

export async function listInspections(shopId: string, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query('SELECT * FROM inspections WHERE shop_id = $1 ORDER BY created_at DESC', [shopId]);
    return result.rows;
  }, env);
}

export async function createInspection(shopId: string, payload: Record<string, any>, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      `INSERT INTO inspections (shop_id, customer_id, vehicle_vin, findings, ai_analysis)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [shopId, payload.customer_id, payload.vehicle_vin, payload.findings ?? null, payload.ai_analysis ?? null]
    );
    return result.rows[0];
  }, env);
}

export async function listEmployees(shopId: string, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query('SELECT * FROM employees WHERE shop_id = $1 ORDER BY created_at DESC', [shopId]);
    return result.rows;
  }, env);
}

export async function createEmployee(shopId: string, payload: Record<string, any>, env: NodeJS.ProcessEnv = process.env) {
  return withDb(async (client) => {
    const result = await client.query(
      `INSERT INTO employees (shop_id, name, email, phone, role, salary, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [shopId, payload.name, payload.email, payload.phone ?? null, payload.role, payload.salary ?? null, payload.status ?? 'active']
    );
    return result.rows[0];
  }, env);
}
