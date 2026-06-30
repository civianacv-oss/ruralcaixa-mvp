CREATE TABLE `contador_vinculo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contadorCpf` varchar(14) NOT NULL,
	`contadorNome` varchar(255) NOT NULL,
	`contadorTelefone` varchar(20) NOT NULL,
	`produtorCpf` varchar(14) NOT NULL,
	`produtorId` int NOT NULL,
	`status_cv` enum('ativo','revogado') NOT NULL DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contador_vinculo_id` PRIMARY KEY(`id`)
);
