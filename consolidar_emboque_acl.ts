import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import { produtorImovel } from "./drizzle/schema";

const FELIPE_PRODUTOR_ID = 7;
const IMOVEL_DUPLICADO_ID = 10;
const IMOVEL_REAL_ID = 6;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: defina DATABASE_URL (a do banco MySQL do Node, não a do Postgres/Railway).");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);

  const jaTemAcesso = await db
    .select()
    .from(produtorImovel)
    .where(and(eq(produtorImovel.produtorId, FELIPE_PRODUTOR_ID), eq(produtorImovel.imovelId, IMOVEL_REAL_ID)))
    .limit(1);

  if (jaTemAcesso.length > 0) {
    console.log("Felipe já tem acesso ao imovel_id=6 — nada a fazer nessa etapa.");
  } else {
    const linhaAntiga = await db
      .select()
      .from(produtorImovel)
      .where(and(eq(produtorImovel.produtorId, FELIPE_PRODUTOR_ID), eq(produtorImovel.imovelId, IMOVEL_DUPLICADO_ID)))
      .limit(1);

    const tokenExistente = linhaAntiga[0]?.railwayToken ?? null;

    await db.insert(produtorImovel).values({
      produtorId: FELIPE_PRODUTOR_ID,
      imovelId: IMOVEL_REAL_ID,
      railwayToken: tokenExistente,
    });
    console.log(`Acesso criado: produtorId=${FELIPE_PRODUTOR_ID} -> imovelId=${IMOVEL_REAL_ID} (token ${tokenExistente ? "preservado" : "vazio, precisa logar de novo"})`);
  }

  const removido = await db
    .delete(produtorImovel)
    .where(and(eq(produtorImovel.produtorId, FELIPE_PRODUTOR_ID), eq(produtorImovel.imovelId, IMOVEL_DUPLICADO_ID)));

  console.log("Linha antiga (produtorId=7, imovelId=10) removida do ACL.");
  console.log("\nPróximo passo: rodar remover_imovel_duplicado.py pra apagar o imovel_id=10 no Postgres.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});