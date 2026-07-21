"""
ADICIONAR ao final de app/routers/livro_caixa.py (mesmo arquivo, mesmo
router já existente — não é um arquivo novo).

Dois endpoints novos:
  POST /livro-caixa/{imovel_id}/fechar/{ano_base}/{mes}
      Consolida os lançamentos JÁ sincronizados em livro_caixa_lancamentos
      (via trigger da migration_021) em 1 linha por categoria/tipo, salva
      em livro_caixa_fechamentos. Rodar de novo no mesmo período recalcula
      (idempotente) — não duplica.

  GET /livro-caixa/{imovel_id}/fechamento/{ano_base}/{mes}
      Devolve o fechamento consolidado já salvo, pra tela de revisão.

Os lançamentos brutos em livro_caixa_lancamentos continuam intactos —
isso é só uma camada de consolidação por cima, sem duplicar valor.
"""

@router.post("/{imovel_id}/fechar/{ano_base}/{mes}")
def fechar_mes(imovel_id: int, ano_base: int, mes: int):
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido (use 1-12)")

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT tipo, categoria, SUM(valor) AS total
        FROM livro_caixa_lancamentos
        WHERE imovel_id = %s
          AND ano_base = %s
          AND EXTRACT(MONTH FROM data_lancamento) = %s
        GROUP BY tipo, categoria
    """, (imovel_id, ano_base, mes))
    consolidado = cur.fetchall()

    if not consolidado:
        db.close()
        return {"ok": True, "linhas": 0, "aviso": "Nenhum lançamento encontrado nesse período."}

    # Idempotente: apaga o fechamento anterior desse período antes de
    # recriar, assim rodar de novo (depois de um novo lançamento entrar
    # no mês) sempre reflete o total atualizado.
    cur.execute("""
        DELETE FROM livro_caixa_fechamentos
        WHERE imovel_id = %s AND ano_base = %s AND mes = %s
    """, (imovel_id, ano_base, mes))

    for linha in consolidado:
        cur.execute("""
            INSERT INTO livro_caixa_fechamentos
                (imovel_id, ano_base, mes, tipo, categoria, total)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (imovel_id, ano_base, mes, linha["tipo"], linha["categoria"], float(linha["total"])))

    db.commit()
    db.close()
    return {"ok": True, "linhas": len(consolidado)}


@router.get("/{imovel_id}/fechamento/{ano_base}/{mes}")
def obter_fechamento(imovel_id: int, ano_base: int, mes: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT tipo, categoria, total, fechado_em
        FROM livro_caixa_fechamentos
        WHERE imovel_id = %s AND ano_base = %s AND mes = %s
        ORDER BY tipo DESC, total DESC
    """, (imovel_id, ano_base, mes))
    linhas = [dict(r) for r in cur.fetchall()]
    db.close()

    if not linhas:
        return {"fechado": False, "linhas": []}

    receitas = sum(float(l["total"]) for l in linhas if l["tipo"] == "receita")
    despesas = sum(float(l["total"]) for l in linhas if l["tipo"] == "despesa")

    return {
        "fechado": True,
        "fechado_em": linhas[0]["fechado_em"].isoformat(),
        "receitas": receitas,
        "despesas": despesas,
        "saldo": receitas - despesas,
        "linhas": linhas,
    }


@router.delete("/{imovel_id}/fechamento/{ano_base}/{mes}")
def reabrir_mes(imovel_id: int, ano_base: int, mes: int):
    """
    Reabre um mês fechado — apaga o snapshot de livro_caixa_fechamentos
    pra permitir retificação. Os lançamentos brutos (livro_caixa_lancamentos)
    NÃO são afetados; só o resumo consolidado é removido, e um novo
    "Fechar Mês" pode ser feito depois de corrigir os lançamentos.
    """
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        DELETE FROM livro_caixa_fechamentos
        WHERE imovel_id = %s AND ano_base = %s AND mes = %s
    """, (imovel_id, ano_base, mes))
    linhas_removidas = cur.rowcount
    db.commit()
    db.close()

    if linhas_removidas == 0:
        raise HTTPException(status_code=404, detail="Esse período não está fechado.")

    return {"ok": True, "linhas_removidas": linhas_removidas}
