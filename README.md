# RuralCaixa MVP

> Sistema de Gestão para Produtor Rural Pessoa Física — LCDPR, NF-e e DRE Gerencial

[![Deploy](https://img.shields.io/badge/backend-Railway-purple)](https://ruralcaixa-mvp-production.up.railway.app)
[![Vercel](https://img.shields.io/badge/frontend-Vercel-black)](https://ruralcaixa-mvp.vercel.app)
[![License](https://img.shields.io/badge/license-Privado-red)]()

---

## Visão Geral

O **RuralCaixa MVP** é um sistema web full-stack que resolve o principal gargalo do produtor rural pessoa física no Brasil: o cumprimento das obrigações fiscais (LCDPR, NF-e) aliado à gestão analítica real da atividade — inclusive para produtores em sociedade (condomínio, parceria, arrendamento).

### Problema Resolvido

- Produtores rurais PF enfrentam obrigações complexas sem ferramentas acessíveis
- Contadores consolidam dados de múltiplos produtores manualmente
- Sociedades rurais não têm visibilidade da rentabilidade real por sócio
- Lançamentos dependem de memória ou planilhas desatualizadas

### Solução

Sistema mobile-first com:
- **WhatsApp Bot** — lançamentos por texto, áudio e foto de NF
- **DRE Gerencial Híbrido** — proporcionalização por tipo de sociedade
- **NF-e Produtor Rural** — emissão com FUNRURAL/SENAR automático
- **Painel do Contador** — gestão multi-produtor com alertas de conformidade

---

## Stack Tecnológica

| Camada | Tecnologia | Hospedagem |
|--------|-----------|------------|
| Backend API | Python 3.12 + FastAPI + SQLAlchemy | Railway (US West) |
| Banco de Dados | PostgreSQL 16 | Railway (Volume persistente) |
| Frontend Web | Next.js 16 + TypeScript + Tailwind CSS | Vercel (CDN global) |
| PDF Generator | ReportLab 4.5 | In-process (Railway) |
| WhatsApp Bot | Meta Graph API v23.0 | Railway |
| OCR/IA | Claude Vision + OpenAI + Groq STT | API externa |

---

## URLs de Produção

- **Backend:** https://ruralcaixa-mvp-production.up.railway.app
- **Frontend:** https://ruralcaixa-mvp.vercel.app
- **GitHub:** https://github.com/civianacv-oss/ruralcaixa-mvp

---

## Funcionalidades

### WhatsApp Bot
- Texto natural: `"vendi 100 sacas de soja por 13000 reais"`
- Áudio: transcrição automática via Groq STT
- Foto de nota fiscal: OCR via Claude Vision API
- Confirmação/cancelamento de lançamentos sugeridos pela IA
- Cadastro guiado de novo produtor via conversa

### DRE Gerencial — Abordagem Híbrida

Principal diferencial do produto. Três visões do mesmo dado:

| Visão | Período | Uso |
|-------|---------|-----|
| Fiscal (LCDPR) | Jan-Dez | Exatamente o que vai para a Receita Federal |
| Safra (Gerencial) | Jul-Jun | Resultado real do ciclo agrícola |
| Seleção Livre | Qualquer | Análise sob demanda |

**Lógica de proporcionalização:**
- Busca % do produtor no imóvel vigente na data de cada lançamento
- Suporta histórico de alterações de sociedade por safra/vigência
- Visão integral da fazenda (100%) vs proporcional (cota do sócio)
- Intermediação segregada com aviso fiscal

### Gestão de Sociedades Rurais

| Tipo | Como Funciona |
|------|---------------|
| Individual (100%) | Lançamentos integrais |
| Condomínio | % por sócio com histórico de vigência por safra |
| Parceria | Fórmula Terra + Capital com pesos ajustáveis |
| Arrendamento | Arrendatário assume 100% das despesas/receitas |
| Arrendador | Receita de aluguel com tratamento fiscal diferente |

**Fórmula Terra + Capital:**
```
P = alfa × (Area/AreaTotal) + beta × (Inv/InvTotal)
com alfa + beta = 1
```

### NF-e Produtor Rural

Fluxo em 4 passos guiados:
1. **Configurar** — IE, CAEPF, endereço do emitente
2. **Destinatário** — seleciona cadastrado ou cadastra novo
3. **Itens** — produtos rápidos ou item avulso + preview FUNRURAL/SENAR
4. **Emitir** — nota numerada + download DANFE PDF

**Impostos calculados automaticamente:**
- FUNRURAL: 1,50% sobre receita bruta
- SENAR: 0,20% sobre receita bruta

### Conformidade LCDPR (Registro 0045)

- Validação de CPF e CNPJ com dígito verificador
- Alertas em tempo real: documento inválido, soma ≠ 100%, lançamentos sem imóvel
- Link direto para corrigir participações

---

## Modelo de Dados

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `produtores` | Cadastro do produtor rural PF com dados fiscais |
| `imoveis_rurais` | Registro 0040 LCDPR — Imóvel Rural |
| `participacoes_imovel` | Participação societária por safra/vigência |
| `lancamentos` | Lançamentos financeiros com proporcionalização |
| `plano_contas` | Plano de contas LCDPR (14 contas) |
| `nfe_config` | Configuração NF-e: série, numeração, ambiente |
| `nfe_destinatarios` | Cadastro de destinatários |
| `nfe_produtos` | Produtos rurais com NCM, CFOP |
| `nfe_notas` | Notas fiscais emitidas |
| `nfe_itens` | Itens de cada nota |

---

## Endpoints da API

### DRE Gerencial
```
GET /produtores/{id}/dre?view_type=fiscal|managerial|custom&year=2025
GET /produtores/{id}/dre/periodos
```

### NF-e
```
GET    /produtores/{id}/nfe/config
PUT    /produtores/{id}/nfe/config
GET    /produtores/{id}/nfe/produtos
POST   /produtores/{id}/nfe/notas
GET    /nfe/notas/{id}/pdf
```

### Conformidade
```
GET  /imoveis/{id}/terceiros/validacao
POST /imoveis/{id}/recalcular-participacoes
```

---

## Estrutura de Arquivos

```
ruralcaixa-mvp/
├── app/
│   ├── main.py                    # Todos os endpoints FastAPI
│   ├── db.py                      # Engine SQLAlchemy + funções auxiliares
│   └── services/
│       ├── dre_service.py         # Lógica DRE + proporcionalização
│       ├── nfe_service.py         # Gerador PDF DANFE (ReportLab)
│       ├── classificador.py       # IA para classificar lançamentos
│       ├── audio_handler.py       # Transcrição de áudio WhatsApp
│       └── ocr_handler.py         # OCR de notas fiscais
├── frontend/
│   └── app/
│       ├── page.tsx               # Dashboard do produtor
│       ├── analytics/page.tsx     # DRE analítico Safra/Fiscal
│       ├── nfe/page.tsx           # Emissão NF-e 4 passos
│       ├── contador/page.tsx      # Painel multi-produtor
│       ├── terceiros/page.tsx     # Gestão de sociedades
│       ├── relatorio/page.tsx     # Geração LCDPR PDF
│       └── cadastro/page.tsx      # Cadastro produtor/imóvel
├── requirements.txt
└── railway.json
```

---

## Roadmap

### Fase 2 (Alta Prioridade)
- [ ] Transmissão NF-e SEFAZ-MA via Web Services + certificado digital
- [ ] eSocial S-1260 — Comercialização da Produção Rural PF
- [ ] Autenticação JWT + controle de acesso por perfil

### Fase 3 (Média Prioridade)
- [ ] App mobile nativo (React Native)
- [ ] eSocial S-1200/S-1210 — Folha de pagamento rural
- [ ] Integração bancária para conciliação automática

### Fase 4 (Baixa Prioridade)
- [ ] Multi-tenancy (contador gerencia múltiplos CPFs)
- [ ] Relatório comparativo de safras (benchmarking)

---

## Registro de Produção Intelectual

**Autoria:** civianacv-oss (civiana.cv@gmail.com)  
**Versão:** 1.0 MVP  
**Data:** 2026  
**Hash:** d7a3b34 (branch main)  

Todos os direitos reservados. O código-fonte, lógica de negócio, algoritmos de proporcionalização, interfaces e documentação são de propriedade exclusiva do autor.

### Inovações Protegíveis
- Algoritmo de proporcionalização híbrida Safra/Fiscal por tipo de sociedade rural
- Fórmula ponderada Terra+Capital com histórico de vigência por safra
- Segregação automática de intermediação no contexto fiscal LCDPR
- Fluxo conversacional de lançamentos via WhatsApp com OCR de NF
- DANFE simplificado com cálculo automático FUNRURAL/SENAR

---

*Documentação gerada em 19/05/2026 — RuralCaixa MVP v1.0*
