// gary-chat Edge Function
// ---------------------------------------------------------------------------
// Handles POST { userMessage, history } from iOS, returns { reply, toolCalls? }.
// Loads today's picks + pick_context, builds Gary's persona prompt, runs
// Gemini Flash with tool calls, returns final reply text. iOS handles TTS.
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GARY_PERSONA_PROMPT, formatPicksMemoryBlock } from "./persona.ts";
import { GARY_CHAT_TOOLS, executeTool } from "./tools.ts";

// CORS — iOS app calls this from the device
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_TOOL_ROUND_TRIPS = 5;
const MAX_OUTPUT_TOKENS = 1200; // Gary keeps it conversational — chunky paragraphs not allowed anyway

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatTurn {
  role: "user" | "model";
  text: string;
}

interface RequestBody {
  userMessage: string;
  history?: ChatTurn[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;
    if (!body || typeof body.userMessage !== "string" || !body.userMessage.trim()) {
      return json({ error: "userMessage is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "Server misconfigured: missing Supabase env" }, 500);
    }
    if (!geminiKey) {
      return json({ error: "Server misconfigured: missing GEMINI_API_KEY" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ─── Load today's picks + pick_context for the persona memory block ───
    const todayEst = todayEstISODate();
    const { data: picksRow } = await supabase
      .from("daily_picks")
      .select("date, picks")
      .eq("date", todayEst)
      .maybeSingle();

    const todayPicks = (picksRow?.picks as any[]) || [];
    const pickIds = todayPicks.map((p: any) => p.pick_id).filter(Boolean);

    let contexts: any[] = [];
    if (pickIds.length > 0) {
      const { data: ctxRows } = await supabase
        .from("pick_context")
        .select("*")
        .in("pick_id", pickIds);
      contexts = ctxRows || [];
    }

    // Build persona + memory block
    const memoryBlock = formatPicksMemoryBlock(
      todayPicks.map((p: any) => ({
        pick_id: p.pick_id,
        away_team: p.awayTeam,
        home_team: p.homeTeam,
        league: p.league,
        pick: p.pick,
        rationale: p.rationale,
        commence_time: p.commence_time,
      })),
      contexts
    );
    const systemInstruction = GARY_PERSONA_PROMPT + memoryBlock;

    // Build Gemini conversation history
    const contents = buildContents(body.history || [], body.userMessage);

    // ─── Gemini loop with tool calls ───
    let response = await callGemini(geminiKey, systemInstruction, contents);
    let toolRoundTrips = 0;

    while (toolRoundTrips < MAX_TOOL_ROUND_TRIPS) {
      const functionCalls = extractFunctionCalls(response);
      if (functionCalls.length === 0) break;

      // Run each tool, then send results back to Gemini
      const funcResponses: any[] = [];
      for (const fc of functionCalls) {
        const result = await executeTool(fc.name, fc.args, { supabase });
        funcResponses.push({
          functionResponse: {
            name: fc.name,
            response: result.ok ? { content: result.data } : { content: { error: result.error } },
          },
        });
      }

      // Append model's tool-call turn EXACTLY as returned (preserves thought_signature
      // which Gemini 3 requires for subsequent function calls to work).
      const modelContent = response?.candidates?.[0]?.content;
      if (modelContent) {
        contents.push(modelContent);
      }
      contents.push({
        role: "user",
        parts: funcResponses,
      });

      response = await callGemini(geminiKey, systemInstruction, contents);
      toolRoundTrips++;
    }

    const replyText = extractText(response);
    return json({ reply: replyText, toolRoundTrips });
  } catch (e) {
    console.error("[gary-chat] error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini helpers
// ─────────────────────────────────────────────────────────────────────────────

interface FunctionCall {
  name: string;
  args: any;
}

async function callGemini(apiKey: string, systemInstruction: string, contents: any[]): Promise<any> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: GARY_CHAT_TOOLS }],
    generationConfig: {
      temperature: 1.0,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: {
        thinkingLevel: "low", // low for chat — keep responses snappy
      },
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Gemini ${r.status}: ${errText.slice(0, 400)}`);
  }
  return await r.json();
}

function extractFunctionCalls(response: any): FunctionCall[] {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const calls: FunctionCall[] = [];
  for (const p of parts) {
    if (p.functionCall && p.functionCall.name) {
      calls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
    }
  }
  return calls;
}

function extractText(response: any): string {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const textParts: string[] = [];
  for (const p of parts) {
    if (p.text && !p.thought) textParts.push(p.text);
  }
  return textParts.join("").trim() || "Eh, give me that again — I lost the thread.";
}

function buildContents(history: ChatTurn[], userMessage: string): any[] {
  const contents: any[] = [];
  for (const turn of history) {
    if (!turn || !turn.text) continue;
    contents.push({
      role: turn.role === "model" ? "model" : "user",
      parts: [{ text: turn.text }],
    });
  }
  contents.push({ role: "user", parts: [{ text: userMessage }] });
  return contents;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────

function json(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function todayEstISODate(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
