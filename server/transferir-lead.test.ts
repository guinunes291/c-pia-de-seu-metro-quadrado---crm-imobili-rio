import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { users, leads } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Transferência de Leads', () => {
  let corretor1Id: number;
  let corretor2Id: number;
  let leadId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database não disponível');

    const ts = Date.now();
    const c1Result = await db.insert(users).values({
      openId: `test-corretor1-trans-${ts}`,
      name: 'Corretor 1 Transferência',
      email: `corretor1.trans.${ts}@test.com`,
      role: 'corretor',
      status: 'presente',
    });
    corretor1Id = (c1Result as any)[0].insertId;

    const c2Result = await db.insert(users).values({
      openId: `test-corretor2-trans-${ts}`,
      name: 'Corretor 2 Transferência',
      email: `corretor2.trans.${ts}@test.com`,
      role: 'corretor',
      status: 'presente',
    });
    corretor2Id = (c2Result as any)[0].insertId;

    const [novoLead] = await db.insert(leads).values({
      nome: 'Lead Teste Transferência',
      telefone: '(11) 98888-1234',
      email: `lead.trans.${ts}@test.com`,
      origem: 'captacao_corretor',
      status: 'em_atendimento',
      corretorId: corretor1Id,
    }).$returningId();
    leadId = novoLead.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(leads).where(eq(leads.id, leadId));
    await db.delete(users).where(eq(users.id, corretor1Id));
    await db.delete(users).where(eq(users.id, corretor2Id));
  });

  it('deve transferir lead de um corretor para outro', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database não disponível');

    const [leadAntes] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    expect(leadAntes.corretorId).toBe(corretor1Id);

    await db.update(leads).set({ corretorId: corretor2Id }).where(eq(leads.id, leadId));

    const [leadDepois] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    expect(leadDepois.corretorId).toBe(corretor2Id);

    await db.update(leads).set({ corretorId: corretor1Id }).where(eq(leads.id, leadId));
  });

  it('deve preservar dados do lead após transferência', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database não disponível');

    const [leadAntes] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);

    await db.update(leads).set({ corretorId: corretor2Id }).where(eq(leads.id, leadId));

    const [leadDepois] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    expect(leadDepois.nome).toBe(leadAntes.nome);
    expect(leadDepois.telefone).toBe(leadAntes.telefone);
    expect(leadDepois.email).toBe(leadAntes.email);

    await db.update(leads).set({ corretorId: corretor1Id }).where(eq(leads.id, leadId));
  });

  it('deve contar corretamente leads por corretor após transferência', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database não disponível');

    const leadsC1Antes = await db.select().from(leads).where(eq(leads.corretorId, corretor1Id));
    const leadsC2Antes = await db.select().from(leads).where(eq(leads.corretorId, corretor2Id));

    await db.update(leads).set({ corretorId: corretor2Id }).where(eq(leads.id, leadId));

    const leadsC1Depois = await db.select().from(leads).where(eq(leads.corretorId, corretor1Id));
    const leadsC2Depois = await db.select().from(leads).where(eq(leads.corretorId, corretor2Id));
    expect(leadsC1Depois.length).toBe(leadsC1Antes.length - 1);
    expect(leadsC2Depois.length).toBe(leadsC2Antes.length + 1);

    await db.update(leads).set({ corretorId: corretor1Id }).where(eq(leads.id, leadId));
  });
});
