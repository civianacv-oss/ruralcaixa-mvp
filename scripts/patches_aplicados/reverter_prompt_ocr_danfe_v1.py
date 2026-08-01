# -*- coding: utf-8 -*-
"""
REVERTE a mudança de prompt em app/services/ocr_handler.py (SISTEMA_OCR)
-- teste real com a mesma imagem mostrou resultado PIOR depois da mudança
(valor foi de R$ 3.305,31 pra R$ 0,00, emitente ficou ainda mais errado).
Mantém a função inferir_operacao_por_itens e a integração no
mensagem_handler.py, que são independentes e não são suspeitas aqui.

Rodar localmente:
    python3 reverter_prompt_ocr_danfe_v1.py            # dry-run
    python3 reverter_prompt_ocr_danfe_v1.py --aplicar   # aplica
"""
import sys
import difflib

CAMINHO = "app/services/ocr_handler.py"

ATUAL = '''SISTEMA_OCR = """Você é um especialista em documentos fiscais brasileiros.
Analise a imagem e extraia as informações do documento fiscal.
Responda APENAS com JSON, sem explicações.

ATENÇÃO especial pro DANFE (Documento Auxiliar da Nota Fiscal Eletrônica):
- É comum a foto vir com o documento rotacionado (paisagem fotografado na
  vertical, ou vice-versa) -- gire mentalmente a imagem se precisar pra
  ler o texto corretamente antes de extrair os campos.
- O bloco do DESTINATÁRIO/REMETENTE (nome, endereço, CNPJ/CPF, inscrição
  estadual) fica todo dentro da mesma caixa/moldura no layout do DANFE,
  mesmo que o campo "CNPJ/CPF" apareça numa linha visualmente distante do
  nome (comum quando a tabela é fotografada rotacionada) -- confirme que
  o CNPJ/CPF pertence ao mesmo bloco/moldura do nome do destinatário antes
  de atribuir; não pegue o primeiro número parecido que aparecer na imagem.
- O CNPJ/CPF do EMITENTE fica no cabeçalho, perto do nome da empresa
  emissora -- não confundir com números de outros campos (valor do ICMS,
  frete, inscrição estadual, protocolo de autorização, chave de acesso).
- Se não tiver certeza absoluta de qual número pertence a qual campo,
  prefira retornar null em vez de arriscar um número errado.
- Se a nota tiver múltiplos itens na tabela de produtos, extraia TODOS
  eles em "itens", não só o primeiro.

Formato:'''

ORIGINAL = '''SISTEMA_OCR = """Você é um especialista em documentos fiscais brasileiros.
Analise a imagem e extraia as informações do documento fiscal.
Responda APENAS com JSON, sem explicações.

Formato:'''


def main():
    aplicar = "--aplicar" in sys.argv
    with open(CAMINHO, "r", encoding="utf-8") as f:
        original = f.read()

    qtd = original.count(ATUAL)
    if qtd != 1:
        print(f"✗ Esperava 1 ocorrência do texto atual (com a mudança), achei {qtd}.")
        print("  Talvez já tenha sido revertido, ou o arquivo mudou de novo. Abortando sem gravar.")
        return

    corrigido = original.replace(ATUAL, ORIGINAL, 1)

    if aplicar:
        with open(CAMINHO, "w", encoding="utf-8") as f:
            f.write(corrigido)
        print("✓ Prompt revertido e arquivo gravado.")
    else:
        print(">>> DRY-RUN — diff do que seria alterado:\n")
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            corrigido.splitlines(keepends=True),
            fromfile="antes (com a mudança)", tofile="depois (revertido)",
        )
        sys.stdout.writelines(diff)
        print("\n\nSe fizer sentido, rode de novo com --aplicar.")


if __name__ == "__main__":
    main()
