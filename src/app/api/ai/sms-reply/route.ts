import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openrouter/free";

interface SmsReplyBody {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  queueStats?: { totalWaiting?: number };
}

export async function POST(request: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not set" }, { status: 500 });
  }

  let body: SmsReplyBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const waiting = body.queueStats?.totalWaiting ?? 0;
  const history = (body.history ?? []).slice(-8);

  const systemPrompt =
    "You are QFlow SMS assistant for Mukono Health Centre IV. Reply like an SMS in under 240 characters, helpful and concise. " +
    "If user asks queue position, tell them to use their ticket number. Do not invent clinical advice.";

  const messages = [
    { role: "system" as const, content: `${systemPrompt} Current waiting patients: ${waiting}.` },
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: "user" as const, content: userMessage },
  ];

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    };
    const referer = request.nextUrl?.origin;
    if (referer) headers["HTTP-Referer"] = referer;

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 120,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: "OpenRouter request failed", details: errText }, { status: 502 });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Thanks. We received your message.";
    return NextResponse.json({ reply });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "AI SMS reply failed", details: err }, { status: 500 });
  }
}

