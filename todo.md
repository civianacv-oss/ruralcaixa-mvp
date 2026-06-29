# RuralCaixa - TODO

## Abordagem: Frontend conectado à API Railway existente

## Fase 1: Schema e Estrutura Base
- [x] Criar todo.md
- [x] Definir cliente da API Railway (client/src/lib/api.ts)
- [x] Criar hook useRuralAuth para autenticação via localStorage

## Fase 2: Autenticação por CPF
- [x] Login por CPF consultando API Railway (/produtores)
- [x] Sessão salva em localStorage (rc_produtor_id, rc_produtor_nome, rc_imovel_id)
- [x] Logout limpa sessão e redireciona para /login
- [x] Proteção de rotas via ProtectedRoute

## Fase 3: Tela de Login
- [x] Construir tela de login elegante com campo CPF
- [x] Formatação automática de CPF (000.000.000-00)
- [x] Validação de CPF no frontend
- [x] Feedback de erro claro e estilizado
- [x] Animações suaves de entrada (fadeInUp, shake)

## Fase 4: Dashboard Principal
- [x] Layout RuralLayout com sidebar elegante e logo RuralCaixa
- [x] Cards de resumo do rebanho por espécie (ovinos, caprinos, suínos, bovinos)
- [x] Gráfico de distribuição do rebanho (PieChart recharts)
- [x] Cards de alertas sanitários, partos e abates (30d)
- [x] Resumo financeiro rápido (receitas vs despesas)

## Fase 5: Módulo de Animais
- [x] Listagem de animais com filtro por espécie (tabs)
- [x] Busca por brinco, nome, raça
- [x] Tabela com status colorido, sexo, peso, lote

## Fase 6: Módulo de Saúde
- [x] Listagem de próximos eventos sanitários por espécie
- [x] Destaque para eventos vencidos e próximos 7 dias
- [x] Cards de resumo (total, vencidos, próximos 7d)

## Fase 7: Módulo Reprodutivo
- [x] Listagem de fêmeas prenhas por espécie
- [x] Cálculo de dias restantes para parto
- [x] Cards de resumo (total prenhas, partos 30d, atrasados)

## Fase 8: Módulo Financeiro
- [x] Listagem de lançamentos com filtro por tipo
- [x] Resumo de receitas, despesas e resultado
- [x] Gráfico de fluxo financeiro (BarChart recharts)

## Fase 9: Movimentações
- [x] Histórico de animais filtrado por espécie e status
- [x] Cards de contagem por status (ativo, vendido, morto, abatido)
- [x] Busca por brinco ou nome

## Fase 10: Polimento e Testes
- [x] Revisão visual completa (tipografia Playfair Display + Inter, paleta verde)
- [x] Testes unitários (13 testes passando)
- [x] Responsividade mobile (sidebar colapsável, topbar mobile)
- [x] Checkpoint final e entrega

## Fase 11: Confirmação de Segurança por Telegram/WhatsApp (OTP)
- [x] Criar endpoint tRPC `auth.sendOtp` — gera código de 6 dígitos, armazena em memória com TTL 5min, envia via Telegram ou WhatsApp usando o telefone do produtor
- [x] Criar endpoint tRPC `auth.verifyOtp` — valida o código, retorna token de sessão
- [x] Construir tela de verificação de código OTP (6 dígitos com inputs individuais)
- [x] Integrar fluxo: CPF → OTP enviado → tela de código → dashboard
- [x] Mostrar qual canal foi usado (Telegram ou WhatsApp) e opção de reenvio

## Fase 12: Tela de Seleção de Imóvel
- [x] Criar página SelecionarImovel.tsx com cards elegantes por propriedade
- [x] Exibir nome, município/UF, área (ha) e total de produtores por imóvel
- [x] Carregar resumo de rebanho (ovinos, bovinos) por imóvel para enriquecer os cards
- [x] Salvar imovel_id escolhido na sessão e redirecionar para /dashboard
- [x] Integrar no fluxo: após verifyOtp → /selecionar-imovel (se >1 imóvel) ou /dashboard (se 1 imóvel)
- [x] Adicionar rota /selecionar-imovel no App.tsx
- [x] Botão "Trocar propriedade" no sidebar do RuralLayout
- [x] Limpeza do CPF no clearSession

