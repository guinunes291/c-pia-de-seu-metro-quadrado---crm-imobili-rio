-- Índices de performance para leads (sem risco de perda de dados)
CREATE INDEX IF NOT EXISTS `lead_ultimo_contato_idx` ON `leads` (`ultimoContato`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lead_created_at_idx` ON `leads` (`createdAt`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lead_lixeira_status_idx` ON `leads` (`naLixeira`, `status`);
