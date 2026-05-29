"""
RuralCaixa — app/services/ovino_desvios.py
Motor de detecção de desvios zootécnicos por animal.
Chamado pelo cron a cada 30min via processar_desvios_ovinos().
"""

import hashlib
import json
import logging
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

DB_URL = None  # injetado via import


def _hash_desvio(animal_id: int, tipo: str, chave_contexto: str, data_ref: date) -> str:
    raw = f"{animal_id}:{tipo}:{chave_contexto}:{data_ref.isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _emitir_alerta(cur, imovel_id, animal_id, lote_id, tipo_alerta,
                   severidade, titulo, descricao, data_ref,
                   valor_detectado, detalhes, cooldown_horas) -> bool:
    """
    Emite alerta de desvio respeitando cooldown e hash de unicidade.
    Retorna True se foi criado.
    """
    h = _hash_desvio(animal_id, tipo_alerta,
                     f"{severidade}:{data_ref.isoformat()[:7]}", data_ref)

    # Verifica cooldown — não emite se já existe alerta do mesmo tipo
    # criado dentro do período de cooldown
    cur.execute("""
        SELECT id FROM ovino_alertas
        WHERE animal_id = %s
          AND tipo_alerta = %s
          AND prioridade = %s
          AND origem_evento = 'desvio'
          AND created_at >= NOW() - INTERVAL '1 hour' * %s
        LIMIT 1
    """, (animal_id, tipo_alerta, severidade, cooldown_horas))

    if cur.fetchone():
        return False  # em cooldown

    cur.execute("""
        INSERT INTO ovino_alertas
            (imovel_id, animal_id, lote_id, tipo_alerta, titulo, descricao,
             data_referencia, data_vencimento, prioridade, origem_evento,
             valor_detectado, detalhes_json, hash_unicidade)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'desvio',%s,%s::jsonb,%s)
        ON CONFLICT (hash_unicidade) DO NOTHING
    """, (imovel_id, animal_id, lote_id, tipo_alerta, titulo, descricao,
          data_ref, data_ref + timedelta(days=1), severidade,
          valor_detectado, json.dumps(detalhes, default=str), h))

    return cur.rowcount > 0


def _resolver_categoria(fase_lote: str, sexo: str) -> str:
    if fase_lote == "engorda":
        return "engorda"
    if fase_lote == "recria":
        return "recria"
    if fase_lote == "reprodução":
        return "matriz_seca" if sexo == "F" else "reprodutor"
    if fase_lote == "cria":
        return "cria"
    if fase_lote == "descarte":
        return "engorda"
    return "engorda"


def _carregar_parametros(cur, categoria: str, imovel_id: int) -> dict:
    """Carrega parâmetros para a categoria, preferindo os do imóvel."""
    cur.execute("""
        SELECT tipo_regra, janela_dias, limite_medio, limite_alto,
               cooldown_horas_medio, cooldown_horas_alto
        FROM ovino_parametro_monitoramento
        WHERE categoria = %s
          AND ativo = TRUE
          AND (imovel_id = %s OR imovel_id IS NULL)
        ORDER BY imovel_id DESC NULLS LAST
    """, (categoria, imovel_id))

    params = {}
    seen = set()
    for r in cur.fetchall():
        p = dict(r)
        tipo = p["tipo_regra"]
        if tipo not in seen:
            params[tipo] = p
            seen.add(tipo)
    return params


