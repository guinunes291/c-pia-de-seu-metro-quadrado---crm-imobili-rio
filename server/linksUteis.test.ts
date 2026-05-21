import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import {
  linksUteis as linksUteisTable,
  acessosLinksUteis as acessosLinksUteisTable,
  users,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

let testAdminId: number;
let testCorretorId: number;
let testLinkId: number;

beforeAll(async () => {
  const db = await getDb();

  const [adminResult] = await db.insert(users).values({
    openId: `test-admin-links-${Date.now()}`,
    name: "Admin Links Teste",
    email: `admin.links.${Date.now()}@test.com`,
    role: "admin",
    situacao: "ativo",
  });
  testAdminId = (adminResult as any).insertId;

  const [corretorResult] = await db.insert(users).values({
    openId: `test-corretor-links-${Date.now()}`,
    name: "Corretor Links Teste",
    email: `corretor.links.${Date.now()}@test.com`,
    role: "corretor",
    situacao: "ativo",
  });
  testCorretorId = (corretorResult as any).insertId;
});

afterAll(async () => {
  const db = await getDb();
  if (testLinkId) {
    await db.delete(acessosLinksUteisTable).where(eq(acessosLinksUteisTable.linkId, testLinkId)).catch(() => {});
    await db.delete(linksUteisTable).where(eq(linksUteisTable.id, testLinkId)).catch(() => {});
  }
  if (testAdminId) await db.delete(users).where(eq(users.id, testAdminId)).catch(() => {});
  if (testCorretorId) await db.delete(users).where(eq(users.id, testCorretorId)).catch(() => {});
});

describe("linksUteis - tabelas e operações básicas", () => {
  it("deve criar um link útil no banco de dados", async () => {
    const db = await getDb();
    const [result] = await db.insert(linksUteisTable).values({
      titulo: "Link Teste Vitest",
      url: "https://example.com/teste",
      descricao: "Link de teste para vitest",
      categoria: "material",
      status: "ativo",
      criadoPorId: testAdminId,
    });
    testLinkId = (result as any).insertId;
    expect(testLinkId).toBeGreaterThan(0);
  });

  it("deve buscar o link criado", async () => {
    const db = await getDb();
    const [link] = await db
      .select()
      .from(linksUteisTable)
      .where(eq(linksUteisTable.id, testLinkId));
    expect(link).toBeDefined();
    expect(link.titulo).toBe("Link Teste Vitest");
    expect(link.url).toBe("https://example.com/teste");
    expect(link.status).toBe("ativo");
  });

  it("deve registrar um acesso ao link", async () => {
    const db = await getDb();
    const [result] = await db.insert(acessosLinksUteisTable).values({
      linkId: testLinkId,
      corretorId: testCorretorId,
    });
    const acessoId = (result as any).insertId;
    expect(acessoId).toBeGreaterThan(0);
  });

  it("deve contar acessos ao link", async () => {
    const db = await getDb();
    const acessos = await db
      .select()
      .from(acessosLinksUteisTable)
      .where(eq(acessosLinksUteisTable.linkId, testLinkId));
    expect(acessos.length).toBeGreaterThanOrEqual(1);
    expect(acessos[0].corretorId).toBe(testCorretorId);
  });

  it("deve desativar um link (status inativo)", async () => {
    const db = await getDb();
    await db
      .update(linksUteisTable)
      .set({ status: "inativo" })
      .where(eq(linksUteisTable.id, testLinkId));

    const [link] = await db
      .select()
      .from(linksUteisTable)
      .where(eq(linksUteisTable.id, testLinkId));
    expect(link.status).toBe("inativo");
  });

  it("deve reativar um link (status ativo)", async () => {
    const db = await getDb();
    await db
      .update(linksUteisTable)
      .set({ status: "ativo" })
      .where(eq(linksUteisTable.id, testLinkId));

    const [link] = await db
      .select()
      .from(linksUteisTable)
      .where(eq(linksUteisTable.id, testLinkId));
    expect(link.status).toBe("ativo");
  });

  it("deve criar um segundo link com categoria diferente", async () => {
    const db = await getDb();
    const [result] = await db.insert(linksUteisTable).values({
      titulo: "Link Treinamento Teste",
      url: "https://example.com/treinamento",
      descricao: "Link de treinamento de teste",
      categoria: "treinamento",
      status: "ativo",
      criadoPorId: testAdminId,
    });
    const linkTreinamentoId = (result as any).insertId;
    expect(linkTreinamentoId).toBeGreaterThan(0);

    // Limpar
    await db.delete(linksUteisTable).where(eq(linksUteisTable.id, linkTreinamentoId));
  });
});
