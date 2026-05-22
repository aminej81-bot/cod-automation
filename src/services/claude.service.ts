import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import logger from '../utils/logger';

const client = new Anthropic({ apiKey: config.claude.apiKey });

export interface OrderContext {
  orderName: string;
  productTitle: string;
  status: string;
  totalPrice: number;
  currency: string;
  customerCity?: string | null;
}

export async function askClaudeWithContext(
  customerMessage: string,
  orderCtx: OrderContext,
  faq?: Record<string, string> | null,
): Promise<string> {
  const faqText = faq
    ? Object.entries(faq)
        .map(([q, a]) => `Q: ${q}\nR: ${a}`)
        .join('\n\n')
    : 'Aucune FAQ disponible.';

  const systemPrompt =
    `Tu es un assistant service client pour une boutique eCommerce au Maroc spécialisée dans la vente en Cash on Delivery (COD). ` +
    `Tu aides les clients avec leurs questions sur leurs commandes. ` +
    `Réponds dans la même langue que le client (français, arabe ou darija marocain). ` +
    `Sois amical, concis et professionnel. Ne dépasse pas 3 phrases.\n\n` +
    `Contexte de la commande:\n` +
    `- Numéro: ${orderCtx.orderName}\n` +
    `- Produit: ${orderCtx.productTitle}\n` +
    `- Statut: ${orderCtx.status}\n` +
    `- Montant: ${orderCtx.totalPrice} ${orderCtx.currency}\n` +
    (orderCtx.customerCity ? `- Ville: ${orderCtx.customerCity}\n` : '') +
    `\nFAQ Produit:\n${faqText}`;

  try {
    const response = await client.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: customerMessage }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return text.trim();
  } catch (err: unknown) {
    const e = err as { message?: string };
    logger.error('Claude API error', { error: e.message });
    return 'Désolé, je ne peux pas répondre pour le moment. Merci de nous contacter directement.';
  }
}
