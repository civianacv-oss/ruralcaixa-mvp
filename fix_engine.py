with open("app/main.py", encoding="utf-8") as f:
    c = f.read()

# Adiciona import do engine em cada funcao esocial
old = "def get_esocial_config(produtor_id: int):\n    from sqlalchemy import text"
new = "def get_esocial_config(produtor_id: int):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

old = "def listar_trabalhadores(produtor_id: int):\n    from sqlalchemy import text"
new = "def listar_trabalhadores(produtor_id: int):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

old = "def criar_trabalhador(produtor_id: int, dados: dict = Body(...)):\n    from sqlalchemy import text"
new = "def criar_trabalhador(produtor_id: int, dados: dict = Body(...)):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

old = "def listar_s1260(produtor_id: int, per_apur: str = None):\n    from sqlalchemy import text"
new = "def listar_s1260(produtor_id: int, per_apur: str = None):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

old = "def criar_s1260(produtor_id: int, dados: dict = Body(...)):\n    from sqlalchemy import text"
new = "def criar_s1260(produtor_id: int, dados: dict = Body(...)):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

old = "def listar_s1200(produtor_id: int, per_apur: str = None):\n    from sqlalchemy import text"
new = "def listar_s1200(produtor_id: int, per_apur: str = None):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

old = "def criar_s1200(produtor_id: int, dados: dict = Body(...)):\n    from sqlalchemy import text"
new = "def criar_s1200(produtor_id: int, dados: dict = Body(...)):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

old = "def resumo_esocial(produtor_id: int, per_apur: str = None):\n    from sqlalchemy import text"
new = "def resumo_esocial(produtor_id: int, per_apur: str = None):\n    from app.db import engine\n    from sqlalchemy import text"
c = c.replace(old, new, 1)

print("Done")
with open("app/main.py", "w", encoding="utf-8") as f:
    f.write(c)
