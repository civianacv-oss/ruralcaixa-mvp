/**
 * ADICIONAR em server/routers/railway.ts, dentro do router existente.
 *
 * Segue o mesmo padrão dos outros procedures desse arquivo: proxy pra
 * FastAPI usando o api_token do produtor logado. Ajuste os nomes
 * (railwayFetch, ctx.token, publicProcedure/protectedProcedure etc.)
 * pro que já existe no seu arquivo real — isso aqui é o formato, não
 * um drop-in exato porque não tenho o arquivo original em mãos.
 */

fiscalResumo: protectedProcedure
  .input(z.object({ imovelId: z.number() }))
  .query(async ({ input, ctx }) => {
    // ctx.token (ou ctx.session.apiToken) deve ser o rc_Zk_... do produtor,
    // do mesmo jeito que os outros procedures desse router já autenticam
    // as chamadas pra FastAPI.
    const response = await fetch(
      `${process.env.RAILWAY_BACKEND_URL}/fiscal/resumo/${input.imovelId}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Falha ao buscar painel fiscal: ${response.status}`);
    }

    return response.json();
  }),

fiscalHistorico: protectedProcedure
  .input(z.object({ modulo: z.string(), imovelId: z.number() }))
  .query(async ({ input, ctx }) => {
    const response = await fetch(
      `${process.env.RAILWAY_BACKEND_URL}/fiscal/${input.modulo}/historico/${input.imovelId}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Falha ao buscar histórico: ${response.status}`);
    }

    return response.json();
  }),