def _avaliar_gmd(cur, animal, params, data_ref, imovel_id, categoria) -> int:
    p = params.get("gmd_minimo_kg_dia")
    if not p:
        return 0

    janela = p["janela_dias"] or 15
    cur.execute("""
        SELECT peso_kg, data_pesagem FROM ovino_pesagens
        WHERE animal_id = %s AND data_pesagem >= %s AND data_pesagem <= %s
        ORDER BY data_pesagem DESC LIMIT 2
    """, (animal["id"], data_ref - timedelta(days=janela), data_ref))
    pesagens = cur.fetchall()
    if len(pesagens) < 2:
        return 0

    atual, anterior = dict(pesagens[0]), dict(pesagens[1])
    dias = (atual["data_pesagem"] - anterior["data_pesagem"]).days
    if dias <= 0:
        return 0

    gmd = (float(atual["peso_kg"]) - float(anterior["peso_kg"])) / dias

    severidade = None
    if gmd < float(p["limite_alto"]):
        severidade = "alta"
        cooldown = p["cooldown_horas_alto"]
    elif gmd < float(p["limite_medio"]):
        severidade = "media"
        cooldown = p["cooldown_horas_medio"]

    if not severidade:
        return 0

    titulo = f"⚠️ GMD baixo: {gmd:.3f} kg/dia ({animal['brinco']})"
    descricao = (f"Animal {animal['brinco']} em {categoria}: GMD de {gmd:.3f} kg/dia "
                 f"(limite {p['limite_medio']} médio / {p['limite_alto']} alto)")
    detalhes = {
        "peso_anterior": float(anterior["peso_kg"]),
        "data_anterior": anterior["data_pesagem"].isoformat(),
        "peso_atual": float(atual["peso_kg"]),
        "data_atual": atual["data_pesagem"].isoformat(),
        "dias": dias, "gmd": round(gmd, 3),
    }

    criado = _emitir_alerta(cur, imovel_id, animal["id"], animal.get("lote_id"),
                            "gmd_baixo", severidade, titulo, descricao,
                            data_ref, round(gmd, 3), detalhes, cooldown)
    return 1 if criado else 0


def _avaliar_estagnacao(cur, animal, params, data_ref, imovel_id, categoria) -> int:
    p = params.get("ganho_periodo_kg")
    if not p:
        return 0

    janela = p["janela_dias"] or 15
    cur.execute("""
        SELECT peso_kg, data_pesagem FROM ovino_pesagens
        WHERE animal_id = %s AND data_pesagem >= %s AND data_pesagem <= %s
        ORDER BY data_pesagem DESC LIMIT 2
    """, (animal["id"], data_ref - timedelta(days=janela), data_ref))
    pesagens = cur.fetchall()
    if len(pesagens) < 2:
        return 0

    atual, anterior = dict(pesagens[0]), dict(pesagens[1])
    ganho = float(atual["peso_kg"]) - float(anterior["peso_kg"])

    severidade = None
    if ganho <= float(p["limite_alto"]):
        severidade = "alta"
        cooldown = p["cooldown_horas_alto"]
    elif ganho < float(p["limite_medio"]):
        severidade = "media"
        cooldown = p["cooldown_horas_medio"]

    if not severidade:
        return 0

    titulo = f"📉 Peso estagnado: +{ganho:.1f} kg em {janela}d ({animal['brinco']})"
    descricao = f"Animal {animal['brinco']}: ganho de apenas {ganho:.1f} kg nos últimos {janela} dias."
    detalhes = {
        "peso_anterior": float(anterior["peso_kg"]),
        "peso_atual": float(atual["peso_kg"]),
        "ganho_periodo": round(ganho, 3),
        "janela_dias": janela,
    }

    criado = _emitir_alerta(cur, imovel_id, animal["id"], animal.get("lote_id"),
                            "peso_estagnado", severidade, titulo, descricao,
                            data_ref, round(ganho, 3), detalhes, cooldown)
    return 1 if criado else 0


def _avaliar_sem_pesagem(cur, animal, params, data_ref, imovel_id, categoria) -> int:
    p = params.get("sem_pesagem_dias")
    if not p:
        return 0

    cur.execute("""
        SELECT data_pesagem FROM ovino_pesagens
        WHERE animal_id = %s ORDER BY data_pesagem DESC LIMIT 1
    """, (animal["id"],))
    ultima = cur.fetchone()

    if ultima:
        dias = (data_ref - dict(ultima)["data_pesagem"]).days
    else:
        dias = 9999

    severidade = None
    if dias > float(p["limite_alto"]):
        severidade = "alta"
        cooldown = p["cooldown_horas_alto"]
    elif dias > float(p["limite_medio"]):
        severidade = "media"
        cooldown = p["cooldown_horas_medio"]

    if not severidade:
        return 0

    titulo = f"⚖️ Sem pesagem há {dias} dias ({animal['brinco']})"
    descricao = f"Animal {animal['brinco']} em {categoria} sem pesagem há {dias} dias."
    detalhes = {"dias_sem_pesagem": dias, "ultima_pesagem": ultima["data_pesagem"].isoformat() if ultima else None}

    criado = _emitir_alerta(cur, imovel_id, animal["id"], animal.get("lote_id"),
                            "sem_pesagem", severidade, titulo, descricao,
                            data_ref, float(dias), detalhes, cooldown)
    return 1 if criado else 0


