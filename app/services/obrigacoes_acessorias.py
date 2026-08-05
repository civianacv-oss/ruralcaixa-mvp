"""
RuralCaixa — Obrigações acessórias sobre venda de produção rural (item #1
da lista de pendências, registrado 03/08, implementado 05/08, corrigido
05/08 depois do primeiro teste real com o Bira).

Gatilho: qualquer lançamento de RECEITA de venda de produção rural
confirmado (SIM) via bot -- não é mais restrito a venda de leite. A
correção de escopo (05/08) veio do próprio Cícero: "não pode ser somente
a venda de leite, deve disparar para qualquer venda". Ver hook em
mensagem_handler.py (_eh_venda_producao_rural).

Ação: identifica (a) o regime do produtor (produtores.regime_produtor) e
(b) se quem COMPROU é pessoa física ou jurídica -- os dois juntos decidem
a obrigação certa:

  - Comprador PJ (CNPJ) -> a retenção do FUNRURAL/SENAR é feita NA FONTE
    pelo próprio comprador, por lei (Lei 8.212/1991 art. 25 + IN RFB
    2.237/2024). Reaproveita a infraestrutura que já existia:
      - produtor pf_comum/pj      -> reinf_r2055 (EFD-Reinf, evento R-2055)
      - produtor segurado_especial -> esocial_s1260 (eSocial, evento S-1260)

  - Comprador PF (CPF) -> NÃO existe retenção na fonte (só quem compra
    como pessoa jurídica tem essa obrigação legal). Nesse caso é o
    PRÓPRIO PRODUTOR quem precisa apurar e recolher o FUNRURAL/SENAR
    diretamente (GPS/DARF), fora do fluxo de retenção. Ainda assim grava
    um reinf_r2055 (mesma tabela, já suporta retencao_pelo_adquirente
    = FALSE desde o schema original) só pra efeito de controle/apuração
    -- não presume Segurado Especial nesse caso, porque o evento S-1260
    também depende de retenção pelo comprador PJ.

  - Comprador não identificado (documento ausente/ilegível) -> avisa o
    produtor mas não cria nenhum registro -- evita gerar dado errado
    (ex: cobrar retenção que na verdade não existe) por falta de
    informação.

O que este módulo NÃO faz (fica fora do escopo desta implementação):
  - Geração/transmissão do XML do S-1260 (o EFD-Reinf já tem isso pronto
    em app/routers/efdreinf.py, rota /efdreinf/xml; o lado eSocial S-1260
    ainda não tem gerador de XML).
  - Cálculo/lembrete do FUNRURAL a recolher diretamente pelo produtor
    (caso "comprador PF") -- por enquanto só avisa que a responsabilidade
    é dele; a apuração e o alerta de vencimento próprio ficam pra depois.
  - Confirmação automática do regime -- regime_produtor tem default
    'pf_comum', mas SEMPRE PRECISA SER CONFIRMADO/AJUSTADO manualmente
    por produtor antes de confiar no gatilho.
"""
import logging
import re

logger = logging.getLogger(__name__)

# Mesmas alíquotas vigentes já usadas em app/routers/efdreinf.py
# (IN RFB 2.237/2024) -- mantidas aqui em vez de importar pra não criar
# dependência circular entre o router e o service; se um dia mudarem,
# atualizar os dois lugares.
ALIQUOTA_FUNRURAL_PF = 0.0187   # 1,87%
ALIQUOTA_FUNRURAL_PJ = 0.0200   # 2,00%
ALIQUOTA_SENAR       = 0.0011   # 0,11%

# esocial_s1260 já tinha esses valores como default de coluna (aliq_rat=1.50,
# aliq_senar=0.20) -- repetidos aqui explicitamente pra clareza do cálculo.
ALIQUOTA_RAT_SEGURADO_ESPECIAL   = 1.50   # % (não fração -- ver aliq_rat na tabela)
ALIQUOTA_SENAR_SEGURADO_ESPECIAL = 0.20   # % (não fração -- ver aliq_senar na tabela)


def _competencia(data_nota) -> str:
    if isinstance(data_nota, str):
        return data_nota[:7]
    return data_nota.strftime("%Y-%m")


def tipo_pessoa(documento: str) -> str:
    """'pj' (CNPJ, 14 dígitos), 'pf' (CPF, 11 dígitos), ou 'desconhecido'."""
    d = re.sub(r"\D", "", documento or "")
    if len(d) == 14:
        return "pj"
    if len(d) == 11:
        return "pf"
    return "desconhecido"


