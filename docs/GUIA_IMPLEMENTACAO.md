# Guia de Implementação — Monitor de Amônia/Nitrito

## 📋 Resumo

Este guia descreve como integrar o script de monitoramento de qualidade da água ao projeto **ruralcaixa-mvp** usando GitHub Actions com execução agendada (cron).

## 🎯 O que o Script Faz

O script **`monitor_amonia_nitrito.py`** executa as seguintes operações:

1. **Conecta ao PostgreSQL** usando a string de conexão `DATABASE_URL`
2. **Busca leituras recentes** (últimas 24h por padrão) em ciclos ativos
3. **Classifica leituras** conforme limites EMBRAPA:
   - Amônia (NH₃): aviso ≥ 0.3 mg/L | crítico ≥ 0.5 mg/L
   - Nitrito (NO₂): aviso ≥ 0.1 mg/L | crítico ≥ 0.2 mg/L
4. **Registra alertas** na tabela `piscicultura_alertas` (sem duplicatas)
5. **Gera logs estruturados** em JSON para auditoria

## 📁 Estrutura de Arquivos

Coloque os arquivos nos seguintes locais do seu repositório:

```
ruralcaixa-mvp/
├── scripts/
│   └── monitor_amonia_nitrito.py    ← Script de monitoramento
├── .github/
│   └── workflows/
│       └── alertas-cron.yml         ← Workflow do GitHub Actions
└── README.md
```

## 🚀 Passo a Passo de Implementação

### 1. Criar o Diretório `scripts/` (se não existir)

```bash
mkdir -p scripts
```

### 2. Adicionar o Script Python

Copie o arquivo `monitor_amonia_nitrito.py` para `scripts/`:

```bash
cp monitor_amonia_nitrito.py scripts/
```

### 3. Criar/Atualizar o Workflow do GitHub Actions

Crie ou atualize o arquivo `.github/workflows/alertas-cron.yml`:

```bash
mkdir -p .github/workflows
cp alertas-cron.yml .github/workflows/
```

### 4. Fazer Commit e Push

```bash
git add scripts/monitor_amonia_nitrito.py .github/workflows/alertas-cron.yml
git commit -m "feat: adicionar monitor de amônia/nitrito com execução cron"
git push origin main
```

## 🔐 Configuração de Secrets

O script requer apenas **um secret obrigatório**:

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `DATABASE_URL` | Connection string PostgreSQL | `postgresql://user:pass@host:5432/db` |

**Variáveis de Ambiente Opcionais** (usam padrão EMBRAPA se não definidas):

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `NH3_AVISO` | 0.3 | Limite de aviso amônia (mg/L) |
| `NH3_CRITICO` | 0.5 | Limite crítico amônia (mg/L) |
| `NO2_AVISO` | 0.1 | Limite de aviso nitrito (mg/L) |
| `NO2_CRITICO` | 0.2 | Limite crítico nitrito (mg/L) |
| `JANELA_HORAS` | 24 | Horas para trás na busca |

### Como Adicionar Secrets no GitHub

1. Acesse **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret**
3. Adicione `DATABASE_URL` com a string de conexão PostgreSQL
4. Clique em **Add secret**

## 📊 Fluxo de Dados

```
PostgreSQL (ciclos ativos + leituras)
    ↓
[Busca leituras das últimas 24h]
    ↓
[Classifica: NH₃ ≥ 0.3 ou NO₂ ≥ 0.1]
    ↓
[Verifica duplicatas em piscicultura_alertas]
    ↓
[Registra novo alerta se não existir]
    ↓
[Gera log JSON estruturado]
```

## 📝 Exemplo de Log

Quando um alerta é gerado, o script produz um log JSON como:

```json
{
  "timestamp": "2026-06-23T10:30:00+00:00",
  "level": "INFO",
  "message": "Novo alerta registrado",
  "data": {
    "ciclo": "Tilápia Viveiro 1 – 2026/1",
    "especie": "Tilápia do Nilo",
    "parametro": "NH3",
    "valor": 0.72,
    "nivel": "CRÍTICO"
  }
}
```

## ⏰ Agendamento (Cron)

O workflow está configurado para executar **automaticamente**:

- **09:00 UTC** (06:00 Brasília)
- **17:00 UTC** (14:00 Brasília)

Você pode **rodar manualmente** a qualquer momento:

1. Vá para **Actions** no repositório
2. Selecione **Alertas Cron**
3. Clique em **Run workflow**

## 🔍 Monitorando Execuções

Para verificar se o script está funcionando:

1. Acesse **Actions** no repositório GitHub
2. Clique em **Alertas Cron**
3. Veja o histórico de execuções e logs

## 🛠️ Troubleshooting

### Erro: "DATABASE_URL não configurada"

**Solução:** Adicione o secret `DATABASE_URL` nas configurações do repositório (veja seção "Como Adicionar Secrets").

### Erro: "psycopg2 not found"

**Solução:** O workflow instala automaticamente via `pip install psycopg2-binary`. Se persistir, verifique se o Python 3.11 está sendo usado.

### Nenhum alerta é registrado

**Possíveis causas:**
- Não há leituras com valores acima dos limites
- Ciclos não estão com status `ATIVO` no banco
- Tabela `piscicultura_alertas` não existe

**Verificação:**
```sql
-- Verificar ciclos ativos
SELECT id, nome, status FROM piscicultura_ciclos WHERE status = 'ATIVO';

-- Verificar leituras recentes
SELECT * FROM piscicultura_leituras 
WHERE data_medicao >= NOW() - INTERVAL '24 hours'
ORDER BY data_medicao DESC LIMIT 10;

-- Verificar alertas registrados
SELECT * FROM piscicultura_alertas 
ORDER BY data_alerta DESC LIMIT 10;
```

## 🔮 Próximos Passos (Futuro)

### Integração com WhatsApp (quando tiver secrets)

Quando você tiver `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID`, será possível:

1. Enviar mensagens WhatsApp consolidadas por produtor
2. Incluir recomendações de ação baseadas no nível de alerta
3. Rastrear confirmação de recebimento

### Integração com Google Drive (usando `GDRIVE_FOLDER_ID`)

- Exportar relatórios diários de alertas
- Gerar planilhas com histórico de monitoramento

### Customização por Espécie

- Diferentes limites para tilápia, tambaqui, pacu, etc.
- Alertas multiespécie em um único ciclo

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs no GitHub Actions
2. Confirme que `DATABASE_URL` está correto
3. Valide a estrutura das tabelas no PostgreSQL
4. Teste o script localmente: `python scripts/monitor_amonia_nitrito.py`

## 📚 Referências

- **EMBRAPA — Qualidade da Água em Piscicultura**: Limites de amônia e nitrito baseados em recomendações técnicas
- **GitHub Actions Documentation**: https://docs.github.com/en/actions
- **PostgreSQL psycopg2**: https://www.psycopg.org/

---

**Versão:** 1.0  
**Data:** 2026-06-23  
**Autor:** Manus AI
