import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../env.js';

export const anthropicClient = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY
});

export async function extractReceiptDataFromText(input: string) {
  const response = await anthropicClient.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 800,
    system:
      'Extrae datos estructurados de comprobantes bancarios academicos. Responde solo JSON con payer_name, receiver_name, bank_name, payment_date, payment_time, amount, deposit_number, summary.',
    messages: [
      {
        role: 'user',
        content: input
      }
    ]
  });

  return response;
}

export async function extractReceiptDataFromImage(input: {
  mediaType: 'image/png' | 'image/jpeg';
  base64Data: string;
}) {
  const response = await anthropicClient.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 800,
    system:
      'Extrae datos estructurados de comprobantes bancarios academicos. Responde solo JSON con payer_name, receiver_name, bank_name, payment_date, payment_time, amount, deposit_number, summary, confidence. payment_date debe venir siempre en formato YYYY-MM-DD. payment_time debe venir en formato HH:mm:ss de 24 horas. amount debe venir solo como numero sin simbolo de moneda.',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: input.mediaType,
              data: input.base64Data
            }
          },
          {
            type: 'text',
            text: 'Analiza esta imagen de comprobante bancario academico y responde solo con JSON valido. Si ves fecha como 21/03/2026 conviertela a 2026-03-21. Si ves Q900.00 devuelve 900.00.'
          }
        ]
      }
    ]
  });

  return response;
}
