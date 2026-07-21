/**
 * ADICIONAR dentro de railwayRouter({ ... }) em server/routers/railway.ts,
 * antes do "});" final.
 */

// ── Administradores de propriedade (acesso operacional, sem participação) ──

listarAdministradores: publicProcedure
  .input(z.object({ imovelId: z.number() }))
  .query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return railwayFetch<{ produtor_id: number; nome: string; cpf: string; vigencia_inicio: string }[]>(
      `/imoveis-rurais/${input.imovelId}/administradores`,
      undefined,
      claims.produtorId,
    );
  }),

adicionarAdministrador: publicProcedure
  .input(z.object({ imovelId: z.number(), cpf: z.string().min(11) }))
  .mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);

    const cpfClean = input.cpf.replace(/\D/g, "");

    // Busca o produtor pelo CPF (mesma estratégia usada no login: lista todos
    // e filtra, já que não existe /produtores/buscar-por-cpf dedicado ainda)
    const todosProdutores = await railwayFetch<{ id: number; nome: string; cpf: string }[]>(
      "/produtores",
      undefined,
      claims.produtorId,
    );
    const encontrado = todosProdutores.find((p) => p.cpf?.replace(/\D/g, "") === cpfClean);

    if (!encontrado) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Esse CPF não tem cadastro no RuralCaixa ainda. A pessoa precisa se cadastrar no sistema antes de poder ser adicionada como administradora.",
      });
    }

    const resultado = await railwayMutate<{ ok: boolean; produtor_id: number; produtor_nome: string }>(
      `/imoveis-rurais/${input.imovelId}/administradores`,
      "POST",
      { produtor_id: encontrado.id },
      claims.produtorId,
    );

    // Dá acesso de login (ACL Node) pra essa pessoa nessa propriedade,
    // reaproveitando o token dela de qualquer outro imóvel que já tenha
    const { getDb } = await import("../db");
    const { produtorImovel } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const jaTemAcesso = await db
        .select()
        .from(produtorImovel)
        .where(and(eq(produtorImovel.produtorId, encontrado.id), eq(produtorImovel.imovelId, input.imovelId)))
        .limit(1);
      if (jaTemAcesso.length === 0) {
        const outraLinha = await db
          .select()
          .from(produtorImovel)
          .where(eq(produtorImovel.produtorId, encontrado.id))
          .limit(1);
        const tokenExistente = outraLinha[0]?.railwayToken ?? null;
        await db.insert(produtorImovel).values({
          produtorId: encontrado.id,
          imovelId: input.imovelId,
          railwayToken: tokenExistente,
        });
      }
    }

    return resultado;
  }),

removerAdministrador: publicProcedure
  .input(z.object({ imovelId: z.number(), produtorId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);

    const resultado = await railwayMutate<{ ok: boolean }>(
      `/imoveis-rurais/${input.imovelId}/administradores/${input.produtorId}`,
      "DELETE",
      undefined,
      claims.produtorId,
    );

    // Remove só o acesso a ESSE imóvel — se a pessoa for administradora de
    // outra propriedade também, aquele acesso continua intacto
    const { getDb } = await import("../db");
    const { produtorImovel } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      await db
        .delete(produtorImovel)
        .where(and(eq(produtorImovel.produtorId, input.produtorId), eq(produtorImovel.imovelId, input.imovelId)));
    }

    return resultado;
  }),
