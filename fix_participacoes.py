from sqlalchemy import create_engine, text
engine = create_engine('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
with engine.connect() as conn:
    conn.execute(text("UPDATE terceiros SET perc_contraparte = 20.0 WHERE id_contraparte = '74032526672'"))
    conn.execute(text("UPDATE terceiros SET perc_contraparte = 40.0 WHERE id_contraparte = '00000000191'"))
    conn.execute(text("UPDATE imoveis_rurais SET participacao = 40.0 WHERE id = 1"))
    conn.commit()
    print('Participacoes atualizadas!')