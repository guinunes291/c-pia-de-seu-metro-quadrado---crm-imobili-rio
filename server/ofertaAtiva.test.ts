import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import {
  ofertaAtiva as ofertaAtivaTable,
  itemOfertaAtiva as itemOfertaAtivaTable,
  sessaoOferta as sessaoOfertaTable,
  atribuicaoSessao as atribuicaoSessaoTable,
  users,
  leads,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

let testGestorId: number;
let testCorretorId: number;
let testOfertaId: number;
let testLeadId: number;
let testSessaoId: number;

beforeAll(async () => {
  const db = await getDb();

  const [gestorResult] = await db.insert(users).values({
    openId: `test-gestor-oferta-${Date.now()}`,
    name: "Gestor Oferta Teste",
    email: `gestor.oferta.${Date.now()}@test.com`,
    role: "admin",
    situacao: "ativo",
  });
  testGestorId = (gestorResult as any).insertId;

  const [corretorResult] = await db.insert(users).values({
    openId: `test-corretor-oferta-${Date.now()}`,
    name: "Corretor Oferta Teste",
    email: `corretor.oferta.${Date.now()}@test.com`,
    role: "corretor",
    situacao: "ativo",
  });
  testCorretorId = (corretorResult as any).insertId;

  const [leadResult] = await db.insert(leads).values({
    nome: "Lead Oferta Teste",
    telefone: "(11) 99999-0001",
    origem: "outro",
    status: "em_atendimento",
    corretorId: testCorretorId,
    naLixeira: false,
  });
  testLeadId = (leadResult as any).insertId;
});

afterAll(async () => {
  const db = await getDb();
  if (testSessaoId) {
    await db.delete(atribuicaoSessaoTable).where(eq(atribuicaoSessaoTable.sessaoId, testSessaoId)).catch(() => {});
    await db.delete(sessaoOfertaTable).where(eq(sessaoOfertaTable.id, testSessaoId)).catch(() => {});
  }
  if (testOfertaId) {
    await db.delete(itemOfertaAtivaTable).where(eq(itemOfertaAtivaTable.ofertaId, testOfertaId)).catch(() => {});
    await db.delete(ofertaAtivaTable).where(eq(ofertaAtivaTable.id, testOfertaId)).catch(() => {});
  }
  if (testLeadId) await db.delete(leads).where(eq(leads.id, testLeadId)).catch(() => {});
  if (testGestorId) await db.delete(users).where(eq(users.id, testGestorId)).catch(() => {});
  if (testCorretorId) await db.delete(users).where(eq(users.id, testCorretorId)).catch(() => {});
});

describe("ofertaAtiva - tabelas e operações básicas", () => {
  it("deve criar uma oferta ativa no banco de dados", async () => {
    const db = await getDb();
    const [result] = await db.insert(ofertaAtivaTable).values({
      nome: "Oferta Teste Vitest",
      descricao: "Descrição de teste",
      criadoPorId: testGestorId,
      status: "ativa",
      filtros: {},
    });
    testOfertaId = (result as any).insertId;
    expect(testOfertaId).toBeGreaterThan(0);
  });

  it("deve buscar a oferta criada", async () => {
    const db = await getDb();
    const [oferta] = await db
      .select()
      .from(ofertaAtivaTable)
      .where(eq(ofertaAtivaTable.id, testOfertaId));
    expect(oferta).toBeDefined();
    expect(oferta.nome).toBe("Oferta Teste Vitest");
    expect(oferta.status).toBe("ativa");
    expect(oferta.criadoPorId).toBe(testGestorId);
  });

  it("deve adicionar um item (lead) à oferta ativa", async () => {
    const db = await getDb();
    const [result] = await db.insert(itemOfertaAtivaTable).values({
      ofertaId: testOfertaId,
      leadId: testLeadId,
      statusKanban: "ofertar",
    });
    const itemId = (result as any).insertId;
    expect(itemId).toBeGreaterThan(0);

    const [item] = await db
      .select()
      .from(itemOfertaAtivaTable)
      .where(and(
        eq(itemOfertaAtivaTable.ofertaId, testOfertaId),
        eq(itemOfertaAtivaTable.leadId, testLeadId)
      ));
    expect(item).toBeDefined();
    expect(item.statusKanban).toBe("ofertar");
  });

  it("deve criar uma sessão de oferta", async () => {
    const db = await getDb();
    const dataFutura = new Date(Date.now() + 24 * 60 * 60 * 1000); // amanhã
    const [result] = await db.insert(sessaoOfertaTable).values({
      nome: "Sessão Teste Vitest",
      tipo: "avulsa",
      dataHora: dataFutura,
      criadoPorId: testGestorId,
      status: "agendada",
    });
    testSessaoId = (result as any).insertId;
    expect(testSessaoId).toBeGreaterThan(0);
  });

  it("deve atribuir um corretor a uma sessão", async () => {
    const db = await getDb();
    const [result] = await db.insert(atribuicaoSessaoTable).values({
      sessaoId: testSessaoId,
      corretorId: testCorretorId,
      ofertaId: testOfertaId,
      status: "pendente",
    });
    const atribuicaoId = (result as any).insertId;
    expect(atribuicaoId).toBeGreaterThan(0);

    const [atribuicao] = await db
      .select()
      .from(atribuicaoSessaoTable)
      .where(eq(atribuicaoSessaoTable.sessaoId, testSessaoId));
    expect(atribuicao.corretorId).toBe(testCorretorId);
    expect(atribuicao.status).toBe("pendente");
  });

  it("deve atualizar o statusKanban do item para tratando", async () => {
    const db = await getDb();
    await db
      .update(itemOfertaAtivaTable)
      .set({ statusKanban: "tratando" })
      .where(and(
        eq(itemOfertaAtivaTable.ofertaId, testOfertaId),
        eq(itemOfertaAtivaTable.leadId, testLeadId)
      ));

    const [item] = await db
      .select()
      .from(itemOfertaAtivaTable)
      .where(and(
        eq(itemOfertaAtivaTable.ofertaId, testOfertaId),
        eq(itemOfertaAtivaTable.leadId, testLeadId)
      ));
    expect(item.statusKanban).toBe("tratando");
  });

  it("deve arquivar a oferta ativa (mudar status para arquivada)", async () => {
    const db = await getDb();
    await db
      .update(ofertaAtivaTable)
      .set({ status: "arquivada" })
      .where(eq(ofertaAtivaTable.id, testOfertaId));

    const [oferta] = await db
      .select()
      .from(ofertaAtivaTable)
      .where(eq(ofertaAtivaTable.id, testOfertaId));
    expect(oferta.status).toBe("arquivada");
  });
});
