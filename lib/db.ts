import pg from 'pg';
import { getRequiredEnv } from './env';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: getRequiredEnv('DATABASE_URL'),
      ssl:
        process.env.DATABASE_SSL === 'false'
          ? false
          : {
              rejectUnauthorized: false,
            },
    });
  }

  return pool;
};

export const vectorLiteral = (values: number[]) => `[${values.join(',')}]`;
