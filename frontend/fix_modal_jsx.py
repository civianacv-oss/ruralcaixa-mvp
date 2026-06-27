import glob, re

arquivos = [
    r"app\acai\page.tsx",
    r"app\agricultura\page.tsx",
    r"app\bovino\page.tsx",
    r"app\caprino\page.tsx",
    r"app\ovino\page.tsx",
    r"app\suino\page.tsx",
]

for path in arquivos:
    content = open(path, encoding="utf-8", errors="replace").read()
    if "modalImportar" not in content:
        print(f"SKIP: {path}")
        continue

    # Remove o bloco do modal de onde está (fora do return)
    content_new = re.sub(
        r'\n\s*\{modalImportar && \(\n\s*<ImportarModal[\s\S]*?\)\}\n(?=\s*\);?\n\})',
        '\n',
        content
    )

    if content_new == content:
        print(f"PADRAO NAO BATEU: {path}")
        # Mostra contexto do problema
        idx = content.find("{modalImportar")
        print(repr(content[idx-30:idx+100]))
        continue

    # Insere modal dentro do return antes do último fechamento
    modal = '''      {modalImportar && (
        <ImportarModal
          modulo="{mod}"
          onClose={() => setModalImportar(false)}
          onSuccess={(qtd) => { setModalImportar(false); }}
        />
      )}'''

    mod = path.split("\\")[1]  # bovino, ovino, etc
    modal = modal.replace("{mod}", mod)

    # Insere antes do último </div>\n  );
    content_new = re.sub(
        r'(\n    </div>\n  \);\n\})',
        f'\n{modal}\\1',
        content_new,
        count=1
    )

    open(path, "w", encoding="utf-8").write(content_new)
    print(f"OK: {path}")