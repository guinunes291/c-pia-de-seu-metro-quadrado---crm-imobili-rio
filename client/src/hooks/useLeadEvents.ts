/**
 * Subscribes to the /api/events/corretor SSE stream.
 * Events handled:
 * - 'novo_lead': new lead assigned (distribuição/roleta)
 * - 'lead_transferido': lead redistributed from another corretor
 * - 'alerta': SLA or gestor alert — invalidates alertas.meus immediately
 * All events are available to all roles (corretores, gestores, admins).
 */

import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export function useLeadEvents() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!user) return;

    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource("/api/events/corretor");

      es.addEventListener("novo_lead", () => {
        utils.dashboard.leadsPrioritarios.invalidate();
        utils.leads.getNewWebhookLeads.invalidate();
      });

      es.addEventListener("lead_transferido", () => {
        utils.dashboard.leadsPrioritarios.invalidate();
        utils.leads.getNewWebhookLeads.invalidate();
      });

      // SLA or gestor alert — show immediately without waiting for 3-min poll
      es.addEventListener("alerta", () => {
        utils.alertas.meus.invalidate();
      });

      es.onerror = () => {
        es?.close();
        if (!closed) {
          reconnectTimeout = setTimeout(connect, 5_000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      es?.close();
    };
  }, [user?.id]);
}
