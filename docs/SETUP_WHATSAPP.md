# Setup de Notificações WhatsApp — RuralBox

Este guia descreve como configurar a integração com a **Meta Cloud API** para envio de alertas críticos de qualidade da água.

## 1. 📋 Configuração do Banco de Dados

Antes de usar o script, atualize o banco de dados para suportar múltiplos contatos e rastreamento de notificações.

Execute o script `schema_contatos_imovel.sql` no seu PostgreSQL.

Ele adicionará:
- Campos `gestor_whatsapp` e `gestor_nome` na tabela `imoveis_rurais`
- Campo `notificado_whatsapp` na tabela `piscicultura_alertas`
- Tabela `contatos_imovel` (opcional, para múltiplos destinatários)

## 2. 📱 Criar o Template no Meta Business Manager

Acesse o [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/) e crie o seguinte template:

- **Nome:** `alerta_piscicultura`
- **Categoria:** `UTILITY` (Utilidade)
- **Idioma:** `Português (Brasil)`

**Configuração dos Componentes:**

**Header (Cabeçalho):**
- Tipo: `Texto`
- Conteúdo: `⚠️ Alerta RuralBox — {{1}}`

**Body (Corpo):**
- Conteúdo:
```
{{1}}

{{2}}

Severidade: {{3}}

Ação recomendada: {{4}}
```

**Footer (Rodapé):**
- Conteúdo: `RuralBox — Gestão Rural Digital`

Submeta para aprovação. Geralmente é aprovado em poucos minutos.

## 3. 🔐 Configurar Secrets no GitHub

Adicione os seguintes secrets em **Settings → Secrets and variables → Actions**:

| Secret | Descrição | Onde encontrar |
|--------|-----------|----------------|
| `WHATSAPP_TOKEN` | Token de acesso (System User) | Meta App Dashboard → API Setup |
| `WHATSAPP_PHONE_ID` | ID do número de telefone | Meta App Dashboard → API Setup |

## 4. 🚀 Lógica de Envio (Híbrida)

O script `enviar_alertas_whatsapp.py` implementa a lógica híbrida recomendada:

1. Busca apenas alertas com nível **CRÍTICO** que ainda não foram notificados.
2. Identifica o imóvel associado ao ciclo.
3. Busca os contatos:
   - Primeiro, procura na tabela `contatos_imovel` (se houver técnicos, proprietários cadastrados).
   - Se não encontrar, usa o `gestor_whatsapp` da tabela `imoveis_rurais`.
4. Envia a mensagem individual imediatamente via Meta Cloud API.
5. Marca o alerta como `notificado_whatsapp = TRUE` para não enviar duplicado.

*Nota: Alertas médios/baixos ficam registrados no banco para consolidação diária (a ser implementada na interface web).*

## 5. 🧪 Testando o Envio

Para testar sem gastar mensagens da cota do WhatsApp:

1. Edite o arquivo `.github/workflows/alertas-cron.yml`
2. Mude `DRY_RUN: "0"` para `DRY_RUN: "1"`
3. Faça commit e rode o workflow manualmente
4. Verifique os logs no GitHub Actions. O payload JSON será impresso, mas a requisição não será feita.
5. Quando estiver confiante, volte para `DRY_RUN: "0"`.
