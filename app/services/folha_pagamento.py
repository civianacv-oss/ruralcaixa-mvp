"""
RuralCaixa — Bot de folha de pagamento (item #2 da lista de pendências,
registrado 03/08, escopo fechado, implementado 05/08).

Cenário assumido (decidido com o Cícero em 05/08, sem confirmação ainda do
Bira sobre a própria situação de pessoal -- ver item #3 da lista de
pendências): trabalhador rural com carteira assinada (CLT), eSocial
completo.

Reaproveita as tabelas que já existiam no banco (criadas fora do repo,
achado em 05/08 -- não havia nenhuma migration registrando isso):
  - esocial_config          (config do empregador por produtor)
  - esocial_trabalhadores   (cadastro dos trabalhadores)
  - esocial_s1200           (remuneração mensal -- "a folha" em si)
  - esocial_s1210           (pagamento efetivo de cada s1200)

O que ESTE módulo faz:
  - Calcula INSS e IRRF 2026 (tabelas vigentes, ver fontes nos comentários
    de cada tabela).
  - Registra a folha do mês (esocial_s1200) com os valores já calculados.
  - Registra o pagamento (esocial_s1210) e cria o lançamento financeiro
    correspondente na conta 2.5 (mão de obra/salários) -- pedido explícito
    do item #2 ("integração com o plano de contas").
  - Gera o texto de holerite (resumo) pra mandar pelo bot.

O que este módulo NÃO faz (fica pra uma sessão futura):
  - Geração/transmissão do XML dos eventos S-1200/S-1210 (as colunas
    xml_gerado/protocolo já existem nas tabelas, prontas pra receber isso).
  - Rescisão, férias e 13º salário (mencionados no escopo original, mas
    não construídos ainda -- specialmente complexos e cada um merece
    atenção própria).
  - O alerta automático de folha pendente todo dia 5 do mês (precisa de
    um cron/scheduler dedicado -- ver pendência registrada).

⚠️ IMPORTANTE sobre o IRRF 2026: a partir de janeiro de 2026 a legislação
combina a tabela progressiva tradicional com um REDUTOR novo (Lei
15.191/2025 + regulamentação da reforma do IR) que pode zerar o imposto
pra quem ganha até R$ 5.000/mês e reduz parcialmente até R$ 7.350/mês.
Essa é uma mudança recente e o cálculo tem mais nuance que o INSS -- os
valores aqui foram conferidos contra fontes públicas em 05/08/2026, mas
ISSO PRECISA SER VALIDADO POR UM CONTADOR antes de virar o valor real
descontado de alguém, especialmente em casos de dependentes, pensão
alimentícia ou outras deduções que este módulo ainda não cobre.
"""
import logging
from datetime import date as _date

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────
# TABELA INSS 2026 (empregado/empregado doméstico/avulso)
# Fonte: Portaria Interministerial MPS/MF que atualiza a tabela do INSS
# pra 2026 (salário mínimo R$1.621,00, teto R$8.475,55), conferida via
# contabilizei.com.br/contabilidade-online/tabela-inss (16/01/2026).
# Formato de cada faixa: (limite_superior, aliquota, parcela_a_deduzir)
# ─────────────────────────────────────────────────────────────────────────
TETO_INSS_2026 = 8475.55
FAIXAS_INSS_2026 = [
    (1621.00, 0.075, 0.00),
    (2902.84, 0.090, 24.32),
    (4354.27, 0.120, 111.40),
    (8475.55, 0.140, 198.49),
]
DESCONTO_MAXIMO_INSS_2026 = 988.09  # teto*14% - 198.49, já conferido


def calcular_inss(salario_contribuicao: float) -> float:
    """
    INSS progressivo por faixas (empregado CLT). Sempre limitado ao teto
    de contribuição -- salário acima de R$8.475,55 contribui só até lá.
    """
    if salario_contribuicao <= 0:
        return 0.0
    base = min(salario_contribuicao, TETO_INSS_2026)
    for limite, aliquota, deducao in FAIXAS_INSS_2026:
        if base <= limite:
            return round(base * aliquota - deducao, 2)
    # Nao deveria chegar aqui (base ja capada no teto, que é o ultimo limite)
    return DESCONTO_MAXIMO_INSS_2026


