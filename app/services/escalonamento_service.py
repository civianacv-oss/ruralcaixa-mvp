"""
app/services/escalonamento_service.py — RuralCaixa MVP

Escalonamento de classificação: quando um colaborador_operacional (peão)
reporta algo que o pipeline não consegue classificar com confiança, a
pergunta é redirecionada pro proprietário + todos os administradores
daquele imóvel, sempre nos dois canais (Telegram e WhatsApp) ao mesmo
tempo -- nunca volta pro peão.

Reaproveita:
  - enviar_whatsapp (app.services.whatsapp_service) -- já usado pelo alerta_service
  - o mesmo padrão de envio individual do Telegram usado em
    app/routers/telegram_bot_router.py (_send), reimplementado aqui de forma
    independente pra não acoplar num router.
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""


async def _enviar_telegram(chat_id: str, texto: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{TELEGRAM_API}/sendMessage",
                json={"chat_id": chat_id, "text": texto},
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning("Telegram nao enviado (escalonamento): %s", data.get("description"))
                return False
            return True
    except Exception as e:
        logger.warning("Erro ao enviar Telegram (escalonamento): %s", e)
        return False


def _enviar_whatsapp_sync(telefone: str, texto: str) -> bool:
    if not telefone:
        return False
    try:
        from app.services.whatsapp_service import enviar_whatsapp
        return bool(enviar_whatsapp(telefone, texto))
    except Exception as e:
        logger.warning("Erro ao enviar WhatsApp (escalonamento): %s", e)
        return False


def _responsaveis_financeiros(imovel_id: int) -> list:
    """
    Retorna proprietário + todos os administradores vinculados ao imóvel,
    cada um com telegram_chat_id e telefone (quando existirem).
    """
    from app.db import engine
    from sqlalchemy import text as sqlt

    responsaveis = []
    with engine.connect() as conn:
        row_dono = conn.execute(sqlt("""
            SELECT p.id, p.telegram_chat_id, p.telefone, p.nome
            FROM imoveis_rurais ir
            JOIN produtores p ON p.id = ir.produtor_id
            WHERE ir.id = :imovel_id
        """), {"imovel_id": imovel_id}).fetchone()
        if row_dono:
            responsaveis.append({
                "produtor_id": row_dono[0], "telegram_chat_id": row_dono[1],
                "telefone": row_dono[2], "nome": row_dono[3], "papel": "proprietario",
            })

        rows_admin = conn.execute(sqlt("""
            SELECT p.id, p.telegram_chat_id, p.telefone, p.nome
            FROM participacoes_imovel pi
            JOIN produtores p ON p.id = pi.produtor_id
            WHERE pi.imovel_id = :imovel_id
              AND pi.vigencia_fim IS NULL
              AND pi.tipo_vinculo = 'administrador'
        """), {"imovel_id": imovel_id}).fetchall()
        ids_ja_incluidos = {r["produtor_id"] for r in responsaveis}
        for r in rows_admin:
            if r[0] in ids_ja_incluidos:
                continue
            responsaveis.append({
                "produtor_id": r[0], "telegram_chat_id": r[1],
                "telefone": r[2], "nome": r[3], "papel": "administrador",
            })
            ids_ja_incluidos.add(r[0])

    return responsaveis


async def notificar_responsavel_financeiro(imovel_id: int, mensagem: str) -> dict:
    """
    Envia `mensagem` pro proprietário + todos os administradores do imóvel,
    sempre tentando os dois canais (Telegram e WhatsApp) para cada um,
    conforme decidido em 25/07.

    Retorna resumo: {notificados: [...], falhas: [...]}
    """
    responsaveis = _responsaveis_financeiros(imovel_id)
    notificados, falhas = [], []

    if not responsaveis:
        logger.error(
            "notificar_responsavel_financeiro: nenhum proprietario/administrador "
            "encontrado para imovel_id=%s -- pendencia ficara sem notificacao ate "
            "alguem consultar manualmente.", imovel_id
        )
        return {"notificados": [], "falhas": ["nenhum_responsavel_cadastrado"]}

    for r in responsaveis:
        ok_tg = await _enviar_telegram(r["telegram_chat_id"], mensagem)
        ok_wa = _enviar_whatsapp_sync(r["telefone"], mensagem)
        if ok_tg or ok_wa:
            notificados.append({"produtor_id": r["produtor_id"], "nome": r["nome"],
                                 "telegram": ok_tg, "whatsapp": ok_wa})
        else:
            falhas.append({"produtor_id": r["produtor_id"], "nome": r["nome"]})

    return {"notificados": notificados, "falhas": falhas}


def criar_pendencia_classificacao(
    imovel_id: int, colaborador_id: int, origem_canal: str, origem_numero: str,
    texto_original: str, produto: str = None, quantidade=None, unidade: str = None,
    valor=None, sugestao_conta: str = None, confianca: str = None,
) -> int:
    """
    Registra a pendência no banco. Retorna o id criado (usado depois pra
    resolver quando o responsável financeiro responder).
    """
    from app.db import engine
    from sqlalchemy import text as sqlt

    with engine.connect() as conn:
        row = conn.execute(sqlt("""
            INSERT INTO pendencias_classificacao
                (imovel_id, colaborador_id, origem_canal, origem_numero,
                 texto_original, produto, quantidade, unidade, valor,
                 sugestao_conta, confianca)
            VALUES
                (:imovel_id, :colaborador_id, :origem_canal, :origem_numero,
                 :texto_original, :produto, :quantidade, :unidade, :valor,
                 :sugestao_conta, :confianca)
            RETURNING id
        """), {
            "imovel_id": imovel_id, "colaborador_id": colaborador_id,
            "origem_canal": origem_canal, "origem_numero": origem_numero,
            "texto_original": texto_original, "produto": produto,
            "quantidade": quantidade, "unidade": unidade, "valor": valor,
            "sugestao_conta": sugestao_conta, "confianca": confianca,
        }).fetchone()
        conn.commit()
        return row[0]


def pendencias_abertas_para_produtor(produtor_id: int) -> list:
    """
    Lista pendências abertas dos imóveis onde este produtor é proprietário
    ou administrador -- usado quando ele responde, pra saber a qual
    pendência a resposta se refere.
    """
    from app.db import engine
    from sqlalchemy import text as sqlt

    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT pc.id, pc.texto_original, pc.produto, pc.quantidade,
                   pc.unidade, pc.valor, pc.sugestao_conta, pc.criado_em
            FROM pendencias_classificacao pc
            WHERE pc.status = 'aberta'
              AND pc.imovel_id IN (
                  SELECT ir.id FROM imoveis_rurais ir WHERE ir.produtor_id = :pid
                  UNION
                  SELECT pi.imovel_id FROM participacoes_imovel pi
                  WHERE pi.produtor_id = :pid AND pi.vigencia_fim IS NULL
                    AND pi.tipo_vinculo = 'administrador'
              )
            ORDER BY pc.criado_em ASC
        """), {"pid": produtor_id}).fetchall()
        return [dict(r._mapping) for r in rows]


def resolver_pendencia(pendencia_id: int, conta_final: str, resolvido_por_produtor_id: int) -> None:
    from app.db import engine
    from sqlalchemy import text as sqlt

    with engine.connect() as conn:
        conn.execute(sqlt("""
            UPDATE pendencias_classificacao
            SET status = 'resolvida', conta_final = :conta_final,
                resolvido_por_produtor_id = :pid, resolvido_em = NOW()
            WHERE id = :id
        """), {"conta_final": conta_final, "pid": resolvido_por_produtor_id, "id": pendencia_id})
        conn.commit()
