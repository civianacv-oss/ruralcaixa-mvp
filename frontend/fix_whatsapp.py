import glob, os

VELHO = "5598930223992"
NOVO  = "5598992002705"
VELHO2 = "+55 (98) 3022-3992"
NOVO2  = "+55 (98) 99200-2705"

arquivos = list(glob.glob("app/**/*.tsx", recursive=True)) + \
           list(glob.glob("app/**/*.ts",  recursive=True)) + \
           ["../app/main.py", "../app/services/contrato_handler.py"]

for path in arquivos:
    if not os.path.exists(path): continue
    content = open(path, encoding="utf-8", errors="replace").read()
    if VELHO in content or VELHO2 in content:
        content = content.replace(VELHO, NOVO).replace(VELHO2, NOVO2)
        open(path, "w", encoding="utf-8").write(content)
        print(f"OK: {path}")