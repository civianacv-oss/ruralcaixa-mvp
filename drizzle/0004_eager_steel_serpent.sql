CREATE TABLE `procuracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`procuradorCpf` varchar(14) NOT NULL,
	`procuradorNome` varchar(255),
	`produtorCpf` varchar(14) NOT NULL,
	`arquivoUrl` text NOT NULL,
	`arquivoKey` varchar(512) NOT NULL,
	`status` enum('pendente','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
	`adminNota` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procuracoes_id` PRIMARY KEY(`id`)
);