# ─────────────────────────────────────────────────────────────────────────
# TABELA IRRF 2026 -- progressiva mensal tradicional
# Fonte: contabilidade.com/blog/tabela-irpf-2026 (17/03/2026), com base na
# Lei 15.191/2025. Formato: (limite_superior, aliquota, parcela_a_deduzir)
# ─────────────────────────────────────────────────────────────────────────
FAIXAS_IRRF_2026 = [
    (2428.80, 0.000, 0.00),
    (2826.65, 0.075, 182.16),
    (3751.05, 0.150, 394.16),
    (4664.68, 0.225, 675.49),
    (float("inf"), 0.275, 908.73),
]

DEDUCAO_DEPENDENTE_2026 = 189.59
DESCONTO_SIMPLIFICADO_MAXIMO_2026 = 607.20

# Redutor mensal criado pela reforma do IR (vigência a partir de 2026):
# zera o imposto pra quem ganha ate R$5.000/mes tributaveis, e reduz
# parcialmente ate R$7.350,00. A formula do trecho intermediario, aplicada
# de forma continua a partir de 0, ja da o resultado certo pras faixas mais
# baixas tambem (o redutor calculado supera o imposto apurado nessas
# faixas, entao o imposto final fica zerado na pratica -- por isso o
# clamp com max(0, ...) no calculo final, nao um "if" separado por faixa).
REDUTOR_IRRF_LIMITE_RENDA = 7350.00
REDUTOR_IRRF_COEF_A = 978.62
REDUTOR_IRRF_COEF_B = 0.133145


def _imposto_progressivo(base_calculo: float) -> float:
    if base_calculo <= 0:
        return 0.0
    for limite, aliquota, deducao in FAIXAS_IRRF_2026:
        if base_calculo <= limite:
            return round(max(0.0, base_calculo * aliquota - deducao), 2)
    return 0.0  # inalcancavel (ultima faixa é infinito)


def _redutor_irrf(rendimento_tributavel_bruto: float) -> float:
    if rendimento_tributavel_bruto > REDUTOR_IRRF_LIMITE_RENDA:
        return 0.0
    redutor = REDUTOR_IRRF_COEF_A - REDUTOR_IRRF_COEF_B * rendimento_tributavel_bruto
    return max(0.0, round(redutor, 2))


def calcular_irrf(
    rendimento_tributavel_bruto: float,
    vr_inss: float,
    qtd_dependentes: int = 0,
    usar_desconto_simplificado: bool = True,
) -> float:
    """
    Base de cálculo = rendimento bruto - INSS - dependentes - desconto
    simplificado (usa o simplificado por padrão, que costuma ser mais
    vantajoso pra quem não tem despesas dedutíveis maiores -- caso comum
    de trabalhador rural). Depois aplica a tabela progressiva e, por fim,
    o redutor 2026 sobre o valor apurado (usando o rendimento BRUTO, não a
    base já reduzida -- é assim que os exemplos oficiais calculam).
    """
    deducao_dependentes = qtd_dependentes * DEDUCAO_DEPENDENTE_2026
    deducao_simplificada = DESCONTO_SIMPLIFICADO_MAXIMO_2026 if usar_desconto_simplificado else 0.0
    base_calculo = max(0.0, rendimento_tributavel_bruto - vr_inss - deducao_dependentes - deducao_simplificada)

    imposto_bruto = _imposto_progressivo(base_calculo)
    redutor = _redutor_irrf(rendimento_tributavel_bruto)
    imposto_final = max(0.0, round(imposto_bruto - redutor, 2))
    return imposto_final


def calcular_folha(
    salario_base: float,
    horas_extras: float = 0.0,
    adicional: float = 0.0,
    qtd_dependentes: int = 0,
) -> dict:
    """
    Calcula uma folha mensal completa a partir do salário base + eventos
    do mês. Retorna todos os valores prontos pra gravar em esocial_s1200.
    """
    vr_bruto_total = round(salario_base + horas_extras + adicional, 2)
    vr_inss = calcular_inss(vr_bruto_total)
    vr_irrf = calcular_irrf(vr_bruto_total, vr_inss, qtd_dependentes)
    vr_liquido = round(vr_bruto_total - vr_inss - vr_irrf, 2)
    return {
        "vr_salario": salario_base,
        "vr_horas_extras": horas_extras,
        "vr_adicional": adicional,
        "vr_bruto_total": vr_bruto_total,
        "vr_desconto_inss": vr_inss,
        "vr_desconto_irrf": vr_irrf,
        "vr_liquido": vr_liquido,
    }


