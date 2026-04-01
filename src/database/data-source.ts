import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

const isTsRuntime = __filename.endsWith('.ts');
const fileExtension = isTsRuntime ? 'ts' : 'js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [join(__dirname, '..', '**', `*.entity.${fileExtension}`)],
  migrations: [join(__dirname, 'migrations', `*.${fileExtension}`)],
  synchronize: false,
  logging:
    process.env.NODE_ENV === 'development' ? ['error', 'query'] : ['error'],
});