def disparar_obrigacao_venda_producao_rural(
    cur,
    produtor_id: int,
    imovel_id: int,
    lancamento_uuid: str,
    valor_bruto: float,
    data_nota,
    documento_comprador: str = None,
    nome_comprador: str = None,
    tipo_produto: str = "outros",
) -> dict:
    """
    Chamar depois que um lançamento de RECEITA de venda de produção rural
    for confirmado (SIM) e gravado com sucesso (gravar_lancamento).
    Idempotente: se já existe um registro pra esse lancamento_uuid, não
    duplica.

    `documento_comprador`: CPF ou CNPJ de quem comprou (só dígitos ou
    formatado, tanto faz). Se None/vazio, não dá pra saber se há
    retenção -- avisa o produtor sem criar registro.

    Retorna sempre um dict com "mensagem" (texto pronto pra concatenar na
    resposta do bot) e "tipo_obrigacao" (string identificando o tipo, ou
    None se já existia / não pôde ser gerado).
    """
    if not imovel_id:
        logger.warning(
            "[ObrigacaoAcessoria] imovel_id ausente -- não deu pra disparar "
            "a obrigação acessória pra lancamento_uuid=%s", lancamento_uuid,
        )
        return {
            "tipo_obrigacao": None,
            "mensagem": (
                "\n\n⚠️ Essa venda pode gerar obrigação acessória (EFD-Reinf "
                "ou eSocial), mas não consegui identificar o imóvel pra "
                "verificar automaticamente. Confira manualmente no painel."
            ),
        }

    tipo_comprador = tipo_pessoa(documento_comprador)
    if tipo_comprador == "desconhecido":
        return {
            "tipo_obrigacao": None,
            "mensagem": (
                "\n\n⚠️ Essa venda pode gerar obrigação acessória (FUNRURAL/"
                "SENAR), mas não consegui identificar o CPF/CNPJ de quem "
                "comprou. Se o comprador for pessoa jurídica, confira se a "
                "nota chegou com retenção; se for pessoa física, a "
                "apuração e o recolhimento são de sua responsabilidade."
            ),
        }

    cur.execute("SELECT regime_produtor FROM produtores WHERE id = %s", (produtor_id,))
    row = cur.fetchone()
    regime = (row["regime_produtor"] if row else None) or "pf_comum"
    competencia = _competencia(data_nota)
    documento_comprador_fmt = documento_comprador or "00.000.000/0001-00"

    # ── Comprador PESSOA FÍSICA: não existe retenção na fonte por lei --
    # a responsabilidade de apurar e recolher o FUNRURAL/SENAR é do
    # próprio produtor. Ainda registra em reinf_r2055 (com
    # retencao_pelo_adquirente=FALSE) só pra controle/apuração, mas o
    # aviso deixa claro que ninguém reteve nada por ele.
    if tipo_comprador == "pf":
        cur.execute(
            "SELECT id FROM reinf_r2055 WHERE lancamento_uuid = %s",
            (lancamento_uuid,),
        )
        if cur.fetchone():
            return {"tipo_obrigacao": None, "mensagem": ""}

        aliq_funrural = ALIQUOTA_FUNRURAL_PJ if regime == "pj" else ALIQUOTA_FUNRURAL_PF
        valor_funrural = round(valor_bruto * aliq_funrural, 2)
        valor_senar = round(valor_bruto * ALIQUOTA_SENAR, 2)
        valor_total = round(valor_funrural + valor_senar, 2)

        cur.execute("""
            INSERT INTO reinf_r2055 (
                imovel_id, competencia, cnpj_adquirente, nome_adquirente,
                data_nota, tipo_produto, valor_bruto,
                aliquota_funrural, aliquota_senar,
                valor_funrural, valor_senar, valor_total_retido,
                retencao_pelo_adquirente, observacoes,
                origem, lancamento_uuid
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,FALSE,%s,'importacao',%s)
            RETURNING id
        """, (
            imovel_id, competencia, documento_comprador_fmt, nome_comprador,
            data_nota, tipo_produto, valor_bruto,
            aliq_funrural, ALIQUOTA_SENAR,
            valor_funrural, valor_senar, valor_total,
            f"Comprador pessoa física -- sem retenção na fonte. Produtor "
            f"responsável por apurar/recolher (lançamento {lancamento_uuid})",
            lancamento_uuid,
        ))
        novo_id = cur.fetchone()["id"]
        return {
            "tipo_obrigacao": "FUNRURAL auto-apuração (comprador PF)",
            "id": novo_id,
            "competencia": competencia,
            "valor_retido": valor_total,
            "mensagem": (
                f"\n\n⚠️ Essa venda foi pra pessoa física -- não há retenção "
                f"na fonte (só comprador pessoa jurídica é obrigado a "
                f"reter). Você mesmo precisa apurar e recolher o FUNRURAL+"
                f"SENAR: R$ {valor_total:.2f} (competência {competencia}). "
                f"Registrado no painel > EFD-Reinf pra controle, mas o "
                f"recolhimento é de sua responsabilidade."
            ),
        }

    # ── Comprador PESSOA JURÍDICA: retenção na fonte, como antes ──────
    if regime == "segurado_especial":
        cur.execute(
            "SELECT id FROM esocial_s1260 WHERE lancamento_uuid = %s",
            (lancamento_uuid,),
        )
        if cur.fetchone():
            return {"tipo_obrigacao": None, "mensagem": ""}

        vr_rat = round(valor_bruto * ALIQUOTA_RAT_SEGURADO_ESPECIAL / 100, 2)
        vr_senar = round(valor_bruto * ALIQUOTA_SENAR_SEGURADO_ESPECIAL / 100, 2)
        cur.execute("""
            INSERT INTO esocial_s1260
                (produtor_id, imovel_id, per_apur, nif_adquirente, nome_adquirente,
                 vr_bruto_comerc, vr_rat, vr_senar, aliq_rat, aliq_senar,
                 origem, lancamento_uuid, observacoes, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'venda_producao_rural_bot',%s,%s,'pendente')
            RETURNING id
        """, (
            produtor_id, imovel_id, competencia, documento_comprador_fmt, nome_comprador,
            valor_bruto, vr_rat, vr_senar,
            ALIQUOTA_RAT_SEGURADO_ESPECIAL, ALIQUOTA_SENAR_SEGURADO_ESPECIAL,
            lancamento_uuid,
            f"Gerado automaticamente na venda de produção rural via bot (lançamento {lancamento_uuid})",
        ))
        novo_id = cur.fetchone()["id"]
        valor_retido = round(vr_rat + vr_senar, 2)
        return {
            "tipo_obrigacao": "eSocial S-1260",
            "id": novo_id,
            "competencia": competencia,
            "valor_retido": valor_retido,
            "mensagem": (
                f"\n\n⚠️ Obrigação acessória pendente: eSocial S-1260 "
                f"(Segurado Especial), competência {competencia}. "
                f"Retenção estimada (RAT + SENAR): R$ {valor_retido:.2f}. "
                f"Consulte no painel."
            ),
        }

    # pf_comum ou pj, comprador PJ -> EFD-Reinf R-2055
    cur.execute(
        "SELECT id FROM reinf_r2055 WHERE lancamento_uuid = %s",
        (lancamento_uuid,),
    )
    if cur.fetchone():
        return {"tipo_obrigacao": None, "mensagem": ""}

    aliq_funrural = ALIQUOTA_FUNRURAL_PJ if regime == "pj" else ALIQUOTA_FUNRURAL_PF
    valor_funrural = round(valor_bruto * aliq_funrural, 2)
    valor_senar = round(valor_bruto * ALIQUOTA_SENAR, 2)
    valor_total = round(valor_funrural + valor_senar, 2)

    cur.execute("""
        INSERT INTO reinf_r2055 (
            imovel_id, competencia, cnpj_adquirente, nome_adquirente,
            data_nota, tipo_produto, valor_bruto,
            aliquota_funrural, aliquota_senar,
            valor_funrural, valor_senar, valor_total_retido,
            retencao_pelo_adquirente, observacoes,
            origem, lancamento_uuid
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,TRUE,%s,'importacao',%s)
        RETURNING id
    """, (
        imovel_id, competencia, documento_comprador_fmt, nome_comprador,
        data_nota, tipo_produto, valor_bruto,
        aliq_funrural, ALIQUOTA_SENAR,
        valor_funrural, valor_senar, valor_total,
        f"Gerado automaticamente na venda de produção rural via bot (lançamento {lancamento_uuid})",
        lancamento_uuid,
    ))
    novo_id = cur.fetchone()["id"]

    try:
        from app.routers.efdreinf import _recalcular_apuracao
        _recalcular_apuracao(imovel_id, competencia)
    except Exception:
        logger.exception(
            "[ObrigacaoAcessoria] Falha ao recalcular apuração EFD-Reinf "
            "(R-2055 id=%s foi criado normalmente, só a apuração mensal "
            "que não atualizou -- corrigir manualmente no painel).", novo_id,
        )

    return {
        "tipo_obrigacao": "EFD-Reinf R-2055",
        "id": novo_id,
        "competencia": competencia,
        "valor_retido": valor_total,
        "mensagem": (
            f"\n\n⚠️ Obrigação acessória pendente: EFD-Reinf R-2055, "
            f"competência {competencia}. Retenção estimada (FUNRURAL + "
            f"SENAR): R$ {valor_total:.2f}. Consulte no painel > EFD-Reinf."
        ),
    }


# Alias de compatibilidade com o nome antigo (usado só pelo script de
# correção retroativa do lançamento #23180d2a -- pode ser removido depois
# que ele rodar).
def disparar_obrigacao_venda_leite(cur, produtor_id, imovel_id, lancamento_uuid,
                                     valor_bruto, data_nota, cnpj_laticinio=None,
                                     nome_laticinio=None):
    return disparar_obrigacao_venda_producao_rural(
        cur, produtor_id, imovel_id, lancamento_uuid, valor_bruto, data_nota,
        documento_comprador=cnpj_laticinio, nome_comprador=nome_laticinio,
        tipo_produto="leite",
    )
