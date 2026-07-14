from fastapi import FastAPI, HTTPException, Query
from producao_insumos_animal_multiespecie import router as producao_insumos_router
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import psycopg2
import json
from decimal import Decimal
from contratos_api import router as contratos_router
from lancamentos_contrato import router as lanc_router
from routers.ovino import router as ovino_router


app = FastAPI(title="Campo Digital - Super API")

# Habilita CORS para o seu frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(contratos_router)
app.include_router(lanc_router)
app.include_router(ovino_router)

# Helper para JSON
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal): return float(obj)
        return super(DecimalEncoder, self).default(obj)

def get_db_conn():
    return psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")

# --- ENDPOINT DRE (Para o seu Analytics page.tsx) ---
@app.get("/produtores/{produtor_id}/dre")
async def get_dre(produtor_id: int, view_type: str = "managerial", year: int = 2026):
    try:
        conn = get_db_conn()
        cur = conn.cursor()

        # 1. Receitas (eSocial S-1260)
        cur.execute("SELECT SUM(vr_bruto_comerc) FROM esocial_s1260 WHERE produtor_id=%s", (produtor_id,))
        receita_bruta = cur.fetchone()[0] or Decimal('0')

        # 2. Despesas (LCDPR + eSocial Folha)
        cur.execute("SELECT SUM(vr_salario) FROM esocial_s1200 WHERE produtor_id=%s", (produtor_id,))
        folha = cur.fetchone()[0] or Decimal('0')

        cur.execute("""
            SELECT sc.nome, SUM(l.valor) 
            FROM lancamentos l
            JOIN subcontas sc ON l.subconta_id = sc.id
            WHERE l.produtor_id=%s AND sc.tipo='DESPESA'
            GROUP BY sc.nome
        """, (produtor_id,))
        despesas_itens = cur.fetchall()
        total_lcdpr = sum(d[1] for d in despesas_itens)

        total_despesas = folha + total_lcdpr
        resultado = receita_bruta - total_despesas

        # 3. Montar estrutura para o Frontend
        response = {
            "periodo": f"Safra {year}/{year+1}" if view_type == "managerial" else str(year),
            "total_receitas": float(receita_bruta),
            "total_despesas": float(total_despesas),
            "total_geral": float(resultado),
            "detalhamento_por_imovel": [
                {
                    "nome_imovel": "Fazenda Boa Esperanca",
                    "tipo_sociedade": "Condominio (40%)",
                    "total_receitas": float(receita_bruta),
                    "total_despesas": float(total_despesas),
                    "subcontas": {
                        "receitas": {"Venda de Producao": float(receita_bruta)},
                        "despesas": {d[0]: float(d[1]) for d in despesas_itens},
                        "intermediacao": {}
                    }
                }
            ]
        }
        conn.close()
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ENDPOINT ANALYTICS (Evolucao Mensal) ---
@app.get("/produtores/{produtor_id}/analytics")
async def get_analytics(produtor_id: int):
    # Simula evolucao mensal para o grafico de barras
    return {
        "evolucao_mensal": [
            {"mes": "2026-01", "tipo": "receita", "total": 15000},
            {"mes": "2026-01", "tipo": "despesa", "total": 8000},
            {"mes": "2026-02", "tipo": "receita", "total": 27100},
            {"mes": "2026-02", "tipo": "despesa", "total": 12000},
        ]
    }

# --- ENDPOINT NFE (Para o seu NFe page.tsx) ---
class ItemNFe(BaseModel):
    descricao: str
    quantidade: float
    valor_unitario: float

class NFeRequest(BaseModel):
    natureza_operacao: str
    itens: List[ItemNFe]

@app.post("/produtores/{produtor_id}/nfe/notas")
async def emitir_nfe(produtor_id: int, request: NFeRequest):
    return {
        "id": 1001,
        "status": "Autorizada",
        "numero": 452,
        "data_emissao": datetime.now().isoformat()
    }

@app.get("/produtores")
async def list_produtores():
    return [{"id": 1, "nome": "Joao Batista Neves"}]

app.include_router(producao_insumos_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

