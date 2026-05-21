import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 2,
  connectTimeout: 30_000,
  waitForConnections: true,
});
const conn = await pool.getConnection();

// TiDB não aceita json DEFAULT ('{}') — usar sem default e deixar aplicação preencher
const sql = `CREATE TABLE IF NOT EXISTS \`oferta_ativa\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`nome\` varchar(255) NOT NULL,
  \`descricao\` text,
  \`corretorId\` int,
  \`criadoPorId\` int NOT NULL,
  \`sessaoId\` int,
  \`status\` enum('rascunho','ativa','concluida','arquivada') NOT NULL DEFAULT 'ativa',
  \`filtros\` json NOT NULL,
  \`totalLeads\` int NOT NULL DEFAULT 0,
  \`totalContatados\` int NOT NULL DEFAULT 0,
  \`totalAvancados\` int NOT NULL DEFAULT 0,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`oferta_ativa_id\` PRIMARY KEY(\`id\`)
)`;

try {
  await conn.execute(sql);
  console.log('OK: oferta_ativa created');
} catch (e) {
  if (e.code === 'ER_TABLE_EXISTS_ERROR') {
    console.log('SKIP: oferta_ativa already exists');
  } else {
    console.error('ERROR:', e.code, e.message);
  }
}

conn.release();
await pool.end();
console.log('Done!');
