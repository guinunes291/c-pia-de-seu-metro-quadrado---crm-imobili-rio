-- Migration: Oferta Ativa + Links Úteis
-- Adiciona campo acessaLinksUteis na tabela users
ALTER TABLE `users` ADD COLUMN `acessaLinksUteis` boolean NOT NULL DEFAULT false;

-- Tabela: sessao_oferta
CREATE TABLE `sessao_oferta` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(255) NOT NULL,
  `tipo` enum('terca','quinta','avulsa') NOT NULL DEFAULT 'avulsa',
  `dataHora` timestamp NOT NULL,
  `criadoPorId` int NOT NULL,
  `status` enum('agendada','em_andamento','concluida') NOT NULL DEFAULT 'agendada',
  `descricao` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sessao_oferta_id` PRIMARY KEY(`id`)
);

-- Tabela: oferta_ativa
CREATE TABLE `oferta_ativa` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(255) NOT NULL,
  `descricao` text,
  `corretorId` int,
  `criadoPorId` int NOT NULL,
  `sessaoId` int,
  `status` enum('rascunho','ativa','concluida','arquivada') NOT NULL DEFAULT 'ativa',
  `filtros` json NOT NULL DEFAULT ('{}'),
  `totalLeads` int NOT NULL DEFAULT 0,
  `totalContatados` int NOT NULL DEFAULT 0,
  `totalAvancados` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `oferta_ativa_id` PRIMARY KEY(`id`)
);

-- Tabela: item_oferta_ativa
CREATE TABLE `item_oferta_ativa` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ofertaId` int NOT NULL,
  `leadId` int NOT NULL,
  `statusKanban` enum('ofertar','tratando','agendou','sem_retorno','perdido') NOT NULL DEFAULT 'ofertar',
  `agendamentoId` int,
  `observacao` text,
  `contatadoEm` timestamp,
  `ordem` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `item_oferta_ativa_id` PRIMARY KEY(`id`)
);
CREATE INDEX `item_oferta_ativa_oferta_idx` ON `item_oferta_ativa` (`ofertaId`);
CREATE INDEX `item_oferta_ativa_lead_idx` ON `item_oferta_ativa` (`leadId`);

-- Tabela: atribuicao_sessao
CREATE TABLE `atribuicao_sessao` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessaoId` int NOT NULL,
  `corretorId` int NOT NULL,
  `ofertaId` int,
  `status` enum('pendente','em_andamento','concluida') NOT NULL DEFAULT 'pendente',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `atribuicao_sessao_id` PRIMARY KEY(`id`)
);

-- Tabela: links_uteis
CREATE TABLE `links_uteis` (
  `id` int AUTO_INCREMENT NOT NULL,
  `titulo` varchar(255) NOT NULL,
  `descricao` varchar(500),
  `url` varchar(1000) NOT NULL,
  `categoria` varchar(100) NOT NULL,
  `status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
  `criadoPorId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `links_uteis_id` PRIMARY KEY(`id`)
);
CREATE INDEX `links_uteis_status_idx` ON `links_uteis` (`status`);
CREATE INDEX `links_uteis_categoria_idx` ON `links_uteis` (`categoria`);

-- Tabela: acessos_links_uteis
CREATE TABLE `acessos_links_uteis` (
  `id` int AUTO_INCREMENT NOT NULL,
  `linkId` int NOT NULL,
  `corretorId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `acessos_links_uteis_id` PRIMARY KEY(`id`)
);
CREATE INDEX `acessos_link_idx` ON `acessos_links_uteis` (`linkId`);
CREATE INDEX `acessos_corretor_idx` ON `acessos_links_uteis` (`corretorId`);
CREATE INDEX `acessos_data_idx` ON `acessos_links_uteis` (`createdAt`);
