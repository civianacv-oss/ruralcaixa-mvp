patch = """

# -- Aportes de Capital e Participacao Dinamica --------------------------------

@app.post("/imoveis/{imovel_id}/aportes")
def registrar_aporte(imovel_id: int, dados: dict = Body(...)):
    from app.db import engine
    from sqlalchemy import text
    from datetime import date
    produtor_id = dados["produtor_id"]
    valor = float(dados["valor"])
    data_aporte = dados.get("data_aporte", date.today().isoformat())
    descricao = dados.get("descricao", "Aporte de capital")
    with engine.connect() as conn:
        # 1. Registra o aporte
        conn.execute(text("""
            INSERT INTO aportes_capital (imovel_id, produtor_id, valor, data_aporte, descricao)
            VALUES (:iid, :pid, :valor, :data, :desc)
        """), {"iid": imovel_id, "pid": produtor_id, "valor": valor, "data": data_aporte, "desc": descricao})
        # 2. Atualiza capital_aportado acumulado
        conn.execute(text("""
            UPDATE participacoes_imovel
            SET capital_aportado = COALESCE(capital_aportado, 0) + :valor
            WHERE imovel_id = :iid AND produtor_id = :pid
        """), {"iid": imovel_id, "pid": produtor_id, "valor": valor})
        # 3. Recalcula percentuais de todos os socios
        total = conn.execute(text(
            "SELECT COALESCE(SUM(capital_aportado), 0) FROM participacoes_imovel WHERE imovel_id=:iid"
        ), {"iid": imovel_id}).fetchone()[0]
        if float(total) > 0:
            socios = conn.execute(text(
                "SELECT id, produtor_id, capital_aportado FROM participacoes_imovel WHERE imovel_id=:iid"
            ), {"iid": imovel_id}).fetchall()
            for s in socios:
                novo_perc = round(float(s[2] or 0) / float(total) * 100, 4)
                # Fecha vigencia anterior
                conn.execute(text("""
                    UPDATE participacoes_imovel SET vigencia_fim = :data
                    WHERE id = :id AND vigencia_fim IS NULL
                """), {"id": s[0], "data": data_aporte})
                # Cria nova vigencia
                conn.execute(text("""
                    INSERT INTO participacoes_imovel
                        (imovel_id, produtor_id, percentual, nome_participante, vigencia_inicio, capital_aportado)
                    SELECT :iid, :pid, :perc, nome_participante, :data, :cap
                    FROM participacoes_imovel WHERE id = :old_id
                """), {"iid": imovel_id, "pid": s[1], "perc": novo_perc,
                       "data": data_aporte, "cap": float(s[2] or 0), "old_id": s[0]})
        conn.commit()
        # 4. Retorna participacoes atualizadas
        rows = conn.execute(text("""
            SELECT p.produtor_id, pr.nome, p.percentual, p.capital_aportado, p.vigencia_inicio
            FROM participacoes_imovel p JOIN produtores pr ON pr.id = p.produtor_id
            WHERE p.imovel_id = :iid AND p.vigencia_fim IS NULL
            ORDER BY p.percentual DESC
        """), {"iid": imovel_id}).fetchall()
        total_cap = sum(float(r[3] or 0) for r in rows)
        return {
            "imovel_id": imovel_id,
            "data_aporte": data_aporte,
            "total_capital": total_cap,
            "participacoes": [
                {"produtor_id": r[0], "nome": r[1], "percentual": float(r[2]),
                 "capital_aportado": float(r[3] or 0), "vigencia_inicio": str(r[4])}
                for r in rows
            ]
        }

@app.get("/imoveis/{imovel_id}/aportes")
def listar_aportes(imovel_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT a.id, a.produtor_id, pr.nome, a.valor, a.data_aporte, a.descricao, a.created_at
            FROM aportes_capital a JOIN produtores pr ON pr.id = a.produtor_id
            WHERE a.imovel_id = :iid
            ORDER BY a.data_aporte DESC
        """), {"iid": imovel_id}).fetchall()
        total_por_socio = conn.execute(text("""
            SELECT produtor_id, SUM(valor) as total
            FROM aportes_capital WHERE imovel_id = :iid
            GROUP BY produtor_id
        """), {"iid": imovel_id}).fetchall()
        total_geral = sum(float(r[1]) for r in total_por_socio)
        return {
            "total_capital": total_geral,
            "por_socio": [{"produtor_id": r[0], "total": float(r[1]),
                           "percentual": round(float(r[1])/total_geral*100, 2) if total_geral > 0 else 0}
                          for r in total_por_socio],
            "historico": [{"id": r[0], "produtor_id": r[1], "nome": r[2], "valor": float(r[3]),
                           "data_aporte": str(r[4]), "descricao": r[5]} for r in rows]
        }
"""

with open("app/main.py", "a", encoding="utf-8") as f:
    f.write(patch)
print("OK - endpoints aportes adicionados!")
