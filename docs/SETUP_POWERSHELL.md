# Setup PowerShell — GitHub Actions (Windows Runner)

Este guia descreve como usar os scripts PowerShell para monitoramento de qualidade da água no GitHub Actions com Windows runner.

## 📋 Diferenças: Python vs PowerShell

| Aspecto | Python | PowerShell |
|--------|--------|-----------|
| **Runner** | `ubuntu-latest` | `windows-latest` |
| **Tempo de setup** | ~30s | ~60s (download Npgsql) |
| **Dependências** | psycopg2-binary | Npgsql.dll |
| **Logs** | JSON estruturado | JSON estruturado |
| **Performance** | Rápido | Rápido |
| **Manutenção** | Fácil | Fácil |

## 🚀 Implementação

### 1. Adicionar Scripts ao Repositório

Coloque os scripts PowerShell na pasta `scripts/`:

```
ruralcaixa-mvp/
├── scripts/
│   ├── Monitor-AmoniaaNitrito.ps1      ← Novo
│   ├── Send-AlertasWhatsApp.ps1        ← Novo
│   └── monitor_amonia_nitrito.py       ← (Opcional - pode manter ou remover)
├── .github/
│   └── workflows/
│       ├── alertas-cron.yml            ← (Workflow Python - opcional)
│       └── alertas-cron-powershell.yml ← Novo (Windows)
```

### 2. Configurar o Workflow

Substitua ou crie o arquivo `.github/workflows/alertas-cron-powershell.yml` com o conteúdo fornecido.

**Pontos importantes:**

- **Runner:** `windows-latest` (necessário para PowerShell com Npgsql)
- **Shell:** `pwsh` (PowerShell Core)
- **Npgsql:** Baixado automaticamente via NuGet no primeiro step

### 3. Adicionar/Validar Secrets

No GitHub, vá para **Settings → Secrets and variables → Actions** e confirme:

| Secret | Status |
|--------|--------|
| `DATABASE_URL` | ✅ Obrigatório |
| `WHATSAPP_TOKEN` | ✅ Obrigatório (se usar WhatsApp) |
| `WHATSAPP_PHONE_ID` | ✅ Obrigatório (se usar WhatsApp) |

### 4. Fazer Commit e Push

```powershell
git add scripts/Monitor-AmoniaaNitrito.ps1 scripts/Send-AlertasWhatsApp.ps1 .github/workflows/alertas-cron-powershell.yml
git commit -m "feat: adicionar monitor PowerShell para Windows runner"
git push origin main
```

## 🧪 Testando

### Teste Manual no GitHub

1. Acesse **Actions** no repositório
2. Selecione **Alertas Cron (PowerShell)**
3. Clique em **Run workflow**
4. Monitore os logs em tempo real

### Teste com DRY_RUN

Para testar a lógica sem enviar mensagens reais:

1. Edite `.github/workflows/alertas-cron-powershell.yml`
2. Mude `DRY_RUN: "false"` para `DRY_RUN: "true"`
3. Rode o workflow manualmente
4. Verifique os logs (o JSON será impresso, mas a requisição HTTP não será feita)

### Teste Local (Windows)

Se quiser testar localmente no seu Windows:

```powershell
# Instalar Npgsql localmente
Install-Package Npgsql -SkipDependencies

# Executar script
$env:DATABASE_URL = "postgresql://user:pass@host:5432/db"
& ".\scripts\Monitor-AmoniaaNitrito.ps1"
```

## 📊 Fluxo de Execução

```
Windows Runner
    ↓
[Baixar Npgsql.dll via NuGet]
    ↓
[Carregar assembly Npgsql]
    ↓
[Executar Monitor-AmoniaaNitrito.ps1]
    ├─ Conecta ao PostgreSQL
    ├─ Busca leituras das últimas 24h
    ├─ Classifica: NH₃ ≥ 0.3 ou NO₂ ≥ 0.1
    ├─ Registra alertas (sem duplicatas)
    └─ Gera logs JSON
    ↓
[Executar Send-AlertasWhatsApp.ps1]
    ├─ Busca alertas CRÍTICOS não notificados
    ├─ Identifica contatos do imóvel
    ├─ Envia via Meta Cloud API
    └─ Marca como notificado
    ↓
[Workflow Concluído]
```

## 🔍 Monitorando Execuções

1. Acesse **Actions** → **Alertas Cron (PowerShell)**
2. Clique na execução mais recente
3. Expanda cada step para ver os logs JSON
4. Procure por `"level": "ERROR"` para identificar problemas

## 🛠️ Troubleshooting

### Erro: "Npgsql.dll não encontrado"

**Causa:** Download do NuGet falhou  
**Solução:** Verifique a conexão de internet do runner e tente novamente

### Erro: "DATABASE_URL não configurada"

**Causa:** Secret não foi adicionado  
**Solução:** Adicione `DATABASE_URL` em Settings → Secrets

### Erro: "Falha ao conectar ao banco de dados"

**Causa:** Connection string inválida ou banco inacessível  
**Solução:** Teste a connection string localmente com `psql` ou outro cliente

### Nenhum alerta é enviado

**Possíveis causas:**
- Não há alertas CRÍTICOS no banco
- Ciclos não estão com status `ATIVO`
- `notificado_whatsapp` já está `TRUE` para os alertas

**Verificação:**
```sql
-- Verificar alertas críticos não notificados
SELECT * FROM piscicultura_alertas 
WHERE nivel = 'CRÍTICO' 
AND resolvido = FALSE 
AND notificado_whatsapp = FALSE;
```

## 🔮 Próximos Passos

### Consolidação de Alertas Diários

Você pode criar um terceiro script PowerShell para consolidar alertas médios/baixos e enviar 1× ao dia:

```powershell
# Pseudocódigo
$alertasMedios = Get-AlertasNivel -Nivel "AVISO"
$mensagem = Format-ConsolidatedMessage -Alertas $alertasMedios
Send-WhatsAppMessage -Mensagem $mensagem
```

### Integração com Slack/Teams

Adicionar notificações para o Slack ou Microsoft Teams:

```powershell
$slackWebhook = $env:SLACK_WEBHOOK_URL
Invoke-RestMethod -Uri $slackWebhook -Method Post -Body $jsonPayload
```

## 📚 Referências

- **PowerShell Documentation:** https://learn.microsoft.com/en-us/powershell/
- **Npgsql Documentation:** https://www.npgsql.org/
- **GitHub Actions:** https://docs.github.com/en/actions
- **Meta Cloud API:** https://developers.facebook.com/docs/cloud-api/

---

**Versão:** 1.0  
**Data:** 2026-06-24  
**Autor:** Manus AI
