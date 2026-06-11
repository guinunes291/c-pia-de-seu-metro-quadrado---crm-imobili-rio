/**
 * Integração com Z-API para envio de mensagens WhatsApp
 * Docs: https://developer.z-api.io/
 */

const ZAPI_BASE = 'https://api.z-api.io';

// URL base do CRM para links nas mensagens
const APP_BASE_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://seumetroquadrado.com.br';

function getZapiConfig() {
  return {
    instanceId: process.env.ZAPI_INSTANCE_ID,
    token: process.env.ZAPI_TOKEN,
    clientToken: process.env.ZAPI_CLIENT_TOKEN,
  };
}

export function isZapiConfigured(): boolean {
  const { instanceId, token, clientToken } = getZapiConfig();
  return !!(instanceId && token && clientToken);
}

/**
 * Formata telefone para o padrão Z-API: apenas dígitos, com código do país (55)
 * Ex: "(11) 9 9999-8888" → "5511999998888"
 */
export function formatarTelefoneZapi(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
  return cleaned;
}

/**
 * Envia mensagem de texto via Z-API
 * Retorna true se enviado com sucesso, false caso contrário
 */
export async function enviarMensagemZapi(phone: string, message: string): Promise<boolean> {
  const { instanceId, token, clientToken } = getZapiConfig();
  if (!instanceId || !token || !clientToken) {
    console.warn('[Z-API] Não configurado — mensagem não enviada');
    return false;
  }

  const phoneFormatado = formatarTelefoneZapi(phone);
  const url = `${ZAPI_BASE}/instances/${instanceId}/token/${token}/send-text`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': clientToken,
      },
      body: JSON.stringify({ phone: phoneFormatado, message }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[Z-API] Erro HTTP ${response.status}: ${body}`);
      return false;
    }

    const data = await response.json().catch(() => ({}));
    console.log(`[Z-API] Mensagem enviada para ${phoneFormatado} — zaapId: ${data?.zaapId ?? '?'}`);
    return true;
  } catch (err) {
    console.error('[Z-API] Erro ao enviar mensagem:', err);
    return false;
  }
}

/**
 * Notifica o corretor sobre um novo lead recebido via ADS
 */
export async function notificarCorretorNovoLead(params: {
  corretor: { id: number; nome: string; telefone: string };
  lead: { id: number; nome: string; telefone?: string | null; origem?: string | null };
  projetoNome?: string | null;
}): Promise<void> {
  const { corretor, lead, projetoNome } = params;

  const linkLead = `${APP_BASE_URL}/leads?leadId=${lead.id}`;

  const origemLabel: Record<string, string> = {
    facebook: 'Facebook Ads',
    instagram: 'Instagram Ads',
    google: 'Google Ads',
    indicacao: 'Indicação',
    site: 'Site',
    outro: 'Outro',
  };
  const origemTexto = origemLabel[lead.origem ?? ''] ?? lead.origem ?? 'ADS';

  const mensagem = [
    `🔥 *Novo lead recebido!*`,
    ``,
    `👤 *Nome:* ${lead.nome}`,
    projetoNome ? `🏠 *Projeto:* ${projetoNome}` : null,
    `📣 *Origem:* ${origemTexto}`,
    ``,
    `👉 Acesse agora: ${linkLead}`,
    ``,
    `_Responda em até 5 minutos para aumentar sua taxa de conversão!_`,
  ].filter(Boolean).join('\n');

  await enviarMensagemZapi(corretor.telefone, mensagem);
}
