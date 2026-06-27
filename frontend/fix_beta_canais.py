path = r"app\beta\page.tsx"
content = open(path, encoding="utf-8", errors="replace").read()

old = '''{
              icon: "💬", titulo: "WhatsApp",
              desc: "Mande mensagem diretamente para o número do sistema: +55 (98) 3022-3992",
              link: WHATSAPP_LINK, linkLabel: "Abrir WhatsApp",
            },
            {
              icon: "📧", titulo: "Telegram (em breve)",
              desc: "Grupo de testadores em criação. Use o app ou WhatsApp por enquanto.",
            },'''

new = '''{
              icon: "✈️", titulo: "Telegram",
              desc: "Entre no grupo de testadores e reporte diretamente por lá.",
              link: "https://t.me/+9ZM4w6fwOUMxYTkx", linkLabel: "Entrar no grupo",
            },
            {
              icon: "💬", titulo: "WhatsApp (em breve)",
              desc: "Canal via WhatsApp em configuração. Use o Telegram ou o formulário no app por enquanto.",
            },'''

if old in content:
    content = content.replace(old, new)
    open(path, "w", encoding="utf-8").write(content)
    print("OK")
else:
    print("ERRO — buscando contexto:")
    idx = content.find("WhatsApp")
    print(repr(content[idx:idx+300]))