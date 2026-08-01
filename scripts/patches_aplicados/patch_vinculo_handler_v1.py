"""
patch_vinculo_handler_v1.py

Adiciona o comando "vincular administrador/procurador/contador CPF" em
app/services/mensagem_handler.py (Telegram + base compartilhada). Só
proprietário/administrador/procurador podem rodar esse comando (mesma
regra do cadastro de colaborador).

Decidido em 28/07:
  - Administrador e Procurador: MESMO nível de acesso (autorizado=True,
    igual a hoje). _autorizar_numero passa a reconhecer 'procurador' além
    de 'administrador'/'proprietario'.
  - Contador: fica REGISTRADO em participacoes_imovel, mas
    PROPOSITALMENTE NÃO entra na lista de tipo_vinculo autorizados pelo
    bot ainda — sem uma auditoria completa de todos os pontos de escrita
    do sistema, fingir uma restrição "só leitura" seria mais arriscado
    que não dar acesso nenhum via bot por enquanto. Isso é uma pendência
    registrada, não um esquecimento.

3 mudanças neste arquivo:
  A. _autorizar_numero: adiciona 'procurador' na lista de tipo_vinculo
     autorizado (era só 'administrador', 'proprietario').
  B. Novas funções _eh_comando_vinculo / _processar_comando_vinculo.
  C. Hook em processar_mensagem, logo após o hook do cadastro de
     colaborador (mesmo padrão).

USO:
    python3 patch_vinculo_handler_v1.py            # dry-run
    python3 patch_vinculo_handler_v1.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/services/mensagem_handler.py")
BACKUP = Path("app/services/mensagem_handler.py.bak_vinculo_v1")

# ─────────────────────────────────────────────────────────────────────────
# BLOCO A — hook no processar_mensagem, logo após o de colaborador
# ─────────────────────────────────────────────────────────────────────────
BLOCO_A_ANTIGO = '''    if _eh_comando_cadastro_colaborador(texto):
        return await _processar_cadastro_colaborador(texto, msg.numero, msg.canal)'''

BLOCO_A_NOVO = '''    if _eh_comando_cadastro_colaborador(texto):
        return await _processar_cadastro_colaborador(texto, msg.numero, msg.canal)

    if _eh_comando_vinculo(texto):
        return await _processar_comando_vinculo(texto, msg.numero, msg.canal)'''

# ─────────────────────────────────────────────────────────────────────────
# BLOCO B — reconhece 'procurador' como mesmo nível de 'administrador'
# ─────────────────────────────────────────────────────────────────────────
BLOCO_B_ANTIGO = '''        row_admin = conn.execute(sqlt(
            "SELECT imovel_id, tipo_vinculo FROM participacoes_imovel "
            "WHERE produtor_id = :pid AND vigencia_fim IS NULL "
            "AND tipo_vinculo IN ('administrador', 'proprietario') "
            "ORDER BY vigencia_inicio DESC LIMIT 1"
        ), {"pid": produtor_id}).fetchone()'''

BLOCO_B_NOVO = '''        # 'procurador' tem o mesmo nível de acesso que 'administrador'
        # (decidido em 28/07). 'contador' fica DE FORA desta lista de
        # propósito -- ver docstring de _processar_comando_vinculo pra
        # entender por que (pendência de restrição de escrita real).
        row_admin = conn.execute(sqlt(
            "SELECT imovel_id, tipo_vinculo FROM participacoes_imovel "
            "WHERE produtor_id = :pid AND vigencia_fim IS NULL "
            "AND tipo_vinculo IN ('administrador', 'proprietario', 'procurador') "
            "ORDER BY vigencia_inicio DESC LIMIT 1"
        ), {"pid": produtor_id}).fetchone()'''

# ─────────────────────────────────────────────────────────────────────────
# BLOCO C — novas funções, inseridas logo após _processar_cadastro_colaborador
# (usa o final dessa função, texto já visto e estável, como âncora)
# ─────────────────────────────────────────────────────────────────────────
BLOCO_C_ANTIGO = '''        f"segurança, você (ou outro administrador) vai receber a pergunta aqui "
        f"mesmo -- {nome.split()[0]} não precisa (nem vai conseguir) escolher a conta contábil."
    )'''

BLOCO_C_NOVO = '''        f"segurança, você (ou outro administrador) vai receber a pergunta aqui "
        f"mesmo -- {nome.split()[0]} não precisa (nem vai conseguir) escolher a conta contábil."
    )


_TIPOS_VINCULO_VALIDOS = ("administrador", "procurador", "contador")
_PADRAO_VINCULO = re.compile(
    r"^vincular\\s+(administrador|procurador|contador)\\s+([\\d.\\-\\s]{11,18})$"
)


def _eh_comando_vinculo(texto: str) -> bool:
    return bool(_PADRAO_VINCULO.match(_normalizar_para_comando(texto)))


async def _processar_comando_vinculo(texto: str, numero: str, canal: str) -> str:
    """
    Comando de texto: "vincular administrador 12345678900" (ou
    procurador/contador). Só proprietário/administrador/procurador podem
    rodar -- mesma regra de quem pode cadastrar colaborador, mas aqui é
    ainda mais sensível (dá acesso financeiro, não só operacional).

    A pessoa vinculada PRECISA JÁ TER cadastro de produtor (CPF) no
    RuralCaixa -- decidido em 28/07 que o sistema não cria cadastro
    mínimo automático pra administrador/procurador/contador (diferente
    do colaborador, que é autocontido). Se o CPF não for encontrado,
    orienta a pessoa a se cadastrar primeiro (opção "vinculado a
    propriedade de outra pessoa" no wizard).

    Administrador e Procurador têm o MESMO nível de acesso (ver extensão
    de _autorizar_numero). Contador fica registrado no banco, mas AINDA
    NÃO tem acesso via bot autorizado -- ver pendência na docstring do
    módulo. Isso é intencional: mais seguro não dar acesso nenhum agora
    do que fingir uma restrição de "só leitura" sem ela existir de fato.
    """
    autorizacao = _autorizar_numero(numero, canal)
    if not autorizacao.get("autorizado"):
        return ("Não consegui confirmar seu cadastro. Fale com quem configurou o "
                "RuralCaixa pra essa propriedade antes de vincular alguém.")

    papel = autorizacao.get("papel")
    if papel not in ("proprietario", "administrador", "procurador"):
        return ("Você não tem permissão pra vincular administrador/procurador/contador. "
                "Só o proprietário, um administrador ou procurador podem fazer isso.")

    imovel_id = autorizacao.get("imovel_id")
    if not imovel_id:
        return "Não consegui identificar a propriedade pra vincular esse cadastro."

    match = _PADRAO_VINCULO.match(_normalizar_para_comando(texto))
    tipo_vinculo = match.group(1)
    cpf = re.sub(r"\\D", "", match.group(2))
    if len(cpf) != 11:
        return "CPF inválido. Manda assim: \\"vincular administrador 12345678900\\""

    from app.db import buscar_produtor_por_cpf, engine
    from sqlalchemy import text as sqlt

    pessoa = buscar_produtor_por_cpf(cpf)
    if not pessoa:
        return (
            "Esse CPF ainda não tem cadastro no RuralCaixa. Peça pra pessoa mandar "
            "CADASTRAR primeiro (escolhendo a opção \\"vinculado(a) à propriedade de "
            "outra pessoa\\"), depois repete esse comando."
        )

    with engine.connect() as conn:
        ja_vinculado = conn.execute(sqlt("""
            SELECT id, tipo_vinculo FROM participacoes_imovel
            WHERE produtor_id = :pid AND imovel_id = :iid AND vigencia_fim IS NULL
        """), {"pid": pessoa["id"], "iid": imovel_id}).fetchone()
        if ja_vinculado:
            return f"{pessoa['nome']} já está vinculado(a) a essa propriedade como \\"{ja_vinculado[1]}\\"."

        conn.execute(sqlt("""
            INSERT INTO participacoes_imovel
                (imovel_id, produtor_id, nome_participante, tipo_vinculo, vigencia_inicio)
            VALUES (:iid, :pid, :nome, :tipo, CURRENT_DATE)
        """), {"iid": imovel_id, "pid": pessoa["id"], "nome": pessoa["nome"], "tipo": tipo_vinculo})
        conn.commit()

    aviso_contador = (
        "\\n\\n⚠️ Contador ainda não tem acesso restrito a leitura implementado nesta "
        "versão -- por enquanto, NÃO consegue interagir com o bot (nem leitura nem "
        "escrita), até uma revisão de segurança dedicada estar pronta."
    ) if tipo_vinculo == "contador" else ""

    return (
        f"✅ {pessoa['nome']} vinculado(a) como {tipo_vinculo} dessa propriedade."
        f"{aviso_contador}"
    )'''

BLOCOS = [
    ("A — hook do comando de vínculo", BLOCO_A_ANTIGO, BLOCO_A_NOVO),
    ("B — reconhece procurador em _autorizar_numero", BLOCO_B_ANTIGO, BLOCO_B_NOVO),
    ("C — novas funções _eh_comando_vinculo/_processar_comando_vinculo", BLOCO_C_ANTIGO, BLOCO_C_NOVO),
]


def main():
    aplicar = "--aplicar" in sys.argv
    if not ARQUIVO.exists():
        print(f"ERRO: {ARQUIVO} não encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = ARQUIVO.read_text(encoding="utf-8")
    original = conteudo
    for nome, antigo, novo in BLOCOS:
        n = conteudo.count(antigo)
        print(f"[{nome}] ocorrências encontradas: {n}")
        if n != 1:
            print(f"  ABORTANDO: esperava 1, achei {n}.")
            sys.exit(1)
        conteudo = conteudo.replace(antigo, novo)

    if not aplicar:
        print("\n=== DRY RUN (nada gravado) ===")
        print(f"Tamanho original: {len(original)} -> novo: {len(conteudo)}")
        return

    shutil.copy2(ARQUIVO, BACKUP)
    print(f"Backup: {BACKUP}")
    ARQUIVO.write_text(conteudo, encoding="utf-8")
    print(f"Aplicado em: {ARQUIVO}")


if __name__ == "__main__":
    main()
