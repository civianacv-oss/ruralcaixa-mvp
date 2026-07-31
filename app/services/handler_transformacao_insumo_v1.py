"""
handler_transformacao_insumo_v1.py (v2 - adaptado a convencao real do projeto)

Segue o MESMO padrao ja usado por "recibo_pendente" em mensagem_handler.py
(nao o wizard multi-etapa do Recibo, que e mais complexo por pedir os
dados em varias mensagens - transformacao chega pronta numa unica
mensagem, como "misturei 30kg de milho e 20kg de soja pra fazer Racao X",
entao o padrao mais simples de confirmacao "_pendente" e o correto aqui).

Convencao observada em mensagem_handler.py (grep/sed feitos em 31/07):
  - sessoes = _sessoes  (dict de modulo, compartilhado)
  - key = msg.key        (identificador ja unificado por canal)
  - sessoes[key]["_tipo"] marca o estado
  - Bloco tipo "X_pendente" fica ANTES do bloco generico de confirmacao
    de lancamento (linha ~241: "sessoes[key].get('_tipo') not in (...)")
    - por isso "transformacao_pendente" PRECISA entrar nessa tupla de
      exclusao, senao um SIM/NAO durante a confirmacao da mistura seria
      engolido pelo tratamento generico de lancamento pendente.
  - Confirmacao retorna STRING direta (nao um objeto/dataclass).

Duas funcoes publicas, pensadas para plugar direto em processar_mensagem:

  1. processar_confirmacao_transformacao_pendente(sessoes, key, texto,
     conn, imovel_id, produtor_id) -> str
     Chamar logo apos o bloco "recibo_pendente" (mesma posicao/prioridade),
     ANTES da linha ~241. So chamar se
     sessoes.get(key, {}).get("_tipo") == "transformacao_pendente".

  2. tentar_iniciar_transformacao(sessoes, key, texto, conn, imovel_id,
     produtor_id) -> Optional[str]
     Chamar no ponto onde a classificacao "de um tiro so" acontece
     (equivalente a classificar_recibo - mensagem completa, sem wizard).
     Retorna None se o texto nao parecer uma transformacao (deixa outros
     classificadores tentarem); retorna a mensagem de confirmacao (e ja
     grava sessoes[key]) se parecer.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from app.services.parser_transformacao_insumo_v1 import (
    parece_transformacao,
    extrair_transformacao,
)
from app.services.resolver_transformacao_insumo_v1 import (
    resolver_transformacao,
    montar_mensagem_confirmacao_completa,
    ResolucaoTransformacao,
)
from app.services.transformacao_insumo_v1 import (
    processar_transformacao,
    TransformacaoError,
)


TIPO_TRANSFORMACAO_PENDENTE = "transformacao_pendente"


# ---------------------------------------------------------------------------
# Helper de conversao (mesmo de antes)
# ---------------------------------------------------------------------------

def _resolucao_para_ingredientes(resolucao: ResolucaoTransformacao) -> list:
    return [
        {"nome_insumo": item.insumo.nome, "quantidade": item.quantidade_kg}
        for item in resolucao.itens
    ]


# ---------------------------------------------------------------------------
# 1) Continuar uma confirmacao ja pendente (chamar ANTES do bloco generico)
# ---------------------------------------------------------------------------

def is_transformacao_pendente_ativo(sessoes: dict, key) -> bool:
    return sessoes.get(key, {}).get("_tipo") == TIPO_TRANSFORMACAO_PENDENTE


def processar_confirmacao_transformacao_pendente(
    sessoes: dict,
    key,
    texto: str,
    conn,
    imovel_id: int,
    produtor_id: int,
) -> str:
    """
    Espelha o bloco "recibo_pendente" de mensagem_handler.py:
      SIM/S/OK/CONFIRMA -> grava de fato, sessoes.pop(key)
      NAO/N/CANCELA      -> cancela, sessoes.pop(key, None)
      qualquer outra coisa -> pede pra responder SIM ou NAO (nao limpa a
                              sessao, mantendo a pendencia)
    """
    texto_up = texto.strip().upper()
    sess = sessoes.get(key, {})
    resolucao: ResolucaoTransformacao = sess.get("resolucao")
    nome_resultado: str = sess.get("nome_resultado")

    if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
        sessoes.pop(key, None)
        try:
            resultado = processar_transformacao(
                conn,
                imovel_id=imovel_id,
                produtor_id=produtor_id,
                ingredientes=_resolucao_para_ingredientes(resolucao),
                nome_resultado=nome_resultado,
                data_movimentacao=date.today(),
                peso_real_resultado=None,
            )
        except TransformacaoError as exc:
            return (
                f"❌ Não consegui concluir a mistura: {exc}\n"
                "Confira e tente novamente."
            )

        return (
            f"✅ Mistura registrada! Lote {resultado.lote_resultado}: "
            f"{resultado.quantidade_resultado:g} kg de {nome_resultado} "
            f"(custo médio R$ {resultado.custo_unitario_resultado:.2f}/kg)."
        )

    if texto_up in ("NAO", "N", "CANCELA"):
        sessoes.pop(key, None)
        return "❌ Mistura cancelada."

    return "Não entendi. Responda SIM para confirmar ou NAO para cancelar."


# ---------------------------------------------------------------------------
# 2) Deteccao/inicio (classificacao "de um tiro so", mensagem completa)
# ---------------------------------------------------------------------------

def tentar_iniciar_transformacao(
    sessoes: dict,
    key,
    texto: str,
    conn,
    imovel_id: int,
    produtor_id: int,
) -> Optional[str]:
    """
    Retorna None se o texto nao parecer uma transformacao (outros
    classificadores devem tentar). Caso pareca, sempre retorna uma
    mensagem (de confirmacao pronta para SIM/NAO, ou pedindo correcao
    se houver ambiguidade/insumo nao encontrado/estoque insuficiente).

    So grava sessoes[key] (estado pendente) quando a mistura esta
    COMPLETAMENTE resolvida e pronta para confirmar - caso contrario,
    o produtor deve reenviar a frase corrigida (mesmo padrao usado no
    resto do bot para correcao sem wizard formal).
    """
    if not parece_transformacao(texto):
        return None

    parse = extrair_transformacao(texto)

    if not parse.itens:
        return (
            "Percebi que você quer registrar uma mistura, mas não consegui "
            "identificar nenhum ingrediente. Pode descrever de novo? Ex: "
            "'misturei 30kg de milho e 20kg de soja pra fazer Racao X'."
        )

    cur = conn.cursor()
    try:
        resolucao = resolver_transformacao(cur, imovel_id, parse)
    finally:
        cur.close()

    mensagem = montar_mensagem_confirmacao_completa(resolucao)

    if resolucao.pronto_para_confirmar:
        sessoes[key] = {
            "_tipo": TIPO_TRANSFORMACAO_PENDENTE,
            "resolucao": resolucao,
            "nome_resultado": resolucao.nome_resultado,
        }

    return mensagem
