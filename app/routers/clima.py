"""
RuralCaixa — routers/clima.py
Integração com a previsão do tempo pública do INMET (Instituto Nacional de
Meteorologia), via API não-oficial https://apiprevmet3.inmet.gov.br/previsao/{codigo_ibge}.

IMPORTANTE — verificar antes de usar em produção:
A API do INMET não tem documentação oficial estável e não foi possível validar
o formato exato da resposta JSON a partir deste ambiente (o site bloqueia
scraping automatizado / robots.txt). O parser abaixo foi escrito de forma
defensiva (aceita algumas variações plausíveis de chave), mas a PRIMEIRA
chamada em produção deve ser conferida manualmente — veja `_parse_previsao_inmet`.
Se o formato divergir, ajuste o parser; o cache faz isso valer a pena mudar
uma vez só.

Adicione em app/main.py:
    from app.routers.clima import router as clima_router
    if clima_router: app.include_router(clima_router)
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
import psycopg2
import psycopg2.extras
import httpx
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Clima"])

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
INMET_PREVISAO_URL = "https://apiprevmet3.inmet.gov.br/previsao/{codigo_ibge}"
IBGE_MUNICIPIOS_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios/{uf}"
CACHE_TTL_HORAS = 6  # a previsão do INMET é atualizada poucas vezes ao dia

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _buscar_codigo_ibge(cidade: str, uf: str) -> Optional[str]:
    """Resolve o código IBGE do município via API pública do IBGE (busca por nome dentro da UF)."""
    try:
        resp = httpx.get(IBGE_MUNICIPIOS_URL.format(uf=uf.upper()), timeout=8)
        resp.raise_for_status()
        municipios = resp.json()
        cidade_norm = cidade.strip().lower()
        for m in municipios:
            if m.get("nome", "").strip().lower() == cidade_norm:
                return str(m["id"])
        # fallback: correspondência parcial
        for m in municipios:
            if cidade_norm in m.get("nome", "").strip().lower():
                return str(m["id"])
    except Exception as e:
        logger.warning(f"[CLIMA] Falha ao buscar código IBGE de {cidade}/{uf}: {e}")
    return None


def _parse_previsao_inmet(codigo_ibge: str, raw: dict) -> dict:
    """
    Normaliza a resposta bruta do INMET em um formato estável para o frontend.
    Escrito defensivamente: tenta algumas variações de chave conhecidas da API
    pública (não documentada oficialmente). Se a estrutura vier diferente do
    esperado, retorna o raw completo em 'raw' para não perder o dado, e marca
    'parse_ok': False para o frontend/monitoramento saberem que o parser
    precisa de ajuste.
    """
    dias = raw.get(codigo_ibge, raw if isinstance(raw, dict) else {})
    previsao_dias = []
    parse_ok = False
    try:
        for data_str, turnos in dias.items():
            if not isinstance(turnos, dict):
                continue
            manha = turnos.get("manha", {}) or {}
            tarde = turnos.get("tarde", {}) or {}
            noite = turnos.get("noite", {}) or {}
            temp_min = manha.get("temp_min") or tarde.get("temp_min") or noite.get("temp_min")
            temp_max = tarde.get("temp_max") or manha.get("temp_max") or noite.get("temp_max")
            previsao_dias.append({
                "data": data_str,
                "temp_min": temp_min,
                "temp_max": temp_max,
                "resumo_manha": manha.get("resumo") or manha.get("icone"),
                "resumo_tarde": tarde.get("resumo") or tarde.get("icone"),
                "resumo_noite": noite.get("resumo") or noite.get("icone"),
                "umidade_min": manha.get("umidade_min") or tarde.get("umidade_min"),
                "umidade_max": manha.get("umidade_max") or tarde.get("umidade_max"),
                "direcao_vento": tarde.get("dir_vento") or manha.get("dir_vento"),
                "intensidade_vento": tarde.get("int_vento") or manha.get("int_vento"),
            })
            parse_ok = True
    except Exception as e:
        logger.warning(f"[CLIMA] Parser do INMET não reconheceu o formato: {e}")

    previsao_dias.sort(key=lambda d: d["data"])
    return {
        "codigo_ibge": codigo_ibge,
        "previsao": previsao_dias,
        "parse_ok": parse_ok,
        "raw": raw if not parse_ok else None,  # só guarda o bruto se o parser falhou (debug)
    }


@router.get("/clima/{cidade}/{uf}")
def obter_clima(cidade: str, uf: str):
    """Previsão do tempo (INMET) para a cidade/UF do imóvel, com cache de
    algumas horas para não sobrecarregar a API pública nem depender dela
    a cada requisição do frontend."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            codigo_ibge = _buscar_codigo_ibge(cidade, uf)
            if not codigo_ibge:
                raise HTTPException(404, f"Município '{cidade}/{uf}' não encontrado na base do IBGE")

            cur.execute("""
                SELECT dados, atualizado_em FROM clima_cache WHERE codigo_ibge = %s
            """, (codigo_ibge,))
            cache = cur.fetchone()
            if cache and cache["atualizado_em"] > datetime.now(cache["atualizado_em"].tzinfo) - timedelta(hours=CACHE_TTL_HORAS):
                return cache["dados"]

            try:
                resp = httpx.get(
                    INMET_PREVISAO_URL.format(codigo_ibge=codigo_ibge),
                    timeout=10, headers={"User-Agent": "RuralCaixa/1.0"},
                )
                resp.raise_for_status()
                dados = _parse_previsao_inmet(codigo_ibge, resp.json())
            except Exception as e:
                logger.warning(f"[CLIMA] Falha ao consultar INMET para {codigo_ibge}: {e}")
                if cache:
                    return cache["dados"]  # serve cache velho em vez de falhar
                raise HTTPException(502, f"Não foi possível obter a previsão do INMET no momento: {e}")

            cur.execute("""
                INSERT INTO clima_cache (codigo_ibge, municipio, uf, dados, fonte, atualizado_em)
                VALUES (%s,%s,%s,%s,'inmet',NOW())
                ON CONFLICT (codigo_ibge) DO UPDATE SET
                    dados = EXCLUDED.dados, atualizado_em = NOW()
            """, (codigo_ibge, cidade, uf.upper(), psycopg2.extras.Json(dados)))
            conn.commit()
            return dados
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()
