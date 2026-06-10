"""
RuralCaixa — app/services/caprino_tarefas.py
Motor de geração de tarefas por protocolo e por evento.
"""

import hashlib
from datetime import date, timedelta
from typing import Optional


def _hash_tarefa(animal_id, lote_id, imovel_id, tipo, titulo, data_prevista, origem):
    alvo = f"{animal_id or ''}:{lote_id or ''}:{imovel_id or ''}"
    titulo_norm = titulo.lower().strip()
    raw = f"{alvo}:{tipo}:{titulo_norm}:{data_prevista.isoformat()}:{origem}"
    return hashlib.sha256(raw.encode()).hexdigest()


def gerar_tarefas_por_protocolo(
    cur,
    imovel_id: int,
    animal_id: Optional[int],
    lote_id: Optional[int],
    fase_lote: str,
    data_ref: Optional[date] = None,
    origem: str = "protocolo",
    responsavel_nome: Optional[str] = None,
    responsavel_tel: Optional[str] = None,
) -> int:
    """
    Busca o protocolo padrão para a fase e gera todas as tarefas das etapas.
    Retorna o número de tarefas criadas (ignora duplicatas por hash).
    """
    if data_ref is None:
        data_ref = date.today()

    # Busca protocolo ativo para a fase
    cur.execute("""
        SELECT p.id FROM caprino_protocolo_manejo p
        WHERE p.fase_lote = %s
          AND p.tipo_evento_gatilho = 'entrada_lote'
          AND p.ativo = TRUE
          AND (p.imovel_id = %s OR p.imovel_id IS NULL)
        ORDER BY p.imovel_id DESC NULLS LAST
        LIMIT 1
    """, (fase_lote, imovel_id))
    proto = cur.fetchone()
    if not proto:
        return 0

    protocolo_id = proto["id"] if hasattr(proto, '__getitem__') else proto[0]

    # Busca etapas ativas
    cur.execute("""
        SELECT * FROM caprino_protocolo_etapa
        WHERE protocolo_id = %s AND ativo = TRUE
        ORDER BY ordem
    """, (protocolo_id,))
    etapas = cur.fetchall()

    criadas = 0
    for etapa in etapas:
        e = dict(etapa)
        data_prev = data_ref + timedelta(days=e["offset_dias"])
        data_venc = data_prev + timedelta(days=e.get("prazo_dias") or 3)
        h = _hash_tarefa(animal_id, lote_id, imovel_id, e["tipo"],
                         e["titulo"], data_prev, origem)

        cur.execute("""
            INSERT INTO caprino_tarefas
                (imovel_id, animal_id, lote_id, protocolo_id, protocolo_etapa_id,
                 tipo, titulo, prioridade, data_prevista, data_vencimento,
                 recorrencia_dias, origem, responsavel_nome, responsavel_telefone,
                 hash_unicidade)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (hash_unicidade) DO NOTHING
        """, (imovel_id, animal_id, lote_id, protocolo_id, e["id"],
              e["tipo"], e["titulo"], e["prioridade"], data_prev, data_venc,
              e.get("recorrencia_dias"), origem,
              responsavel_nome, responsavel_tel, h))

        if cur.rowcount > 0:
            criadas += 1

    return criadas


def gerar_tarefas_cobertura(
    cur,
    imovel_id: int,
    animal_id: int,
    data_cobertura: date,
    responsavel_tel: Optional[str] = None,
) -> int:
    """Gera tarefas do protocolo de cobertura + previsão de parto."""
    cur.execute("""
        SELECT id FROM caprino_protocolo_manejo
        WHERE tipo_evento_gatilho = 'cobertura' AND ativo = TRUE
        LIMIT 1
    """)
    proto = cur.fetchone()
    if not proto:
        return 0

    protocolo_id = dict(proto)["id"]
    cur.execute("""
        SELECT * FROM caprino_protocolo_etapa
        WHERE protocolo_id = %s AND ativo = TRUE ORDER BY ordem
    """, (protocolo_id,))
    etapas = cur.fetchall()

    criadas = 0
    for etapa in etapas:
        e = dict(etapa)
        data_prev = data_cobertura + timedelta(days=e["offset_dias"])
        data_venc = data_prev + timedelta(days=e.get("prazo_dias") or 5)
        h = _hash_tarefa(animal_id, None, imovel_id, e["tipo"],
                         e["titulo"], data_prev, "evento_cobertura")

        cur.execute("""
            INSERT INTO caprino_tarefas
                (imovel_id, animal_id, protocolo_id, protocolo_etapa_id,
                 tipo, titulo, prioridade, data_prevista, data_vencimento,
                 origem, responsavel_telefone, hash_unicidade)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'evento',%s,%s)
            ON CONFLICT (hash_unicidade) DO NOTHING
        """, (imovel_id, animal_id, protocolo_id, e["id"],
              e["tipo"], e["titulo"], e["prioridade"],
              data_prev, data_venc, responsavel_tel, h))

        if cur.rowcount > 0:
            criadas += 1

    return criadas


def concluir_tarefa(cur, tarefa_id: int, executado_por: str,
                    observacao: str = None, payload: dict = None) -> Optional[int]:
    """
    Conclui uma tarefa. Se for recorrente, gera a próxima instância.
    Retorna o ID da nova tarefa se gerada.
    """
    cur.execute("SELECT * FROM caprino_tarefas WHERE id = %s", (tarefa_id,))
    tarefa = cur.fetchone()
    if not tarefa:
        return None

    t = dict(tarefa)

    # Atualiza status
    cur.execute("""
        UPDATE caprino_tarefas
        SET status='concluida', data_conclusao=CURRENT_DATE,
            concluida_por=%s, updated_at=NOW()
        WHERE id=%s
    """, (executado_por, tarefa_id))

    # Registra execução
    import json
    cur.execute("""
        INSERT INTO caprino_tarefa_execucao
            (tarefa_id, acao, executado_por, observacao, status_resultante, payload_json)
        VALUES (%s,'concluida',%s,%s,'concluida',%s)
    """, (tarefa_id, executado_por, observacao,
          json.dumps(payload) if payload else None))

    # Se recorrente, gera próxima
    nova_id = None
    if t.get("recorrencia_dias"):
        proxima = t["data_prevista"] + timedelta(days=t["recorrencia_dias"])
        venc = proxima + timedelta(days=3)
        h = _hash_tarefa(t["animal_id"], t["lote_id"], t["imovel_id"],
                         t["tipo"], t["titulo"], proxima, t["origem"])
        cur.execute("""
            INSERT INTO caprino_tarefas
                (imovel_id, animal_id, lote_id, protocolo_id, protocolo_etapa_id,
                 tipo, titulo, prioridade, data_prevista, data_vencimento,
                 recorrencia_dias, origem, responsavel_nome, responsavel_telefone,
                 hash_unicidade)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (hash_unicidade) DO NOTHING
            RETURNING id
        """, (t["imovel_id"], t["animal_id"], t["lote_id"],
              t.get("protocolo_id"), t.get("protocolo_etapa_id"),
              t["tipo"], t["titulo"], t["prioridade"],
              proxima, venc, t["recorrencia_dias"], t["origem"],
              t.get("responsavel_nome"), t.get("responsavel_telefone"), h))
        row = cur.fetchone()
        if row:
            nova_id = dict(row)["id"]

    return nova_id
