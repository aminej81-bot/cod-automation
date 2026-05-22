export type MessageIntent =
  | 'confirmation'
  | 'cancellation'
  | 'image_request'
  | 'delivery_question'
  | 'ingredients_question'
  | 'tracking'
  | 'general';

// Order matters — more specific patterns checked first
const PATTERNS: Array<{ intent: MessageIntent; regex: RegExp }> = [
  {
    intent: 'cancellation',
    regex: /\b(annuler?|cancel|non|no\b|refus|ماشي بي|لا|ما بغيتش)\b/i,
  },
  {
    intent: 'confirmation',
    regex: /\b(oui|ok\b|okay|confirme?|confirm|accord|d'?accord|valide?|yes|نعم|واه|آه|مزيان)\b/i,
  },
  {
    intent: 'image_request',
    regex: /\b(photo|image|voir|pic|picture|img|صورة|صور|شوف|بعثلي|أرسل)\b/i,
  },
  {
    intent: 'ingredients_question',
    regex: /\b(ingr[eé]dients?|composition|composants?|contient|مكونات|محتويات|فيه شي|داخله)\b/i,
  },
  {
    intent: 'delivery_question',
    regex: /\b(livraison|d[eé]lai|combien|quand|dur[eé]e|temps|exp[eé]dit|ship|deliver|توصيل|متى|قداش|شحال|وقت)\b/i,
  },
  {
    intent: 'tracking',
    regex: /\b(suivi|o[uù]\s*est|tracking|colis|statut|[eé]tat|commande|أين|وين|track|وصل|مكان|أين طلبي)\b/i,
  },
];

export function detectIntent(message: string): MessageIntent {
  const text = message.toLowerCase().trim();
  for (const { intent, regex } of PATTERNS) {
    if (regex.test(text)) return intent;
  }
  return 'general';
}
