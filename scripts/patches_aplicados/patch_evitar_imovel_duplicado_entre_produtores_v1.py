"""
patch_evitar_imovel_duplicado_entre_produtores_v1.py

Achado em 28/07 durante teste real: o patch anterior
(patch_evitar_imovel_duplicado_v1.py) só evita duplicidade quando é o
MESMO produtor recadastrando (WHERE produtor_id = :pid). Não pega o caso
de produtores DIFERENTES cadastrando a mesma propriedade física (ex:
Fernando tentando se cadastrar como "dono" do "Condomínio Rural Coqueiro",
que já existe no sistema como propriedade do Cícero) — isso criaria uma
segunda linha em imoveis_rurais pra mesma fazenda real, sob um
produtor_id diferente, uma divergência pior que a anterior.

Correção: antes de criar o imóvel (branch "elif imovel.get('nome')"),
verifica se já existe uma propriedade com nome+município+UF equivalentes
sob QUALQUER OUTRO produtor_id. Se existir, BLOQUEIA a criação (levanta
ValueError com mensagem clara) em vez de duplicar — orienta a pessoa a
pedir pro dono real rodar "vincular administrador/procurador/contador
CPF" (feature já existente) em vez de se cadastrar como dona.

Os pontos que chamam cadastrar() (main.py e mensagem_handler.py, dentro
de confirmar_cadastro) já têm try/except ao redor — precisam também ser
ajustados pra capturar ValueError especificamente e mostrar a mensagem
pro usuário, em vez do "Erro ao cadastrar, tente novamente" genérico
(que esconderia a orientação certa). Esse ajuste está incluso no bloco B.

USO:
    python3 patch_evitar_imovel_duplicado_entre_produtores_v1.py            # dry-run
    python3 patch_evitar_imovel_duplicado_entre_produtores_v1.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO_DB = Path("app/db.py")
BACKUP_DB = Path("app/db.py.bak_dup_entre_produtores_v1")

ARQUIVO_MAIN = Path("app/main.py")
BACKUP_MAIN = Path("app/main.py.bak_dup_entre_produtores_v1")

ARQUIVO_MH = Path("app/services/mensagem_handler.py")
BACKUP_MH = Path("app/services/mensagem_handler.py.bak_dup_entre_produtores_v1")

# ─────────────────────────────────────────────────────────────────────────
# db.py — bloqueia duplicidade entre produtores diferentes
# ─────────────────────────────────────────────────────────────────────────
BLOCO_DB_ANTIGO = '''        elif imovel.get("nome"):
            imovel_similar = conn.execute(text("""
                SELECT id FROM imoveis_rurais
                WHERE produtor_id = :pid
                  AND lower(unaccent(nome)) = lower(unaccent(:nome))
                LIMIT 1
            """), {"pid": produtor_id, "nome": imovel.get("nome")}).fetchone()

            if not imovel_similar:'''

BLOCO_DB_NOVO = '''        elif imovel.get("nome"):
            # Checa primeiro se já existe sob OUTRO produtor (achado em
            # 28/07: pessoa diferente tentando se cadastrar como "dono"
            # de uma propriedade que já pertence a outra pessoa no
            # sistema -- ex: Condomínio Rural Coqueiro, já do Cícero).
            # Nome+município+UF equivalentes (ignora acento/case) e
            # produtor_id diferente = mesma fazenda física, bloqueia.
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

            imovel_similar = conn.execute(text("""
                SELECT id FROM imoveis_rurais
                WHERE produtor_id = :pid
                  AND lower(unaccent(nome)) = lower(unaccent(:nome))
                LIMIT 1
            """), {"pid": produtor_id, "nome": imovel.get("nome")}).fetchone()

            if not imovel_similar:'''

# ─────────────────────────────────────────────────────────────────────────
# main.py — captura ValueError especificamente e mostra a mensagem certa
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
    (ARQUIVO_DB, BACKUP_DB, "db.py — bloqueio entre produtores diferentes", BLOCO_DB_ANTIGO, BLOCO_DB_NOVO),
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
