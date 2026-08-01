# -*- coding: utf-8 -*-

# Plano detalhado ATUALIZADO — inclui as contas novas descobertas nesta rodada:
# 1.4.6 (outras receitas), 2.6.7 (utilidades sede), 2.6.8 (software), 2.7.x (financeiras)
PLANO_DETALHADO_V2_NOVAS_CONTAS = [
    ("1.4.6", "Outras receitas não classificadas", "receita", "Não",
     "NOVO — cobre 'Outras receitas' e itens genéricos de venda que apareciam soltos em 4.1.1"),
    ("2.6.7", "Utilidades da sede (água, gás)", "despesa", "Sim",
     "NOVO — cobre despesas de gás/água da sede, hoje soltas em 3.1.8.1"),
    ("2.6.8", "Software e assinaturas", "despesa", "Sim",
     "NOVO — cobre assinaturas de sistema (inclusive o próprio RuralCaixa), hoje soltas em 3.1.8.1"),
    ("2.7", "Despesas Financeiras", "despesa", "Depende",
     "NOVO — categoria inteira que faltava; hoje escondida em 3.1.7.1 sob o rótulo errado 'Arrendamentos pagos'"),
    ("2.7.1", "Juros sobre empréstimos e financiamentos", "despesa", "Sim",
     "Dedutível no LCDPR quando o empréstimo é de custeio/investimento rural"),
    ("2.7.2", "Amortização de empréstimos (principal)", "despesa", "Não",
     "Pagamento do principal não é despesa dedutível — é redução de passivo"),
    ("9.9", "PENDENTE DE CLASSIFICAÇÃO", "pendente", "Não",
     "NOVO — conta-sentinela definida em 25/07. O classificador deve usar esta conta (nunca 'Outra Transação "
     "Financeira' ou qualquer conta genérica) quando não conseguir determinar fornecedor/produto/natureza "
     "econômica com segurança. Fica fora da numeração 1-4 de propósito, para nunca ser confundida com conta real."),
]