## Fase 13: Isolamento de Dados por Produtor/Imóvel
- [x] Auditar lib/api.ts — garantir que todas as funções passam produtorId/imovelId
- [x] Criar railwayProxy.ts — módulo server-side com assertImovel/assertProdutor guards
- [x] Criar server/routers/railway.ts — router tRPC proxy seguro para todos os endpoints Railway
- [x] Registrar railwayRouter no appRouter principal
- [x] Adicionar rc_claims cookie JWT assinado no verifyOtp (produtorId + cpf + imovelId)
- [x] Limpar rc_claims no logout
- [x] Corrigir Dashboard.tsx — usa trpc.railway.* (proxy seguro)
- [x] Corrigir Animais.tsx — usa trpc.railway.animais (proxy seguro)
- [x] Corrigir Saude.tsx — usa trpc.railway.sanitario (proxy seguro)
- [x] Corrigir Reproducao.tsx — usa trpc.railway.reproducao (proxy seguro)
- [x] Corrigir Financeiro.tsx — usa trpc.railway.lancamentos/produtorResumo (proxy seguro)
- [x] Corrigir Movimentacoes.tsx — usa trpc.railway.animais (proxy seguro)
- [x] Atualizar teste de logout para verificar 2 cookies limpos
- [x] 25 testes passando

## Fase 14: Re-emissão rc_claims + CRUD + Menu Lateral
- [x] Endpoint tRPC `auth.switchImovel` — re-emite rc_claims com novo imovelId
- [x] SelecionarImovel.tsx — chamar switchImovel ao trocar imóvel (multi e single imóvel)
- [x] Melhorias no menu lateral (seções agrupadas, tooltips, banner de propriedade ativa)
- [x] CRUD Animais — botões Novo/Editar/Status/Excluir com modais elegantes
- [x] CRUD Saúde — botão Novo registro com modal completo
- [x] CRUD Reprodução — botão Novo registro com modal completo
- [x] CRUD Financeiro — botões Novo/Editar/Excluir com modais e confirmação
- [x] imovelId/produtorId injetados automaticamente pelo servidor nos endpoints POST
- [x] 43 testes passando

## Fase 15: Telegram Direto por Produtor + WhatsApp Flag
- [x] Tabela `produtor_config` no banco local (produtorId, telegramChatId, whatsappPriority)
- [x] Helpers db.getProdutorConfig / db.upsertProdutorConfig
- [x] otp.ts atualizado: usa telegram_chat_id individual se disponível, fallback para grupo geral
- [x] otp.ts: respeita flag whatsappPriority (WhatsApp primeiro quando ativado)
- [x] Endpoint tRPC `produtorConfig.get` — retorna config do produtor logado
- [x] Endpoint tRPC `produtorConfig.save` — salva telegramChatId e whatsappPriority
- [x] Página Perfil.tsx — card de configuração do canal de verificação
- [x] Instruções para obter Chat ID via @userinfobot
- [x] Toggle de prioridade WhatsApp com aviso "ative somente após aprovação da Meta"
- [x] Rota /perfil no App.tsx (rota protegida)
- [x] Link "Perfil & Notificações" no menu lateral (item Settings → /perfil)
- [x] 43 testes passando

## Fase 16: Seleção de Perfil no Login + Procuração
- [ ] Adicionar etapa de seleção de perfil (Contador / Produtor / Procurador) antes do CPF na tela de login
- [ ] Perfil Procurador: adicionar etapa de upload da procuração (PDF/imagem) após o CPF
- [ ] Criar tabela `procuracoes` no banco: procurador_cpf, produtor_cpf, arquivo_url, arquivo_key, status, created_at
- [ ] Endpoint tRPC `procuracao.upload` — salva arquivo no S3 e registra no banco com status pendente
- [ ] Endpoint tRPC `procuracao.status` — retorna status da procuração do procurador logado
- [ ] Salvar perfil selecionado no rc_claims JWT (campo `perfil`)
- [ ] Procurador aprovado acessa os imóveis do produtor representado; pendente/rejeitado vê tela de aguardo
- [ ] Painel admin para aprovar/rejeitar procurações
