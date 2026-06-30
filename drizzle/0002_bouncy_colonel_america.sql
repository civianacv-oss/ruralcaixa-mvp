CREATE TABLE `produtor_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produtorId` int NOT NULL,
	`telegramChatId` varchar(64),
	`whatsappPriority` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `produtor_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `produtor_config_produtorId_unique` UNIQUE(`produtorId`)
);
