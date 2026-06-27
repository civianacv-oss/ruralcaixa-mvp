import glob, re, os

corrigidos = 0
for path in glob.glob("app/**/*.tsx", recursive=True):
    if "login" in path or "beta" in path or "AuthGuard" in path:
        continue
    try:
        content = open(path, encoding="utf-8", errors="replace").read()
        if "<AuthGuard>" not in content:
            continue
        original = content
        # Remove import do AuthGuard
        content = re.sub(r'import AuthGuard from "[^"]+AuthGuard";\n', '', content)
        # Remove <AuthGuard> e </AuthGuard> mal inseridos
        content = re.sub(r'\n\s*<AuthGuard>\n', '\n', content)
        content = re.sub(r'\n\s*</AuthGuard>\n', '\n', content)
        # Caso onde <AuthGuard> foi inserido no meio de uma linha
        content = re.sub(r'<AuthGuard>', '', content)
        content = re.sub(r'</AuthGuard>', '', content)
        if content != original:
            open(path, "w", encoding="utf-8").write(content)
            print(f"Revertido: {path}")
            corrigidos += 1
    except Exception as e:
        print(f"Erro {path}: {e}")

print(f"\nTotal: {corrigidos} arquivos corrigidos")