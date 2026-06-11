-- Triagem MCMV: campos de elegibilidade no lead
-- Todos nullable para não afetar dados existentes
ALTER TABLE `leads` ADD COLUMN `possuiImovel` boolean NULL;
--> statement-breakpoint
ALTER TABLE `leads` ADD COLUMN `numDependentes` int NULL;
--> statement-breakpoint
ALTER TABLE `leads` ADD COLUMN `rendaFamiliar` varchar(100) NULL;
--> statement-breakpoint
ALTER TABLE `leads` ADD COLUMN `composicaoRenda` text NULL;
