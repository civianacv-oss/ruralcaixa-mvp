with open("frontend/app/contador/page.tsx", encoding="utf-8") as f:
    c = f.read()

old = "      // 3. Lançamentos pendentes de confirmação\n      const pendentes = lancs.filter((l: any) => !l.confirmado);\n      if (pendentes.length > 0) {\n        novosAlertas.push({\n          nivel: \"aviso\",\n          mensagem: `${pendentes.length} lancamento(s) aguardando confirmacao`,\n          detalhe: \"Lancamentos nao confirmados nao entram no DRE nem no LCDPR\",\n        });\n      }"
new = "      // 3. Lancamentos pendentes - desativado no schema novo (confirmado sempre true)"

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("frontend/app/contador/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
