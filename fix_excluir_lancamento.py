content = open("frontend/app/lancamentos/page.tsx", encoding="utf-8", errors="replace").read()

# 1. Adiciona onExcluir nas props
old1 = "  onSalvar: () => void;\n  onFechar: () => void;\n  saving: boolean;\n})"
new1 = "  onSalvar: () => void;\n  onFechar: () => void;\n  onExcluir?: () => void;\n  saving: boolean;\n})"
content = content.replace(old1, new1, 1)
print("props:", "OK" if "onExcluir?" in content else "ERRO")

# 2. Adiciona onExcluir na desestruturação
old2 = "  onSalvar,\n  onFechar,\n  saving,\n}: {"
new2 = "  onSalvar,\n  onFechar,\n  onExcluir,\n  saving,\n}: {"
content = content.replace(old2, new2, 1)
print("destruct:", "OK" if "onExcluir," in content else "ERRO")

# 3. Adiciona botão excluir - encontra o div dos botoes
btn_excluir = (
    '\n          {onExcluir && ('
    '\n            <button onClick={() => { if(window.confirm("Excluir este lancamento?")) onExcluir!(); }} style={{'
    '\n              flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid #fecaca",'
    '\n              background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer",'
    '\n            }}>🗑️ Excluir</button>'
    '\n          )}'
)

old3 = '          <button onClick={onFechar} style={{\n            flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid #e0dbd0",'
new3 = btn_excluir + '\n' + old3
content = content.replace(old3, new3, 1)
print("botao:", "OK" if "Excluir este lancamento" in content else "ERRO")

open("frontend/app/lancamentos/page.tsx", "w", encoding="utf-8").write(content)
print("Salvo")

# 4. Agora encontra onde ModalLancamento é chamado para adicionar onExcluir
idx = content.find("onExcluir")
print("onExcluir encontrado em:", content.count("onExcluir"), "lugares")
