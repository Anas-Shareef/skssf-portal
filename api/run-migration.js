import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let migrationSql = '';
  try {
    const filePath = path.join(process.cwd(), 'supabase/migrations/007_inventory_redesign.sql');
    migrationSql = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to read migration SQL file: ' + err.message });
  }

  const results = [];

  // --- METHOD 1: Try Supabase RPCs ---
  const rpcs = ['exec_sql', 'sql', 'query', 'execute_sql'];
  for (const rpcName of rpcs) {
    try {
      console.log(`Trying RPC: ${rpcName}`);
      const { data, error } = await supabase.rpc(rpcName, { 
        sql_query: migrationSql,
        query: migrationSql,
        sql: migrationSql
      });

      if (!error) {
        return res.status(200).json({
          success: true,
          method: `Supabase RPC (${rpcName})`,
          data
        });
      }
      results.push({ method: `RPC ${rpcName}`, success: false, error: error.message });
    } catch (err) {
      results.push({ method: `RPC ${rpcName}`, success: false, error: err.message });
    }
  }

  // --- METHOD 2: Try pg Connection Strings ---
  const connStrings = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.SUPABASE_DB_URL
  ].filter(Boolean);

  for (const connStr of connStrings) {
    try {
      console.log('Connecting via connection string...');
      const client = new pg.Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      await client.query(migrationSql);
      await client.end();

      return res.status(200).json({
        success: true,
        method: 'pg Connection String'
      });
    } catch (err) {
      results.push({ method: 'pg Connection String', success: false, error: err.message });
    }
  }

  // --- METHOD 3: Try constructed URL ---
  const host = 'db.jgxzdwbixqhkjrdbhnlc.supabase.co';
  const passwords = [
    process.env.SUPABASE_DB_PASSWORD,
    process.env.DB_PASSWORD,
    process.env.POSTGRES_PASSWORD,
    process.env.SUPABASE_PASSWORD
  ].filter(Boolean);

  for (const password of passwords) {
    try {
      console.log('Connecting via constructed URL...');
      const client = new pg.Client({
        host,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      await client.query(migrationSql);
      await client.end();

      return res.status(200).json({
        success: true,
        method: 'pg Constructed URL'
      });
    } catch (err) {
      results.push({ method: 'pg Constructed URL', success: false, error: err.message });
    }
  }

  return res.status(500).json({
    success: false,
    message: 'All migration methods failed.',
    details: results
  });
}
