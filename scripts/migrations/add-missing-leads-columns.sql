-- Migração: adicionar colunas ausentes na tabela leads
-- Gerado em: 2026-05-20
-- Contexto: cópia do projeto criada com banco vazio; schema.ts tem colunas que
--           não existem no banco de dados desta cópia.

-- Colunas adicionadas após o commit inicial do projeto original
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS motivoPerdaCategoria VARCHAR(50) NULL AFTER motivoPerdido,
  ADD COLUMN IF NOT EXISTS transferidoManualmentePorAdmin TINYINT(1) NOT NULL DEFAULT 0 AFTER origemWebhook,
  ADD COLUMN IF NOT EXISTS tipoFilaOrigem VARCHAR(50) NULL AFTER transferidoManualmentePorAdmin,
  ADD COLUMN IF NOT EXISTS temperatura VARCHAR(20) NULL DEFAULT 'morno' AFTER tipoFilaOrigem,
  ADD COLUMN IF NOT EXISTS rendaInformada DECIMAL(15,2) NULL AFTER temperatura,
  ADD COLUMN IF NOT EXISTS usaFgts TINYINT(1) NULL AFTER rendaInformada,
  ADD COLUMN IF NOT EXISTS entradaDisponivel DECIMAL(15,2) NULL AFTER usaFgts,
  ADD COLUMN IF NOT EXISTS dataNascimento DATE NULL AFTER entradaDisponivel,
  ADD COLUMN IF NOT EXISTS utmSource VARCHAR(255) NULL AFTER dataNascimento,
  ADD COLUMN IF NOT EXISTS utmMedium VARCHAR(255) NULL AFTER utmSource,
  ADD COLUMN IF NOT EXISTS utmCampaign VARCHAR(255) NULL AFTER utmMedium,
  ADD COLUMN IF NOT EXISTS utmContent VARCHAR(255) NULL AFTER utmCampaign,
  ADD COLUMN IF NOT EXISTS utmTerm VARCHAR(255) NULL AFTER utmContent,
  ADD COLUMN IF NOT EXISTS primeiroContatoEm TIMESTAMP NULL AFTER utmTerm,
  ADD COLUMN IF NOT EXISTS tempoAtePrimeiroContato INT NULL AFTER primeiroContatoEm;
