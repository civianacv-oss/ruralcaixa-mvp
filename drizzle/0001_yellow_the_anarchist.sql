CREATE TABLE `animals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`identifier` varchar(64) NOT NULL,
	`name` varchar(128),
	`species` enum('ovinos','caprinos','suinos','bovinos') NOT NULL,
	`breed` varchar(128),
	`sex` enum('macho','femea') NOT NULL,
	`birthDate` date,
	`weight` decimal(8,2),
	`status` enum('ativo','vendido','morto','transferido') NOT NULL DEFAULT 'ativo',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `animals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('receita','despesa') NOT NULL,
	`category` varchar(128) NOT NULL,
	`description` varchar(255) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`date` date NOT NULL,
	`animalId` int,
	`species` enum('ovinos','caprinos','suinos','bovinos'),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `health_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animalId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('vacina','medicamento','ocorrencia') NOT NULL,
	`description` varchar(255) NOT NULL,
	`date` date NOT NULL,
	`nextDueDate` date,
	`dosage` varchar(128),
	`veterinarian` varchar(128),
	`cost` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `health_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animalId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('entrada','saida','transferencia','nascimento','morte','venda') NOT NULL,
	`date` date NOT NULL,
	`fromLocation` varchar(255),
	`toLocation` varchar(255),
	`weight` decimal(8,2),
	`value` decimal(12,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reproductive_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`femaleId` int NOT NULL,
	`maleId` int,
	`userId` int NOT NULL,
	`type` enum('cobertura','gestacao','parto','aborto') NOT NULL,
	`date` date NOT NULL,
	`expectedBirthDate` date,
	`actualBirthDate` date,
	`offspringCount` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reproductive_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `cpf` varchar(14);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_cpf_unique` UNIQUE(`cpf`);