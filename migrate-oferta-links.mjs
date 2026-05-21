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

const sqls = [
  `ALTER TABLE \`users\` ADD COLUMN \`acessaLinksUteis\` boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS \`sessao_oferta\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`nome\` varchar(255) NOT NULL,
    \`tipo\` enum('terca','quinta','avulsa') NOT NULL DEFAULT 'avulsa',
    \`dataHora\` timestamp NOT NULL,
    \`criadoPorId\` int NOT NULL,
    \`status\` enum('agendada','em_andamento','concluida') NOT NULL DEFAULT 'agendada',
    \`descricao\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sessao_oferta_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`oferta_ativa\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`nome\` varchar(255) NOT NULL,
    \`descricao\` text,
    \`corretorId\` int,
    \`criadoPorId\` int NOT NULL,
    \`sessaoId\` int,
    \`status\` enum('rascunho','ativa','concluida','arquivada') NOT NULL DEFAULT 'ativa',
    \`filtros\` json NOT NULL DEFAULT ('{}'),
    \`totalLeads\` int NOT NULL DEFAULT 0,
    \`totalContatados\` int NOT NULL DEFAULT 0,
    \`totalAvancados\` int NOT NULL DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`oferta_ativa_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`item_oferta_ativa\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`ofertaId\` int NOT NULL,
    \`leadId\` int NOT NULL,
    \`statusKanban\` enum('ofertar','tratando','agendou','sem_retorno','perdido') NOT NULL DEFAULT 'ofertar',
    \`agendamentoId\` int,
    \`observacao\` text,
    \`contatadoEm\` timestamp,
    \`ordem\` int NOT NULL DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`item_oferta_ativa_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE INDEX IF NOT EXISTS \`item_oferta_ativa_oferta_idx\` ON \`item_oferta_ativa\` (\`ofertaId\`)`,
  `CREATE INDEX IF NOT EXISTS \`item_oferta_ativa_lead_idx\` ON \`item_oferta_ativa\` (\`leadId\`)`,
  `CREATE TABLE IF NOT EXISTS \`atribuicao_sessao\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`sessaoId\` int NOT NULL,
    \`corretorId\` int NOT NULL,
    \`ofertaId\` int,
    \`status\` enum('pendente','em_andamento','concluida') NOT NULL DEFAULT 'pendente',
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`atribuicao_sessao_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`links_uteis\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`titulo\` varchar(255) NOT NULL,
    \`descricao\` varchar(500),
    \`url\` varchar(1000) NOT NULL,
    \`categoria\` varchar(100) NOT NULL,
    \`status\` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
    \`criadoPorId\` int NOT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`links_uteis_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE INDEX IF NOT EXISTS \`links_uteis_status_idx\` ON \`links_uteis\` (\`status\`)`,
  `CREATE INDEX IF NOT EXISTS \`links_uteis_categoria_idx\` ON \`links_uteis\` (\`categoria\`)`,
  `CREATE TABLE IF NOT EXISTS \`acessos_links_uteis\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`linkId\` int NOT NULL,
    \`corretorId\` int NOT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`acessos_links_uteis_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE INDEX IF NOT EXISTS \`acessos_link_idx\` ON \`acessos_links_uteis\` (\`linkId\`)`,
  `CREATE INDEX IF NOT EXISTS \`acessos_corretor_idx\` ON \`acessos_links_uteis\` (\`corretorId\`)`,
  `CREATE INDEX IF NOT EXISTS \`acessos_data_idx\` ON \`acessos_links_uteis\` (\`createdAt\`)`,
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log('OK:', sql.substring(0, 60).replace(/\n/g, ' '));
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_KEYNAME') {
      console.log('SKIP (already exists):', sql.substring(0, 60).replace(/\n/g, ' '));
    } else {
      console.error('ERROR:', e.code, e.message.substring(0, 100));
    }
  }
}

conn.release();
await pool.end();
console.log('Migration done!');
