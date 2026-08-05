"""
RuralCaixa — Obrigações acessórias sobre venda de leite (item #1 da lista
de pendências, registrado 03/08, implementado 05/08).

Gatilho: lançamento de venda de leite pra laticínio confirmado (SIM) via
bot -- detectado pelo padrão laticínio-compra-leite-do-produtor que já
existia em ocr_handler.py (_corrigir_tipo_operacao_por_cpf), que agora
marca dados["_venda_leite_laticinio"] = True.

Ação: identifica o regime do produtor (produtores.regime_produtor) e
gera automaticamente o registro PENDENTE na obrigação correta,
reaproveitando a infraestrutura que já existia pra cada um dos dois
regimes (schema + cálculo de alíquotas + fluxo de XML/status já prontos):

  - pf_comum / pj      -> reinf_r2055 (EFD-Reinf, evento R-2055)
  - segurado_especial  -> esocial_s1260 (eSocial, evento S-1260)

O que este módulo NÃO faz (fica fora do escopo desta implementação):
  - Geração/transmissão do XML do S-1260 (o EFD-Reinf já tem isso pronto
    em app/routers/efdreinf.py, rota /efdreinf/xml; o lado eSocial S-1260
    ainda não tem gerador de XML -- ficaria pra uma sessão futura, junto
    com S-1200/S-1210 do bot de folha).
  - Confirmação automática do regime -- regime_produtor tem default
    'pf_comum', mas SEMPRE PRECISA SER CONFIRMADO/AJUSTADO manualmente
    por produtor antes de confiar no gatilho (ver comentário na migration
    030). Sem isso, o sistema vai gerar R-2055 pra todo mundo por default,
    mesmo quem na verdade é Segurado Especial.
"""
import logging

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


def disparar_obrigacao_venda_leite(
    cur,
    produtor_id: int,
    imovel_id: int,
    lancamento_uuid: str,
    valor_bruto: float,
    data_nota,
    cnpj_laticinio: str = None,
    nome_laticinio: str = None,
) -> dict:
    """
    Chamar depois que um lançamento de venda de leite pra laticínio for
    confirmado (SIM) e gravado com sucesso (gravar_lancamento). Idempotente:
    se já existe um registro pra esse lancamento_uuid, não duplica.

    Retorna sempre um dict com "mensagem" (texto pronto pra concatenar na
    resposta do bot) e "tipo_obrigacao" ("EFD-Reinf R-2055" ou
    "eSocial S-1260" ou None se já existia / não pôde ser gerado).
    """
    if not imovel_id:
        logger.warning(
            "[ObrigacaoAcessoria] imovel_id ausente -- não deu pra disparar "
            "a obrigação acessória pra lancamento_uuid=%s", lancamento_uuid,
        )
        return {
            "tipo_obrigacao": None,
            "mensagem": (
                "\n\n⚠️ Essa venda de leite pode gerar obrigação acessória "
                "(EFD-Reinf ou eSocial), mas não consegui identificar o "
                "imóvel pra verificar automaticamente. Confira manualmente "
                "no painel."
            ),
        }

    cur.execute("SELECT regime_produtor FROM produtores WHERE id = %s", (produtor_id,))
    row = cur.fetchone()
    regime = (row["regime_produtor"] if row else None) or "pf_comum"
    competencia = _competencia(data_nota)
    cnpj_laticinio = cnpj_laticinio or "00.000.000/0001-00"

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
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'venda_leite_bot',%s,%s,'pendente')
            RETURNING id
        """, (
            produtor_id, imovel_id, competencia, cnpj_laticinio, nome_laticinio,
            valor_bruto, vr_rat, vr_senar,
            ALIQUOTA_RAT_SEGURADO_ESPECIAL, ALIQUOTA_SENAR_SEGURADO_ESPECIAL,
            lancamento_uuid,
            f"Gerado automaticamente na venda de leite via bot (lançamento {lancamento_uuid})",
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

    # pf_comum ou pj -> EFD-Reinf R-2055
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
        ) VALUES (%s,%s,%s,%s,%s,'leite',%s,%s,%s,%s,%s,%s,TRUE,%s,'importacao',%s)
        RETURNING id
    """, (
        imovel_id, competencia, cnpj_laticinio, nome_laticinio,
        data_nota, valor_bruto,
        aliq_funrural, ALIQUOTA_SENAR,
        valor_funrural, valor_senar, valor_total,
        f"Gerado automaticamente na venda de leite via bot (lançamento {lancamento_uuid})",
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
