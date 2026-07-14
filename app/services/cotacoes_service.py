"""
app/services/cotacoes_service.py

Busca cotacoes do CEPEA (boi gordo, bezerro) e mantem cache em
cotacoes_mercado. Uso nao-comercial (CC BY-NC 4.0) -- sempre exibir
"Fonte: CEPEA" onde o valor aparecer.

Fetch e parsing sao tolerantes a falha: se o CEPEA mudar o HTML ou
estiver fora do ar, a funcao retorna o ultimo valor em cache (se houver)
sem quebrar o cron de alertas.
"""
import logging
import re
from datetime import date
from typing import Optional

import httpx
import psycopg2.extras

logger = logging.getLogger(__name__)

URL_BOI_GORDO = "https://cepea.org.br/br/indicador/boi-gordo.aspx"
URL_BEZERRO = "https://cepea.org.br/br/indicador/bezerro.aspx"


def _parse_indicador_cepea(html: str) -> Optional[tuple]:
    """Extrai (data, valor) da primeira linha de dado da tabela principal."""
    texto = re.sub(r"<[^>]+>", " ", html)
    texto = re.sub(r"&nbsp;|&amp;", " ", texto)
    idx = texto.upper().find("INDICADOR")
    if idx == -1:
        idx = 0
    trecho = texto[idx : idx + 3000]
    m = re.search(r"(\d{2}/\d{2}/\d{4})\s+([\d]{2,3},\d{2})", trecho)
    if not m:
        return None
    data_str, valor_str = m.group(1), m.group(2)
    dia, mes, ano = data_str.split("/")
    try:
        data_ref = date(int(ano), int(mes), int(dia))
        valor = float(valor_str.replace(",", "."))
        return data_ref, valor
    except (ValueError, TypeError):
        return None


def _salvar_cotacao(conn, produto: str, data_ref: date, valor: float, unidade: str = "R$/arroba"):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO cotacoes_mercado (produto, data_referencia, valor, unidade, fonte)
        VALUES (%s, %s, %s, %s, 'CEPEA')
        ON CONFLICT (produto, data_referencia) DO UPDATE SET valor = EXCLUDED.valor
        """,
        (produto, data_ref, valor, unidade),
    )
    conn.commit()


def garantir_cotacoes_atualizadas(conn) -> Optional[float]:
    """
    Busca a cotacao do boi gordo de hoje se ainda nao estiver salva
    (e a do bezerro, se aplicavel). Retorna o valor mais recente do
    boi gordo (R$/arroba) disponivel, ou None se nunca conseguiu buscar.
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT 1 FROM cotacoes_mercado
        WHERE produto = 'boi_gordo_arroba' AND data_referencia = CURRENT_DATE
        """
    )
    ja_atualizado_hoje = cur.fetchone() is not None

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "pt-BR,pt;q=0.9",
    }

    if not ja_atualizado_hoje:
        try:
            resp = httpx.get(URL_BOI_GORDO, timeout=15, follow_redirects=True, headers=headers)
            parsed = _parse_indicador_cepea(resp.text)
            if parsed:
                _salvar_cotacao(conn, "boi_gordo_arroba", parsed[0], parsed[1], "R$/arroba")
            else:
                logger.warning(
                    "Nao foi possivel extrair cotacao do boi gordo do HTML do CEPEA. "
                    "status=%s trecho_html=%s",
                    resp.status_code,
                    resp.text[:500].replace("\n", " "),
                )
        except Exception as e:
            logger.warning("Falha ao buscar cotacao boi gordo CEPEA: %s", e)

        try:
            resp2 = httpx.get(URL_BEZERRO, timeout=15, follow_redirects=True, headers=headers)
            parsed2 = _parse_indicador_cepea(resp2.text)
            if parsed2:
                _salvar_cotacao(conn, "bezerro", parsed2[0], parsed2[1], "R$/cabeca")
            else:
                logger.warning(
                    "Nao foi possivel extrair cotacao do bezerro do HTML do CEPEA. "
                    "status=%s trecho_html=%s",
                    resp2.status_code,
                    resp2.text[:500].replace("\n", " "),
                )
        except Exception as e:
            logger.warning("Falha ao buscar cotacao bezerro CEPEA: %s", e)

    cur.execute(
        """
        SELECT valor FROM cotacoes_mercado
        WHERE produto = 'boi_gordo_arroba'
        ORDER BY data_referencia DESC LIMIT 1
        """
    )
    row = cur.fetchone()
    return float(row["valor"]) if row else None
