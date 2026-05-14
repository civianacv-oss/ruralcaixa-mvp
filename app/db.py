from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"))

def gravar_lancamento(dados: dict) -> int:
    with engine.connect() as conn:
        # busca produtor pelo telefone
        prod = conn.execute(text(
            "SELECT id FROM produtores WHERE telefone = :tel"
        ), {"tel": dados.get("numero", "")}).fetchone()

        produtor_id = prod[0] if prod else 1

        # busca primeiro imovel do produtor
        imovel = conn.execute(text(
            "SELECT id FROM imoveis_rurais WHERE produtor_id = :pid LIMIT 1"
        ), {"pid": produtor_id}).fetchone()

        imovel_id = imovel[0] if imovel else None

        result = conn.execute(text("""
            INSERT INTO lancamentos
                (produtor_id, imovel_id, conta_codigo, tipo, descricao, valor, data_lancamento, origem, texto_original, produto) 
		VALUES
		(:produtor_id, :imovel_id, :conta, :tipo, :descricao, :valor, :data, :origem, :texto, :produto)
            RETURNING id
        """), {
            "produtor_id": produtor_id,
            "imovel_id":   imovel_id,
            "conta":       dados.get("conta"),
            "tipo":        dados.get("tipo"),
            "descricao":   dados.get("texto_original", ""),
            "valor":       dados.get("valor", 0),
            "data":        dados.get("data"),
            "origem":      dados.get("origem", "whatsapp"),
	    "produto":     dados.get("produto"),
            "texto":       dados.get("texto_original", ""),
        })
        conn.commit()

        lancamento_id = result.fetchone()[0]

        # audit log
        import json as _json
        conn.execute(text("""
            INSERT INTO audit_log (tabela, registro_id, acao, usuario, payload)
            VALUES ('lancamentos', :id, 'INSERT', :usuario, cast(:payload as jsonb))
        """), {
            "id": lancamento_id,
            "usuario": dados.get("numero", "whatsapp"),
            "payload": _json.dumps(dados)
        })
        conn.commit()

        return lancamento_id

def buscar_saldo_mes(produtor_id: int) -> float:
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0)
            FROM lancamentos
            WHERE produtor_id = :pid
            AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)
        """), {"pid": produtor_id}).fetchone()
        return float(result[0]) if result else 0.0

def buscar_produtor_por_numero(telefone: str):
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, nome FROM produtores WHERE telefone = :tel"
        ), {"tel": telefone}).fetchone()
        if result:
            return {"id": result[0], "nome": result[1]}
        return None