# (codigo_atual, nome_subconta_exato, tipo_atual, codigo_novo, confianca, observacao)
RECLASSIFICACAO = [
    # ---------------- 2.1.1 ----------------
    ("2.1.1", "2 Bicos Milk Bar para desmama das bezerras", "INVESTIMENTO", "3.1", "Média",
     "Equipamento de aleitamento; considerar criar conta específica de equip. pecuário se houver mais itens assim"),
    ("2.1.1", "Animais", "DESPESA", "9.9", "Baixa — CONFIRMAR",
     "Decisão: NÃO usar como conta genérica. Se for compra p/ formação de plantel -> 3.5; se for animal p/ "
     "revenda/engorda -> 4.7 (Estoque de animais para venda). Verificar o lançamento original antes de aplicar."),
    ("2.1.1", "Compra da produção Vacas em lactação Free Stall", "INVESTIMENTO", "3.5.1", "Média",
     "Parece aquisição de matrizes leiteiras para o sistema free-stall"),
    ("2.1.1", "Maquinas e Equipamentos", "DESPESA", "3.1", "Alta — decidido",
     "Decisão: é investimento, não despesa. Corrigir também o campo tipo de DESPESA para INVESTIMENTO."),
    ("2.1.1", "Trator de Silvinho - corte e plantio de roça de...", "INVESTIMENTO", "3.1", "Alta", ""),
    ("2.1.1", "Tratorito", "INVESTIMENTO", "3.1", "Alta", ""),
    ("2.1.1", "TRATORITO DAS 7CV/CNXD.BOT.TOYAM", "INVESTIMENTO", "3.1", "Alta", ""),

    # ---------------- 3.1.4.1 ----------------
    ("3.1.4.1", "02 Cameras de AR moto", "DESPESA", "2.4.2", "Alta", "Manutenção de veículo (moto)"),
    ("3.1.4.1", "03 Tubos de 50 mm para resfriamento de vacas", "DESPESA", "2.2.8", "Média-Alta", "Manutenção de instalação de resfriamento de leite"),
    ("3.1.4.1", "compra de diesel para o trator", "DESPESA", "2.3.1", "Alta", ""),
    ("3.1.4.1", "Compra de tubulações e conexões para...", "DESPESA", "2.2.8", "Média", "Assumindo resfriamento; confirmar se é outra instalação"),
    ("3.1.4.1", "Conexoes de canos resfriamento", "DESPESA", "2.2.8", "Alta", ""),
    ("3.1.4.1", "Corrente de moto serra Still", "DESPESA", "2.4.1", "Alta", "Manutenção de equipamento"),
    ("3.1.4.1", "Diesel", "DESPESA", "2.3.1", "Alta", ""),
    ("3.1.4.1", "EBULIDOR", "DESPESA", "9.9", "Baixa — CONFIRMAR",
     "Decisão: se for equipamento/estrutura usado na produção -> 2.4.4 (Galpões e instalações). Se for "
     "equipamento permanente de maior valor -> 3.1 (Máquinas e equipamentos, investimento). Cai em 9.9 até "
     "confirmar qual dos dois — não aplicar um palpite."),
    ("3.1.4.1", "Fluido de Freio Gurgel", "DESPESA", "2.4.2", "Alta", "Veículo"),
    ("3.1.4.1", "Gasolina para viagem ao Anta", "DESPESA", "2.3.2", "Alta", ""),
    ("3.1.4.1", "Junta da embragem da Bross", "DESPESA", "2.4.2", "Alta", "Moto"),
    ("3.1.4.1", "kit embreagem moto Bross", "DESPESA", "2.4.2", "Alta", ""),
    ("3.1.4.1", "Manutencao Maquinas", "DESPESA", "2.4.1", "Alta", ""),
    ("3.1.4.1", "Oleo da moto Bross", "DESPESA", "2.4.2", "Alta", ""),
    ("3.1.4.1", "Oleo de motor triciclo", "DESPESA", "2.4.2", "Alta", ""),
    ("3.1.4.1", "Pagamento da manutenção da bomba e motor irrigação", "DESPESA", "2.4.5", "Alta", ""),
    ("3.1.4.1", "Pagamento de oleo de motor Paulinho Pedra do Anta", "DESPESA", "2.3.3", "Alta — decidido",
     "Decisão: é lubrificante (óleo de motor), não manutenção -> 2.3.3 Lubrificantes e graxas."),
    ("3.1.4.1", "Peças e compressor do tanque de resfriamento", "DESPESA", "2.2.8", "Alta", ""),
    ("3.1.4.1", "Recarga de nitrogeneo", "DESPESA", "9.9", "Baixa — CONFIRMAR",
     "Decisão: se for conservação/reprodução (ex.: botijão de sêmen) -> 2.2.3 Reprodução. Se for manutenção "
     "geral de instalações/equipamentos -> 2.2.8. Cai em 9.9 até confirmar qual dos dois — não aplicar um palpite."),
    ("3.1.4.1", "Ventilador de resfriamento de vacas", "DESPESA", "2.2.8", "Alta", ""),

    # ---------------- 3.1.5.1 ----------------
    ("3.1.5.1", "Aplicação de roundup na roça de milho", "DESPESA", "2.1.5", "Alta", ""),
    ("3.1.5.1", "Compra de herbicidas para aplicação em Capim...", "DESPESA", "2.1.5", "Alta", ""),
    ("3.1.5.1", "Pagamento de pulverização do capim amargos", "DESPESA", "2.1.5", "Média", "Serviço de aplicação; poderia ir em 2.1.7 (mão de obra agrícola)"),
    ("3.1.5.1", "Serviços de aplicação de herbicida - capim...", "DESPESA", "2.1.5", "Média", "Mesma dúvida acima"),

    # ---------------- 3.1.5.2 ----------------
    ("3.1.5.2", "Compra de 100 sacos de adubo de planta e...", "DESPESA", "2.1.3", "Alta", ""),
    ("3.1.5.2", "compra de 300 fertilizante", "DESPESA", "2.1.3", "Alta", ""),
    ("3.1.5.2", "compra de 300 kg de fertilizante por 3000", "DESPESA", "2.1.3", "Alta", ""),
    ("3.1.5.2", "compra de adubo organico", "DESPESA", "2.1.3", "Alta", ""),
    ("3.1.5.2", "compra de fertilizante", "DESPESA", "2.1.3", "Alta", ""),
    ("3.1.5.2", "compra de fertilizante editado", "DESPESA", "2.1.3", "Alta", ""),
    ("3.1.5.2", "Fertilizantes", "DESPESA", "2.1.3", "Alta", ""),
    ("3.1.5.2", "Sementes", "DESPESA", "2.1.1", "Alta", ""),

    # ---------------- 3.1.6.1 ----------------
    ("3.1.6.1", "Mao de Obra", "DESPESA", "2.5.1", "Média", "Genérico; poderia ser 2.5.3 (diárias/terceiros)"),
    ("3.1.6.1", "Pagamanto do 13º em 3 parcelas de R$ 750 pagas...", "DESPESA", "2.5.2", "Alta", "13º é encargo trabalhista"),
    ("3.1.6.1", "pagamento do salario Fev 2026", "DESPESA", "2.5.1", "Alta", ""),
    ("3.1.6.1", "Salário de Daniel Cruz Assis", "DESPESA", "2.5.1", "Alta", ""),

    # ---------------- 3.1.7.1 (na verdade é financeiro, não arrendamento) ----------------
    ("3.1.7.1", "Juros Nereu", "DESPESA", "2.7.1", "Alta", ""),
    ("3.1.7.1", "Liquidação do emprestimo 1 - planilha de...", "DESPESA", "2.7.2", "Alta", ""),
    ("3.1.7.1", "Outra Transação Financeira", "DESPESA", "9.9", "Baixa — CONFIRMAR",
     "Decisão: não deve permanecer no plano definitivo — é rótulo genérico do classificador antigo. "
     "Cai na conta-sentinela 9.9 Pendente de Classificação até identificar a natureza real da operação."),
    ("3.1.7.1", "Pagamento da divida 07 - juros mais alto -...", "DESPESA", "2.7.1", "Média", "Nome enfatiza juros"),
    ("3.1.7.1", "Pagamento de boleto bancário", "DESPESA", "9.9", "Baixa — CONFIRMAR",
     "Decisão: boleto é só o meio de pagamento, não a natureza da despesa. Não classificar automaticamente "
     "como taxa bancária — identificar fornecedor e natureza real antes de decidir o código final."),
    ("3.1.7.1", "Pagamento do emprestimo 8", "DESPESA", "2.7.2", "Alta", ""),
    ("3.1.7.1", "Pagamento mensal - emprestimo 6", "DESPESA", "2.7.2", "Alta", ""),
    ("3.1.7.1", "Pagamento parcela Empréstimo 3", "DESPESA", "2.7.2", "Alta", ""),
    ("3.1.7.1", "Pagamento serviços da Divida 2026 - Emprestimo 5", "DESPESA", "2.7.2", "Média", ""),
    ("3.1.7.1", "Parcela emprestimo 2", "DESPESA", "2.7.2", "Alta", ""),
    ("3.1.7.1", "Parcela Emprestimo 4", "DESPESA", "2.7.2", "Alta", ""),

    # ---------------- 3.1.8.1 ----------------
    ("3.1.8.1", "06 papel toalha", "DESPESA", "2.6.5", "Média", ""),
    ("3.1.8.1", "Compra de Cama de Vacas", "DESPESA", "2.2.8", "Alta", ""),
    ("3.1.8.1", "Compra de gas para a sede", "DESPESA", "2.6.7", "Alta", ""),
    ("3.1.8.1", "Compra de insumos das camas free stal", "DESPESA", "2.2.8", "Alta", ""),
    ("3.1.8.1", "corda", "DESPESA", "2.4.3", "Alta", ""),
    ("3.1.8.1", "Energia Eletrica", "DESPESA", "2.2.7", "Média", "Assumindo energia da produção; confirmar se é da sede (iria para 2.6.7)"),
    ("3.1.8.1", "GRAMPO CERCA POL 7,5X13 BELGO 1KG", "INVESTIMENTO", "3.3.4", "Média", "Mantido como investimento por causa do tipo atual; é consumível pequeno, considerar reclassificar tipo para despesa"),
    ("3.1.8.1", "Insumos para separar a cama das vacas", "DESPESA", "2.2.8", "Alta", ""),
    ("3.1.8.1", "Manutenção de free stall", "DESPESA", "2.2.8", "Alta", ""),
    ("3.1.8.1", "Obras e Benfeitorias", "DESPESA", "9.9", "Baixa — CONFIRMAR",
     "Decisão: se for construção/ampliação nova -> 3.3 (Instalações e benfeitorias, investimento). Se for "
     "reparo/manutenção -> 2.4.4 (Galpões e instalações, despesa). Confirmar qual dos dois antes de aplicar."),
    ("3.1.8.1", "prego 1 kg", "DESPESA", "2.4.3", "Alta", ""),
    ("3.1.8.1", "Software de gestão rural", "DESPESA", "2.6.8", "Alta", "Provavelmente a própria assinatura do RuralCaixa"),

    # ---------------- 3.1.9.1 ----------------
    ("3.1.9.1", "Arrendamento Pago", "DESPESA", "2.6.6", "Alta", ""),

    # ---------------- 4.1.1 ----------------
    ("4.1.1", "10 SC DE MILHO", "RECEITA", "1.1.1", "Alta", ""),
    ("4.1.1", "15 sc de milho zizinho", "RECEITA", "1.1.1", "Alta", ""),
    ("4.1.1", "Arrendamento Recebido", "RECEITA", "1.4.3", "Alta", ""),
    ("4.1.1", "Outras receitas", "RECEITA", "1.4.6", "Alta", ""),
    ("4.1.1", "Pagamento parcial de 20 sc de milho - pago 1000...", "RECEITA", "1.1.1", "Alta", ""),
    ("4.1.1", "Servicos Prestados", "RECEITA", "1.4.2", "Alta", ""),
    ("4.1.1", "venda de 10 carneiros por 7000", "RECEITA", "1.2.3", "Alta", ""),
    ("4.1.1", "venda de 1 borregos", "RECEITA", "1.2.3", "Alta", ""),
    ("4.1.1", "Venda de 9 cabeças Paulo Mundico", "RECEITA", "1.2.1", "Alta", ""),
    ("4.1.1", "Venda de Bezerros", "RECEITA", "1.2.1", "Alta", ""),
    ("4.1.1", "Venda de Bovinos", "RECEITA", "1.2.1", "Alta", ""),
    ("4.1.1", "Venda de Milho", "RECEITA", "1.1.1", "Alta", ""),
    ("4.1.1", "Venda de produção Animais - Venda", "RECEITA", "9.9", "Baixa — CONFIRMAR",
     "Decisão: não manter 'Animais - Venda' como conta genérica. Classificar pela espécie/finalidade real "
     "(bovino de corte -> 1.2.1, bovino leiteiro descartado -> 1.2.2, ovino de corte -> 1.2.3 etc.) — "
     "verificar o lançamento original para saber a espécie antes de aplicar."),
    ("4.1.1", "Venda de produção Vacas lactação a pasto 25/26", "RECEITA", "1.2.2", "Alta — decidido",
     "Decisão: é venda das vacas leiteiras, não receita de leite. Vai para 1.2.2 Bovinocultura de leite "
     "(e NÃO para 1.3.1, que é reservado para venda de leite produzido, como a subconta já existente 4.1.2)."),
    ("4.1.1", "Venda de Soja", "RECEITA", "1.1.1", "Alta", ""),
]
