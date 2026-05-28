patch = """

# ── eSocial ────────────────────────────────────────────────────────────────────

@app.get("/produtores/{produtor_id}/esocial/config")
def get_esocial_config(produtor_id: int):
    from sqlalchemy import text
    with engine.connect() as conn:
        cfg = conn.execute(text("SELECT * FROM esocial_config WHERE produtor_id=:id"), {"id": produtor_id}).fetchone()
        prod = conn.execute(text("SELECT nome, cpf FROM produtores WHERE id=:id"), {"id": produtor_id}).fetchone()
        if not prod: raise HTTPException(404, "Produtor nao encontrado")
        return {
            "produtor": {"id": produtor_id, "nome": prod[0], "cpf": prod[1]},
            "config": {"ambiente": cfg[2] if cfg else "2", "versao_layout": cfg[3] if cfg else "S-1.3"}
        }

@app.get("/produtores/{produtor_id}/esocial/trabalhadores")
def listar_trabalhadores(produtor_id: int):
    from sqlalchemy import text
    with engine.connect() as conn:
        sql = "SELECT id, nome, cpf, cargo, data_admissao, data_demissao, ativo, categoria, municipio, uf FROM esocial_trabalhadores WHERE produtor_id=:id ORDER BY nome"
        rows = conn.execute(text(sql), {"id": produtor_id}).fetchall()
        return [{"id": r[0], "nome": r[1], "cpf": r[2], "cargo": r[3],
                 "data_admissao": str(r[4]), "data_demissao": str(r[5]) if r[5] else None,
                 "ativo": r[6], "categoria": r[7], "municipio": r[8], "uf": r[9]} for r in rows]

@app.post("/produtores/{produtor_id}/esocial/trabalhadores")
def criar_trabalhador(produtor_id: int, dados: dict = Body(...)):
    from sqlalchemy import text
    with engine.connect() as conn:
        sql = "INSERT INTO esocial_trabalhadores (produtor_id, imovel_id, cpf, nome, data_nascimento, data_admissao, cargo, cbo, categoria, municipio, uf) VALUES (:pid, :iid, :cpf, :nome, :nasc, :adm, :cargo, :cbo, :cat, :mun, :uf) RETURNING id"
        row = conn.execute(text(sql), {
            "pid": produtor_id, "iid": dados.get("imovel_id"),
            "cpf": dados["cpf"], "nome": dados["nome"],
            "nasc": dados.get("data_nascimento"), "adm": dados["data_admissao"],
            "cargo": dados.get("cargo", "Trabalhador Rural"), "cbo": dados.get("cbo", "613005"),
            "cat": dados.get("categoria", "701"), "mun": dados.get("municipio"), "uf": dados.get("uf")
        })
        conn.commit()
        return {"id": row.fetchone()[0]}

@app.get("/produtores/{produtor_id}/esocial/s1260")
def listar_s1260(produtor_id: int, per_apur: str = None):
    from sqlalchemy import text
    with engine.connect() as conn:
        q = "SELECT id, per_apur, nif_adquirente, nome_adquirente, vr_bruto_comerc, vr_rat, vr_senar, status FROM esocial_s1260 WHERE produtor_id=:id"
        params = {"id": produtor_id}
        if per_apur:
            q += " AND per_apur=:per"
            params["per"] = per_apur
        q += " ORDER BY per_apur DESC"
        rows = conn.execute(text(q), params).fetchall()
        return [{"id": r[0], "per_apur": r[1], "nif_adquirente": r[2],
                 "nome_adquirente": r[3], "vr_bruto_comerc": float(r[4]),
                 "vr_rat": float(r[5]), "vr_senar": float(r[6]), "status": r[7]} for r in rows]

@app.post("/produtores/{produtor_id}/esocial/s1260")
def criar_s1260(produtor_id: int, dados: dict = Body(...)):
    from sqlalchemy import text
    vr = float(dados["vr_bruto_comerc"])
    aliq_rat = float(dados.get("aliq_rat", 1.5))
    aliq_senar = float(dados.get("aliq_senar", 0.2))
    vr_rat = round(vr * aliq_rat / 100, 2)
    vr_senar = round(vr * aliq_senar / 100, 2)
    with engine.connect() as conn:
        sql = "INSERT INTO esocial_s1260 (produtor_id, imovel_id, per_apur, tipo_insc_adq, nif_adquirente, nome_adquirente, vr_bruto_comerc, vr_rat, vr_senar, aliq_rat, aliq_senar, lancamento_id) VALUES (:pid, :iid, :per, :tipo, :nif, :nome, :vr, :rat, :senar, :arat, :asenar, :lid) RETURNING id"
        row = conn.execute(text(sql), {
            "pid": produtor_id, "iid": dados.get("imovel_id"),
            "per": dados["per_apur"], "tipo": dados.get("tipo_insc_adq", "2"),
            "nif": dados["nif_adquirente"], "nome": dados.get("nome_adquirente"),
            "vr": vr, "rat": vr_rat, "senar": vr_senar,
            "arat": aliq_rat, "asenar": aliq_senar, "lid": dados.get("lancamento_id")
        })
        conn.commit()
        return {"id": row.fetchone()[0], "vr_rat": vr_rat, "vr_senar": vr_senar}

@app.get("/produtores/{produtor_id}/esocial/s1200")
def listar_s1200(produtor_id: int, per_apur: str = None):
    from sqlalchemy import text
    with engine.connect() as conn:
        q = "SELECT s.id, s.per_apur, t.nome, t.cpf, s.vr_salario, s.vr_desconto_inss, s.vr_liquido, s.qtd_dias_trab, s.status FROM esocial_s1200 s JOIN esocial_trabalhadores t ON t.id=s.trabalhador_id WHERE s.produtor_id=:id"
        params = {"id": produtor_id}
        if per_apur:
            q += " AND s.per_apur=:per"
            params["per"] = per_apur
        q += " ORDER BY s.per_apur DESC, t.nome"
        rows = conn.execute(text(q), params).fetchall()
        return [{"id": r[0], "per_apur": r[1], "nome": r[2], "cpf": r[3],
                 "vr_salario": float(r[4]), "vr_desconto_inss": float(r[5]),
                 "vr_liquido": float(r[6]), "qtd_dias_trab": r[7], "status": r[8]} for r in rows]

@app.post("/produtores/{produtor_id}/esocial/s1200")
def criar_s1200(produtor_id: int, dados: dict = Body(...)):
    from sqlalchemy import text
    vr_sal = float(dados["vr_salario"])
    inss = round(vr_sal * 0.09, 2)
    liquido = round(vr_sal - inss, 2)
    with engine.connect() as conn:
        sql = "INSERT INTO esocial_s1200 (produtor_id, trabalhador_id, per_apur, vr_salario, vr_desconto_inss, vr_liquido, qtd_dias_trab) VALUES (:pid, :tid, :per, :sal, :inss, :liq, :dias) RETURNING id"
        row = conn.execute(text(sql), {
            "pid": produtor_id, "tid": dados["trabalhador_id"],
            "per": dados["per_apur"], "sal": vr_sal,
            "inss": dados.get("vr_desconto_inss", inss),
            "liq": dados.get("vr_liquido", liquido),
            "dias": dados.get("qtd_dias_trab", 30)
        })
        conn.commit()
        return {"id": row.fetchone()[0], "vr_desconto_inss": inss, "vr_liquido": liquido}

@app.get("/produtores/{produtor_id}/esocial/resumo")
def resumo_esocial(produtor_id: int, per_apur: str = None):
    from sqlalchemy import text
    with engine.connect() as conn:
        p = {"id": produtor_id}
        filtro = " AND per_apur=:per" if per_apur else ""
        if per_apur: p["per"] = per_apur
        r1 = conn.execute(text(f"SELECT COUNT(*), COALESCE(SUM(vr_bruto_comerc),0), COALESCE(SUM(vr_rat),0), COALESCE(SUM(vr_senar),0) FROM esocial_s1260 WHERE produtor_id=:id{filtro}"), p).fetchone()
        r2 = conn.execute(text(f"SELECT COUNT(*), COALESCE(SUM(vr_salario),0), COALESCE(SUM(vr_desconto_inss),0), COALESCE(SUM(vr_liquido),0) FROM esocial_s1200 WHERE produtor_id=:id{filtro}"), p).fetchone()
        r3 = conn.execute(text("SELECT COUNT(*) FROM esocial_trabalhadores WHERE produtor_id=:id AND ativo=TRUE"), {"id": produtor_id}).fetchone()
        return {
            "per_apur": per_apur or "todos",
            "s1260": {"qtd": r1[0], "vr_bruto": float(r1[1]), "vr_rat": float(r1[2]), "vr_senar": float(r1[3])},
            "s1200": {"qtd": r2[0], "vr_salarios": float(r2[1]), "vr_inss": float(r2[2]), "vr_liquido": float(r2[3])},
            "trabalhadores_ativos": r3[0]
        }
"""

with open("app/main.py", "a", encoding="utf-8") as f:
    f.write(patch)
print("Endpoints eSocial adicionados!")
