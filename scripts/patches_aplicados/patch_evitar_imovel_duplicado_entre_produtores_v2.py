"""
patch_evitar_imovel_duplicado_entre_produtores_v2.py

CORRIGE o v1: o patch anterior (patch_evitar_imovel_duplicado_v1.py, de
mesmo-produtor) nunca chegou a ser aplicado de fato em app/db.py — ficou
só no dry-run. Este patch v2 substitui o v1 e o "entre produtores" de uma
vez só, a partir do texto ORIGINAL real do arquivo (confirmado via grep/sed
em 28/07):

  1. Duplicidade MESMO produtor (bug do teste "joao de deus"/Cícero,
     27-28/07): produtor já existente recadastrando com nome de imóvel
     equivalente (acento/case) não deve criar uma segunda linha.
  2. Duplicidade ENTRE produtores diferentes (achado em 28/07, teste do
     Fernando tentando se cadastrar como "dono" do Condomínio Rural
     Coqueiro, que já é do Cícero): bloqueia com ValueError orientando a
     pessoa a pedir "vincular administrador/procurador/contador CPF" pro
     dono real, em vez de duplicar a propriedade física sob outro
     produtor_id.

Também ajusta main.py e mensagem_handler.py pra capturar ValueError
especificamente na confirmação de cadastro (SIM) e mostrar a mensagem de
negócio pro usuário, em vez do "Erro ao cadastrar, tente novamente"
genérico que esconderia a orientação.

USO:
    python3 patch_evitar_imovel_duplicado_entre_produtores_v2.py            # dry-run
    python3 patch_evitar_imovel_duplicado_entre_produtores_v2.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO_DB = Path("app/db.py")
BACKUP_DB = Path("app/db.py.bak_dup_v2")

ARQUIVO_MAIN = Path("app/main.py")
BACKUP_MAIN = Path("app/main.py.bak_dup_v2")

ARQUIVO_MH = Path("app/services/mensagem_handler.py")
BACKUP_MH = Path("app/services/mensagem_handler.py.bak_dup_v2")

# ─────────────────────────────────────────────────────────────────────────
# db.py — texto ORIGINAL real (confirmado via sed em 28/07), combina as
# duas proteções (mesmo produtor + entre produtores) numa só passada.
# ─────────────────────────────────────────────────────────────────────────
BLOCO_DB_ANTIGO = '''        # Caso contrario, cria novo imovel
        elif imovel.get("nome"):
            conn.execute(text("""
                INSERT INTO imoveis_rurais (produtor_id, nome, nirf, area_ha, municipio, uf, participacao)
                VALUES (:pid, :nome, :nirf, :area, :municipio, :uf, :part)
            """), {
                "pid":       produtor_id,
                "nome":      imovel.get("nome"),
                "nirf":      imovel.get("nirf"),
                "area":      imovel.get("area_ha"),
                "municipio": imovel.get("municipio"),
                "uf":        imovel.get("uf"),
                "part":      imovel.get("participacao", 100),
            })
            conn.commit()'''

BLOCO_DB_NOVO = '''        # Caso contrario, cria novo imovel — mas so depois de checar
        # duplicidade em dois niveis (achados em 27-28/07):
        elif imovel.get("nome"):
            # 1) Mesma propriedade sob OUTRO produtor (ex: Fernando tentando
            #    se cadastrar como "dono" do Condominio Rural Coqueiro, que
            #    ja e do Cicero) -- BLOQUEIA, nao duplica a fazenda fisica
            #    sob dois produtor_id diferentes.
            imovel_de_outro = conn.execute(text("""
                SELECT id, produtor_id FROM imoveis_rurais
                WHERE produtor_id != :pid
                  AND lower(unaccent(nome)) = lower(unaccent(:nome))
                  AND lower(unaccent(COALESCE(municipio, ''))) = lower(unaccent(COALESCE(:municipio, '')))
                  AND uf = :uf
                LIMIT 1
            """), {
                "pid": produtor_id, "nome": imovel.get("nome"),
                "municipio": imovel.get("municipio"), "uf": imovel.get("uf"),
            }).fetchone()
            if imovel_de_outro:
                raise ValueError(
                    f"A propriedade \\"{imovel.get('nome')}\\" já está cadastrada no "
                    f"RuralCaixa por outra pessoa. Peça pro proprietário rodar o comando "
                    f"\\"vincular administrador {cpf_limpo}\\" (ou procurador/contador, "
                    f"conforme seu papel) pra te vincular a essa propriedade, em vez de "
                    f"criar um cadastro novo."
                )

            # 2) MESMO produtor recadastrando com nome equivalente (bug do
            #    teste "joao de deus"/Cicero em 27/07) -- reaproveita o
            #    imovel existente em vez de duplicar.
            imovel_similar = conn.execute(text("""
                SELECT id FROM imoveis_rurais
                WHERE produtor_id = :pid
                  AND lower(unaccent(nome)) = lower(unaccent(:nome))
                LIMIT 1
            """), {"pid": produtor_id, "nome": imovel.get("nome")}).fetchone()

            if not imovel_similar:
                conn.execute(text("""
                    INSERT INTO imoveis_rurais (produtor_id, nome, nirf, area_ha, municipio, uf, participacao)
                    VALUES (:pid, :nome, :nirf, :area, :municipio, :uf, :part)
                """), {
                    "pid":       produtor_id,
                    "nome":      imovel.get("nome"),
                    "nirf":      imovel.get("nirf"),
                    "area":      imovel.get("area_ha"),
                    "municipio": imovel.get("municipio"),
                    "uf":        imovel.get("uf"),
                    "part":      imovel.get("participacao", 100),
                })
                conn.commit()'''

# ─────────────────────────────────────────────────────────────────────────
# main.py — captura ValueError especificamente
# ─────────────────────────────────────────────────────────────────────────
BLOCO_MAIN_ANTIGO = '''                    dados = confirmar_cadastro(sessoes, numero, numero, "whatsapp")
                    if dados:
                        from app.db import cadastrar
                        try:
                            produtor_id = cadastrar(dados["produtor"], dados["imovel"])
                            await send_msg(numero,
                                f"Cadastro realizado com sucesso!\\n"
                                f"Seu ID: #{produtor_id}\\n\\n"
                                f"Agora voce pode enviar lancamentos por texto ou audio.\\n"
                                f"Ex: 'vendi 10 sacas de soja por 3000 reais'"
                            )
                        except Exception as e:
                            print(f"Erro cadastro: {e}")
                            await send_msg(numero, "Erro ao cadastrar. Tente novamente.")'''

BLOCO_MAIN_NOVO = '''                    dados = confirmar_cadastro(sessoes, numero, numero, "whatsapp")
                    if dados:
                        from app.db import cadastrar
                        try:
                            produtor_id = cadastrar(dados["produtor"], dados["imovel"])
                            await send_msg(numero,
                                f"Cadastro realizado com sucesso!\\n"
                                f"Seu ID: #{produtor_id}\\n\\n"
                                f"Agora voce pode enviar lancamentos por texto ou audio.\\n"
                                f"Ex: 'vendi 10 sacas de soja por 3000 reais'"
                            )
                        except ValueError as e:
                            # Mensagem de negocio (ex: propriedade ja cadastrada por
                            # outra pessoa) -- mostra direto pro usuario, nao e um bug.
                            await send_msg(numero, str(e))
                        except Exception as e:
                            print(f"Erro cadastro: {e}")
                            await send_msg(numero, "Erro ao cadastrar. Tente novamente.")'''

# ─────────────────────────────────────────────────────────────────────────
# mensagem_handler.py — mesma correção, lado Telegram
# ─────────────────────────────────────────────────────────────────────────
BLOCO_MH_ANTIGO = '''            if dados:
                from app.db import cadastrar
                try:
                    pid = cadastrar(dados["produtor"], dados["imovel"])
                    return (
                        f"✅ Cadastro realizado! ID: #{pid}\\n\\n"
                        f"Agora envie lançamentos por texto ou áudio.\\n"
                        f"Ex: 'vendi 10 sacas de soja por 3000 reais'\\n\\n"
                        f"Digite /ajuda para ver todos os comandos."
                    )
                except Exception as e:
                    return "Erro ao cadastrar. Tente novamente."'''

BLOCO_MH_NOVO = '''            if dados:
                from app.db import cadastrar
                try:
                    pid = cadastrar(dados["produtor"], dados["imovel"])
                    return (
                        f"✅ Cadastro realizado! ID: #{pid}\\n\\n"
                        f"Agora envie lançamentos por texto ou áudio.\\n"
                        f"Ex: 'vendi 10 sacas de soja por 3000 reais'\\n\\n"
                        f"Digite /ajuda para ver todos os comandos."
                    )
                except ValueError as e:
                    # Mensagem de negocio (ex: propriedade ja cadastrada por
                    # outra pessoa) -- mostra direto pro usuario, nao e um bug.
                    return str(e)
                except Exception as e:
                    return "Erro ao cadastrar. Tente novamente."'''

BLOCOS = [
    (ARQUIVO_DB, BACKUP_DB, "db.py — duplicidade mesmo-produtor + entre-produtores", BLOCO_DB_ANTIGO, BLOCO_DB_NOVO),
    (ARQUIVO_MAIN, BACKUP_MAIN, "main.py — captura ValueError", BLOCO_MAIN_ANTIGO, BLOCO_MAIN_NOVO),
    (ARQUIVO_MH, BACKUP_MH, "mensagem_handler.py — captura ValueError", BLOCO_MH_ANTIGO, BLOCO_MH_NOVO),
]


def main():
    aplicar = "--aplicar" in sys.argv

    conteudos = {}
    for arquivo, backup, nome, antigo, novo in BLOCOS:
        if not arquivo.exists():
            print(f"ERRO: {arquivo} não encontrado.")
            sys.exit(1)
        conteudo = arquivo.read_text(encoding="utf-8")
        n = conteudo.count(antigo)
        print(f"[{nome}] ocorrências encontradas: {n}")
        if n != 1:
            print(f"  ABORTANDO: esperava 1, achei {n}. Nada foi gravado em nenhum arquivo.")
            sys.exit(1)
        conteudos[arquivo] = (backup, conteudo.replace(antigo, novo))

    if not aplicar:
        print("\n=== DRY RUN (nada gravado) ===")
        print("Rode de novo com --aplicar se os 3 blocos bateram 1 ocorrência.")
        return

    for arquivo, (backup, novo_conteudo) in conteudos.items():
        shutil.copy2(arquivo, backup)
        arquivo.write_text(novo_conteudo, encoding="utf-8")
        print(f"Aplicado em: {arquivo} (backup: {backup})")


if __name__ == "__main__":
    main()