def _avaliar_prenhez(cur, animal, params, data_ref, imovel_id) -> int:
    if animal.get("sexo") != "F":
        return 0

    p = params.get("sem_prenhez_confirmada")
    if not p:
        return 0

    # Busca cobertura sem diagnóstico ou parto subsequente
    cur.execute("""
        SELECT data_evento FROM ovino_reproducao
        WHERE matriz_id = %s AND tipo = 'monta'
          AND data_evento <= %s
          AND NOT EXISTS (
              SELECT 1 FROM ovino_reproducao r2
              WHERE r2.matriz_id = %s
                AND r2.tipo IN ('parto','aborto')
                AND r2.data_evento > ovino_reproducao.data_evento
          )
        ORDER BY data_evento DESC LIMIT 1
    """, (animal["id"], data_ref, animal["id"]))
    cobertura = cur.fetchone()
    if not cobertura:
        return 0

    dias = (data_ref - dict(cobertura)["data_evento"]).days

    severidade = None
    if dias > float(p["limite_alto"]):
        severidade = "alta"
        cooldown = p["cooldown_horas_alto"]
    elif dias > float(p["limite_medio"]):
        severidade = "media"
        cooldown = p["cooldown_horas_medio"]

    if not severidade:
        return 0

    titulo = f"🐑 Prenhez não confirmada há {dias}d ({animal['brinco']})"
    descricao = f"Fêmea {animal['brinco']} coberta há {dias} dias sem diagnóstico de gestação ou parto."
    detalhes = {"dias_pos_cobertura": dias, "data_cobertura": dict(cobertura)["data_evento"].isoformat()}

    criado = _emitir_alerta(cur, imovel_id, animal["id"], animal.get("lote_id"),
                            "sem_prenhez_confirmada", severidade, titulo, descricao,
                            data_ref, float(dias), detalhes, cooldown)
    return 1 if criado else 0


def processar_desvios_ovinos(imovel_id: Optional[int] = None,
                              data_ref: Optional[date] = None) -> dict:
    """
    Motor principal. Chamado pelo cron a cada 30min.
    Detecta desvios e emite alertas com cooldown.
    """
    import psycopg2
    import psycopg2.extras
    import os

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        return {"erro": "DATABASE_URL não configurada"}

    if data_ref is None:
        data_ref = date.today()

    conn = psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur = conn.cursor()

        # Busca animais ativos com lote e fase
        sql = """
            SELECT a.id, a.brinco, a.sexo, a.lote_id, a.imovel_id,
                   l.fase AS lote_fase
            FROM ovino_animais a
            LEFT JOIN ovino_lotes l ON l.id = a.lote_id
            WHERE a.status = 'ativo'
        """
        params = []
        if imovel_id:
            sql += " AND a.imovel_id = %s"
            params.append(imovel_id)

        cur.execute(sql, params)
        animais = [dict(r) for r in cur.fetchall()]

        total_alertas = 0
        processados = 0

        for animal in animais:
            fase = animal.get("lote_fase") or "engorda"
            categoria = _resolver_categoria(fase, animal.get("sexo", "M"))
            p = _carregar_parametros(cur, categoria, animal["imovel_id"])

            n = 0
            n += _avaliar_gmd(cur, animal, p, data_ref, animal["imovel_id"], categoria)
            n += _avaliar_estagnacao(cur, animal, p, data_ref, animal["imovel_id"], categoria)
            n += _avaliar_sem_pesagem(cur, animal, p, data_ref, animal["imovel_id"], categoria)
            n += _avaliar_prenhez(cur, animal, p, data_ref, animal["imovel_id"])

            total_alertas += n
            processados += 1

        conn.commit()
        logger.info("Desvios ovinos: %d animais, %d alertas", processados, total_alertas)
        return {"animais_processados": processados, "alertas_gerados": total_alertas}

    except Exception as e:
        conn.rollback()
        logger.error("Erro motor desvios: %s", e, exc_info=True)
        return {"erro": str(e)}
    finally:
        conn.close()
