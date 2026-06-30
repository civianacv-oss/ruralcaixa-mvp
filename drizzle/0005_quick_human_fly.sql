CREATE TABLE `insumos_catalogo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`imovelId` int NOT NULL,
	`codigo` varchar(32) NOT NULL,
	`nome` varchar(255) NOT NULL,
	`nomeNormalizado` varchar(255) NOT NULL,
	`categoria` varchar(64) NOT NULL DEFAULT 'outros',
	`unidade` varchar(32) NOT NULL DEFAULT 'unidade',
	`railwayId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insumos_catalogo_id` PRIMARY KEY(`id`)
);
