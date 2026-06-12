const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openrouter/free';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const FALLBACK_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free',
];

async function tryOpenRouterModel(
  key: string,
  model: string,
  messages: ChatMessage[],
  origin: string | undefined,
  maxTokens: number
): Promise<string | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  if (origin) headers['HTTP-Referer'] = origin;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    console.warn('[QFlow] OpenRouter error:', model, res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data?.choices?.[0]?.message?.content?.trim()?.replace(/^["']|["']$/g, '');
  return text || null;
}

/** Returns AI text, or null if OpenRouter is unavailable or the request fails. */
export async function requestOpenRouterChat(
  messages: ChatMessage[],
  origin?: string,
  maxTokens = 120
): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;

  const models = [
    process.env.OPENROUTER_MODEL?.trim(),
    DEFAULT_MODEL,
    ...FALLBACK_MODELS,
  ].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

  try {
    for (const model of models) {
      const text = await tryOpenRouterModel(key, model, messages, origin, maxTokens);
      if (text) return text;
    }
    return null;
  } catch (e) {
    console.warn('[QFlow] OpenRouter request failed:', e);
    return null;
  }
}
