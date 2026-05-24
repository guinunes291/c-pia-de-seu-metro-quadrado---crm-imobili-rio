/**
 * Centralized RBAC helpers — single source of truth for role checks.
 * Import from here instead of redefining locally in each router.
 */
import { TRPCError } from '@trpc/server';
import { protectedProcedure } from './trpc';

export type UserRole = 'admin' | 'superintendente' | 'gestor' | 'corretor';

export function isGestorLevel(role: string): boolean {
  return role === 'gestor' || role === 'admin' || role === 'superintendente';
}

export function isAdminLevel(role: string): boolean {
  return role === 'admin' || role === 'superintendente';
}

export function isAdminExact(role: string): boolean {
  return role === 'admin';
}

/** Any authenticated user (corretor or above) */
export const corretorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'corretor' && !isGestorLevel(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
  }
  return next({ ctx });
});

/** gestor, admin, or superintendente */
export const gestorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isGestorLevel(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas gestores podem acessar' });
  }
  return next({ ctx });
});

/** admin or superintendente */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdminLevel(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem acessar' });
  }
  return next({ ctx });
});

/** admin only (for data exports) */
export const adminExportProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o administrador principal pode exportar dados' });
  }
  return next({ ctx });
});
