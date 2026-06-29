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
- [x] Adicionar etapa de seleção de perfil (Contador / Produtor / Procurador) antes do CPF na tela de login
- [x] Perfil Procurador: adicionar etapa de upload da procuração (PDF/imagem) após o CPF
- [x] Criar tabela `procuracoes` no banco: procurador_cpf, produtor_cpf, arquivo_url, arquivo_key, status, created_at
- [x] Endpoint tRPC `procuracao.upload` — salva arquivo no S3 e registra no banco com status pendente
- [x] Endpoint tRPC `procuracao.status` — retorna status da procuração do procurador logado
- [x] Painel admin para aprovar/rejeitar procurações (endpoint tRPC procuracao.list + procuracao.updateStatus)
- [x] Procurador vê tela de aguardo após envio da procuração
- [x] 43 testes passando

## Fase 17: Correção TypeScript + Role no Login
- [x] Adicionar campo `role` ao retorno do `verifyOtp` em server/routers.ts
- [x] Confirmar que server/otp.ts já retorna `role` em VerifyOtpResult e OtpEntry
- [x] Importar `setRole` em Login.tsx e salvar role após verifyOtp bem-sucedido
- [x] RuralLayout.tsx usa `isAdmin` e `role` de useRuralAuth para mostrar link Procurações e label correto
- [x] 43 testes passando, zero erros TypeScript
- [x] Fix: CPF não estava sendo salvo no localStorage após OTP — setSession agora aceita parâmetro `cpf` opcional; Login.tsx passa o CPF ao chamar setSession, corrigindo o erro "Sessão expirada" na tela SelecionarImovel

## Fase 18: Fix — cookie rc_claims não era enviado ao browser
- [x] Fix crítico: cookie rc_claims não era enviado pelo browser pois sameSite:none requer secure:true — cookies.ts agora usa sameSite:lax quando não é HTTPS, garantindo que o cookie seja enviado
- [x] Fix: railwayProxy.ts usava req.cookies (não populado sem cookie-parser) — corrigido para parsear cookies do header raw igual ao sdk.ts
- [x] Resultado: após OTP o sistema agora avança para seleção de imóvel/dashboard sem voltar para login

## Fase 19: Fix definitivo — rc_claims via header X-Rc-Claims
- [x] Servidor: getClaimsFromRequest lê header X-Rc-Claims antes do cookie (cross-site fallback)
- [x] Servidor: verifyOtp e switchImovel retornam rcClaimsToken no body da resposta
- [x] Cliente: Login.tsx salva rcClaimsToken no localStorage após verifyOtp
- [x] Cliente: SelecionarImovel.tsx salva rcClaimsToken no localStorage após switchImovel
- [x] Cliente: main.tsx envia X-Rc-Claims header em todas as requisições tRPC
- [x] api.ts: getRcToken/setRcToken/clearRcToken helpers adicionados; clearSession limpa o token
- [x] 43 testes passando, zero erros TypeScript

## Fase 20: Reestruturação completa da navegação e novos módulos
- [x] RuralLayout: nova estrutura de navegação com grupos Rural, Rebanho, Gestão, Fiscal
- [x] Página Propriedades (/propriedades)
- [x] Página Contratos Rurais (/contratos-rurais)
- [x] Página Acerto de Contrato (/acerto-contrato)
- [x] Página Lançamentos (/lancamentos)
- [x] Página Rebanhos (/rebanhos) com abas por espécie
- [x] Página Agricultura (/agricultura)
- [x] Página Relatórios (/relatorios)
- [x] Página NF-e Produtor (/nfe-produtor)
- [x] Página eSocial Rural (/esocial-rural)
- [x] Página Compra e Venda (/compra-venda)
- [x] Página Cultivo de Açaí (/cultivo-acai)
- [x] Página EFD-Reinf / DARF (/efd-reinf)
- [x] Página DCTFWeb (/dctfweb)
- [x] Registrar todas as rotas no App.tsx
- [x] 43 testes passando, zero erros TypeScript

## Fase 21: Módulo de Insumos
- [x] Adicionar endpoints tRPC proxy em server/routers/railway.ts: insumos, fornecedores, movimentações, pedidos-compra
- [x] Criar página Insumos.tsx com abas: Estoque, Fornecedores, Pedidos de Compra
- [x] Alertas de estoque crítico/baixo com badge na aba Estoque
- [x] Registrar rota /insumos no App.tsx e no RuralLayout (grupo Gestão)

## Fase 22: Melhorias no módulo de Insumos
- [x] Badge de alertas de insumos no menu sidebar (RuralLayout) — badge vermelho na aba Estoque e no header da página
- [x] Drawer lateral de histórico de movimentações por insumo (Sheet side=right) com ícones de entrada/saída, custo unitário e total
- [x] Destaque visual da reposição automática no formulário — card verde com explicação e campo lead_time quando modo=automático
- [x] Endpoint tRPC insumoDetalhe adicionado ao railway.ts
- [x] 43 testes passando, zero erros TypeScript

## Fase 23: Bugs relatados pelo testador Bira
- [x] Bug: aba Insumos sumiu do menu lateral — corrigido pelo próprio Cícero
- [x] Bug: configuração estranha — resolvido

## Fase 24: Importação de planilha no módulo de Insumos
- [x] Instalar xlsx para parse de Excel/CSV
- [x] Endpoint tRPC importarInsumos (base64 → parse → criação em lote via Railway API)
- [x] Botão Importar Planilha na página Insumos com upload, preview e confirmação
- [x] Template de planilha para download (modelo_insumos.csv)
- [x] Mapeamento flexível de colunas (aceita PT e EN)
- [x] Resultado detalhado com contagem de sucesso/erro e lista de linhas com problema
- [x] 43 testes passando, zero erros TypeScript

## Fase 25: Código único de insumos + upsert inteligente
- [x] Tabela local `insumos_catalogo` no banco: id, codigo (único por fazenda), nome, nome_normalizado, categoria, unidade, railway_id, criado_em
- [x] Helpers server/db.ts: upsertInsumosCatalogo, findInsumoByNome, searchInsumosCatalogo, listInsumosCatalogo, gerarCodigoInsumo
- [x] Endpoints tRPC: listarCatalogInsumos, buscarCatalogInsumos, upsertCatalogInsumo
- [x] importarInsumos: upsert local primeiro (cria ou atualiza pelo nome normalizado), depois tenta Railway
- [x] Resultado da importação exibe código gerado e ação (criado/atualizado) por linha
- [x] UI: autocomplete Popover+Command no campo Nome do formulário (busca no catálogo local)
- [x] UI: código exibido na tabela de estoque (coluna Código com badge monoespaçado)
- [x] Geração automática de código: prefixo por categoria + sequencial (FAR-001, RAC-002, etc.)
- [x] 43 testes passando, zero erros TypeScript

## Fase 26: Importação de insumos — colunas oficiais + etapa de-para
- [ ] Servidor: mapeamento das 10 colunas oficiais (nome, categoria, unidade, origem, estoque_atual, estoque_minimo, estoque_ideal, preco_estimado, reposicao_modo, lead_time_dias)
- [ ] Servidor: retornar lista de nomes não encontrados no catálogo (para etapa de-para)
- [ ] UI: etapa de-para — tabela com nomes não reconhecidos e select para mapear para insumo existente ou criar novo
- [ ] UI: só confirmar importação após resolver todos os de-para pendentes
- [ ] Template CSV atualizado com as 10 colunas oficiais
