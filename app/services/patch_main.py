# ════════════════════════════════════════════════════════════════════════════
# PATCH main.py — adicionar DRE Gerencial
# Adicione os 2 blocos abaixo no main.py existente
# ════════════════════════════════════════════════════════════════════════════


# ── BLOCO 1: Coloque junto com os outros imports no topo do arquivo ──────────

# (já existe: from typing import Optional)
# Adicionar apenas esta linha nova:
from datetime import date   # provavelmente já existe, verificar


# ── BLOCO 2: Cole no final do arquivo, antes da função processar() ───────────

@app.get("/produtores/{produtor_id}/dre")
def get_dre(
    produtor_id: int,
    view_type: str = Query("managerial", regex="^(fiscal|managerial|custom)$"),
    year: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    visao_integral: bool = Query(False),
):
    """
    DRE Gerencial com proporcionalização inteligente.

    Exemplos:
      GET /produtores/1/dre                                    → safra corrente
      GET /produtores/1/dre?view_type=fiscal&year=2025         → fiscal 2025
      GET /produtores/1/dre?view_type=managerial&year=2024     → safra 2024/2025
      GET /produtores/1/dre?view_type=custom&start_date=2026-01-01&end_date=2026-05-18
      GET /produtores/1/dre?visao_integral=true                → 100% da fazenda
    """
    from app.db import engine
    from app.services.dre_service import gerar_dre
    try:
        return gerar_dre(
            engine=engine,
            produtor_id=produtor_id,
            view_type=view_type,
            year=year,
            start_date=start_date,
            end_date=end_date,
            visao_integral=visao_integral,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/produtores/{produtor_id}/dre/periodos")
def get_dre_periodos(produtor_id: int):
    """Retorna anos/safras disponíveis para popular o seletor no frontend."""
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DISTINCT EXTRACT(YEAR FROM data_lancamento)::int AS ano
            FROM lancamentos
            WHERE produtor_id = :pid
            ORDER BY ano
        """), {"pid": produtor_id}).fetchall()
        anos = [r[0] for r in rows]
        safras = [f"{a}/{a+1}" for a in anos]
        return {"anos_fiscais": anos, "safras": safras}
