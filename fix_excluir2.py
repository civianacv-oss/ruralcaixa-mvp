content = open("frontend/app/lancamentos/page.tsx", encoding="utf-8", errors="replace").read()

# 1. Adiciona funcao handleExcluir antes de handleEditar
old_handle = "  async function handleEditar() {"
handle_excluir = (
    "  async function handleExcluir(id: string | number) {\n"
    "    try {\n"
    "      const r = await apiFetch(`${API}/produtores/1/lancamentos/${id}`, { method: 'DELETE' });\n"
    "      if (r.ok) {\n"
    "        setLancamentos(ls => ls.filter(l => String(l.id) !== String(id)));\n"
    "        setEditando(null);\n"
    "      } else { alert('Erro ao excluir'); }\n"
    "    } catch { alert('Erro ao excluir'); }\n"
    "  }\n\n"
)

if old_handle in content:
    content = content.replace(old_handle, handle_excluir + old_handle, 1)
    print("OK: handleExcluir adicionado")
else:
    print("ERRO: handleEditar nao encontrado")

# 2. Adiciona onExcluir no modal editar
old_modal = "          onFechar={() => setEditando(null)}\n          saving={savingEditar}\n        />"
new_modal = "          onFechar={() => setEditando(null)}\n          onExcluir={() => editando && handleExcluir(editando.id)}\n          saving={savingEditar}\n        />"

if old_modal in content:
    content = content.replace(old_modal, new_modal, 1)
    print("OK: onExcluir no modal")
else:
    print("ERRO: modal nao encontrado")

open("frontend/app/lancamentos/page.tsx", "w", encoding="utf-8").write(content)
print("Salvo")