def registrar_folha_mensal(
    cur, produtor_id: int, trabalhador_id: int, per_apur: str,
    salario_base: float, horas_extras: float = 0.0, adicional: float = 0.0,
    qtd_dependentes: int = 0, qtd_dias_trab: int = 30,
) -> dict:
    """
    Grava (ou atualiza, se já existir pra essa competência) o evento
    S-1200 pro trabalhador. Idempotente por (trabalhador_id, per_apur) --
    já existia uma UNIQUE constraint pra isso na tabela.
    """
    calc = calcular_folha(salario_base, horas_extras, adicional, qtd_dependentes)
    cur.execute("""
        INSERT INTO esocial_s1200
            (produtor_id, trabalhador_id, per_apur, vr_salario,
             vr_horas_extras, vr_adicional, vr_desconto_inss,
             vr_desconto_irrf, vr_liquido, qtd_dias_trab, status)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pendente')
        ON CONFLICT (trabalhador_id, per_apur) DO UPDATE SET
            vr_salario = EXCLUDED.vr_salario,
            vr_horas_extras = EXCLUDED.vr_horas_extras,
            vr_adicional = EXCLUDED.vr_adicional,
            vr_desconto_inss = EXCLUDED.vr_desconto_inss,
            vr_desconto_irrf = EXCLUDED.vr_desconto_irrf,
            vr_liquido = EXCLUDED.vr_liquido,
            qtd_dias_trab = EXCLUDED.qtd_dias_trab
        RETURNING id
    """, (
        produtor_id, trabalhador_id, per_apur, calc["vr_salario"],
        calc["vr_horas_extras"], calc["vr_adicional"], calc["vr_desconto_inss"],
        calc["vr_desconto_irrf"], calc["vr_liquido"], qtd_dias_trab,
    ))
    s1200_id = cur.fetchone()["id"]
    calc["s1200_id"] = s1200_id
    calc["per_apur"] = per_apur
    return calc


def registrar_pagamento_folha(
    cur, produtor_id: int, trabalhador_id: int, s1200_id: int,
    per_apur: str, vr_liquido: float, dt_pagamento=None,
) -> int:
    """
    Grava o evento S-1210 (pagamento) -- NÃO cria o lançamento financeiro
    (isso é feito por quem chama, que tem acesso ao imovel_id e ao
    gravar_lancamento do bot; ver hook em mensagem_handler.py).
    """
    dt_pagamento = dt_pagamento or _date.today()
    cur.execute("""
        INSERT INTO esocial_s1210
            (produtor_id, trabalhador_id, s1200_id, per_apur,
             dt_pagamento, vr_liquido, tipo_pagamento, status)
        VALUES (%s,%s,%s,%s,%s,%s,'folha','pendente')
        RETURNING id
    """, (produtor_id, trabalhador_id, s1200_id, per_apur, dt_pagamento, vr_liquido))
    return cur.fetchone()["id"]


def texto_holerite(nome_trabalhador: str, cargo: str, per_apur: str, calc: dict) -> str:
    """Texto de holerite simplificado pra enviar pelo bot (WhatsApp/Telegram)."""
    ano, mes = per_apur.split("-")
    return (
        f"📄 HOLERITE — {per_apur} ({mes}/{ano})\n"
        f"Funcionário: {nome_trabalhador}\n"
        f"Cargo: {cargo}\n\n"
        f"Salário base: R$ {calc['vr_salario']:,.2f}\n"
        + (f"Horas extras: R$ {calc['vr_horas_extras']:,.2f}\n" if calc.get("vr_horas_extras") else "")
        + (f"Adicional: R$ {calc['vr_adicional']:,.2f}\n" if calc.get("vr_adicional") else "")
        + f"Total bruto: R$ {calc['vr_bruto_total']:,.2f}\n\n"
        f"(-) INSS: R$ {calc['vr_desconto_inss']:,.2f}\n"
        f"(-) IRRF: R$ {calc['vr_desconto_irrf']:,.2f}\n\n"
        f"💰 Líquido a receber: R$ {calc['vr_liquido']:,.2f}"
    )
