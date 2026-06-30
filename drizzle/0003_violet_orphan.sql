CREATE TABLE `produtor_imovel` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produtorId` int NOT NULL,
	`imovelId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `produtor_imovel_id` PRIMARY KEY(`id`)
);
