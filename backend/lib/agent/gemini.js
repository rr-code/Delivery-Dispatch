import { ApiError } from "../errors.js";
import { db } from "../supabase.js";
import { declarations, chatDeclarations, WRITE_TOOLS, executeTool } from "./tools.js";

const SYSTEM = `You are the Delivery Dispatch Agent for a delivery company.
You work ONLY through the provided tools. Never invent ids, distances, ETAs or driver data; use tool results.

Dispatching:
1. Call get_pending_orders.
2. For each order (urgent first) call get_candidate_drivers. It is already ranked by routed pickup ETA, then lower load, then higher rating.
3. Call assign_driver for the best candidate with a short reason.
4. If assign_driver returns an error, read it, try the next candidate, and if none work call log_event so a human can step in.

Exceptions:
- For delays call get_delayed_deliveries. Use reassign_order only for deliveries still in 'assigned' status. For picked-up or in-transit deliveries use flag_delay or log_event.
- The backend validates every write and may reject it. Do not retry the same rejected call.

Finish with a short plain-text summary: what you assigned (order -> driver), what failed, and what needs human attention.`;

const CHAT_SYSTEM = `You are the Delivery Dispatch Assistant, talking with a dispatcher at a delivery company.
You answer questions about orders, drivers, assignments, routes, delivery status and delays, and you carry out dispatch actions when explicitly asked.

Data rules (most important):
- Every fact you state (counts, names, ids, statuses, distances, ETAs, delays) must come from a tool result in THIS turn. Data changes constantly, so call the relevant tool again even if an earlier message mentioned it.
- Never guess or fill gaps. If a tool returns an error, empty data, or does not contain what was asked, say plainly what you could not find and why.
- For counts, use find_orders with a status filter and report total_matching (get_pending_orders is capped at 20 rows). If count_is_lower_bound is true, say "at least".
- Users refer to orders by customer name, address, or the first characters of an id. Resolve them with find_orders. If several orders match, list them briefly and ask which one. Resolve drivers by name with get_all_drivers.
- Tool distances are in metres and durations in seconds; convert to km and minutes. Only quote distances/ETAs a tool returned.
- "Closest/best driver for an order" = get_candidate_drivers for that order (eligible drivers ranked by routed ETA to pickup). If it returns no candidates, say so.
- "Delayed deliveries" = get_delayed_deliveries. "Status of an order" = get_order_details (includes its delivery history and driver).

Actions (write tools: assign_driver, reassign_order, update_delivery_status, flag_delay, log_event):
- These change real data. Use them ONLY when the user's latest message explicitly asks you to do that action (e.g. "assign the best driver to Priya's order"). A question such as "who should I assign?" is not a request: answer it and offer to do it.
- To assign the best driver: get_candidate_drivers, then assign_driver with the top candidate and a short reason. If the backend rejects it, report the reason; you may try the next candidate once. Never retry an identical rejected call.
- If a write tool is not available to you, tell the user to ask for the action explicitly.
- After an action, confirm exactly what changed, based on the tool result.

Scope and style:
- Stay on delivery dispatch operations. Politely decline unrelated requests.
- Be concise. Plain text only (no markdown tables or headings); short "- " lists are fine.
- When naming an order, show the customer name and the first 8 characters of its id.`;

// Messages that look like an instruction to act. Only these unlock write tools in chat; the system
// prompt then decides whether the message really asks for that action. Questions never unlock writes.
const ACTION_RE =
  /\b(assign|re-?assign|allocate|move|mark|set|update|change|flag|log|record|cancel|confirm|approve|proceed|go ahead|do it|yes|yep|yeah|ok(ay)?)\b/i;

const CHAT_DEADLINE_MS = 55000; // stay under the route's maxDuration (60s)
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 12;

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Strip anything that looks like a Google API key before it reaches logs or clients.
function redact(text) {
  let out = String(text ?? "");
  const key = process.env.GEMINI_API_KEY;
  if (key) out = out.split(key).join("[redacted]");
  return out.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]");
}

async function callGemini(contents, { system = SYSTEM, tools = declarations, toolMode = "AUTO", timeoutMs = 45000 } = {}) {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.2 },
  };
  if (tools.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: toolMode } };
  }

  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      console.error(`Gemini request timed out after ${timeoutMs}ms`);
      throw new ApiError(504, "The AI model did not respond in time. Please try again.");
    }
    console.error("Gemini unreachable:", redact(e?.message));
    throw new ApiError(502, "Could not reach the AI model service.");
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let detail = raw;
    try {
      detail = JSON.parse(raw)?.error?.message || raw;
    } catch {}
    detail = redact(detail).slice(0, 600);
    console.error(`Gemini error ${res.status}: ${detail}`);
    if (res.status === 429) {
      if (/per ?day/i.test(detail)) {
        const m = detail.match(/retry in (?:(\d+)h)?(?:(\d+)m)?/i);
        const retry = m && (m[1] || m[2]) ? `${m[1] ? m[1] + "h " : ""}${m[2] || 0}m` : null;
        throw new ApiError(429, `The Gemini API key has used its daily request quota${retry ? ` (resets in about ${retry})` : ""}. Try again later or use a key with a higher quota.`);
      }
      throw new ApiError(429, "The AI model is rate-limited right now. Please wait a moment and try again.");
    }
    if (res.status === 401 || res.status === 403 || /api key/i.test(detail)) {
      throw new ApiError(502, "The AI model rejected the server's GEMINI_API_KEY. Check the key configuration.");
    }
    if (res.status === 404) throw new ApiError(502, `The configured Gemini model "${model}" is not available for this API key. Set GEMINI_MODEL to a supported model.`);
    if (res.status === 503) throw new ApiError(503, "The AI model is overloaded right now. Please try again in a moment.");
    throw new ApiError(502, `The AI model returned an error (HTTP ${res.status}).`);
  }

  try {
    return await res.json();
  } catch {
    throw new ApiError(502, "The AI model returned an unreadable response.");
  }
}

// Gemini <-> tools loop. Max `maxSteps` model calls; every run is saved to agent_runs.
export async function runAgent({
  instruction = "Assign every pending order to the best available driver, then report anything that needs attention.",
  trigger = "manual",
  maxSteps = 8,
} = {}) {
  if (!geminiConfigured()) throw new ApiError(400, "GEMINI_API_KEY is not configured");

  const contents = [{ role: "user", parts: [{ text: instruction }] }];
  const trace = [];
  let output = "";
  let status = "completed";

  try {
    let finished = false;
    for (let step = 0; step < maxSteps; step++) {
      const data = await callGemini(contents);
      const parts = data.candidates?.[0]?.content?.parts || [];
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        output = parts.map((p) => p.text || "").join("").trim();
        finished = true;
        break;
      }

      contents.push({ role: "model", parts }); // keep original parts so Gemini sees its own calls
      const responses = [];
      for (const p of calls) {
        const { name, args } = p.functionCall;
        const result = await executeTool(name, args);
        trace.push({ tool: name, args: args ?? {}, result });
        responses.push({ functionResponse: { name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    if (!finished) {
      status = "max_steps_reached";
      output = "Stopped after reaching the step limit. Some orders may still be pending.";
    }
  } catch (e) {
    status = "failed";
    output = e.message;
    await save({ trigger, instruction, trace, output, status });
    throw e;
  }

  const run = await save({ trigger, instruction, trace, output, status });
  return { run_id: run?.id ?? null, status, output, tool_calls: trace };
}

// Turn the client's chat history into Gemini contents: text only, recent turns, alternating roles,
// starting with a user turn (a leading greeting from the assistant is dropped).
function historyToContents(history) {
  if (history == null) return [];
  if (!Array.isArray(history)) throw new ApiError(400, "history must be an array of { role, text }");
  const contents = [];
  for (const h of history.slice(-MAX_HISTORY)) {
    const text = typeof h?.text === "string" ? h.text.trim().slice(0, MAX_MESSAGE_CHARS) : "";
    const role = h?.role === "user" ? "user" : h?.role === "assistant" ? "model" : null;
    if (!text || !role) continue;
    if (!contents.length && role === "model") continue;
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts[0].text += `\n${text}`;
    else contents.push({ role, parts: [{ text }] });
  }
  // The new message is a user turn, so the history must end with the model.
  if (contents[contents.length - 1]?.role === "user") contents.pop();
  return contents;
}

// Conversational agent: one user message (+ recent history) -> Gemini function-calling loop -> answer.
export async function runChat({ message, history, maxSteps = 6 } = {}) {
  if (typeof message !== "string" || !message.trim()) throw new ApiError(400, "message is required");
  const text = message.trim();
  if (text.length > MAX_MESSAGE_CHARS) throw new ApiError(400, `message must be at most ${MAX_MESSAGE_CHARS} characters`);
  const contents = [...historyToContents(history), { role: "user", parts: [{ text }] }];
  if (!geminiConfigured()) {
    throw new ApiError(503, "AI chat is unavailable: GEMINI_API_KEY is not configured on the server.");
  }

  const writesAllowed = ACTION_RE.test(text);
  const tools = writesAllowed ? chatDeclarations : chatDeclarations.filter((d) => !WRITE_TOOLS.has(d.name));
  const deadline = Date.now() + CHAT_DEADLINE_MS;
  const trace = [];
  let reply = "";
  let status = "completed";

  try {
    for (let step = 0; step < maxSteps; step++) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) throw new ApiError(504, "The AI model took too long to answer. Please try again.");

      // On the last step tools are switched off, so Gemini must answer from what it has gathered.
      const lastStep = step === maxSteps - 1;
      const data = await callGemini(contents, {
        system: CHAT_SYSTEM,
        tools,
        toolMode: lastStep ? "NONE" : "AUTO",
        timeoutMs: Math.min(45000, remaining),
      });
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        reply = parts.map((p) => (p.thought ? "" : p.text || "")).join("").trim();
        if (!reply) {
          const why = candidate?.finishReason || data.promptFeedback?.blockReason || "unknown";
          console.error(`Gemini returned no text (finishReason: ${why})`);
          throw new ApiError(502, `The AI model returned an empty answer (reason: ${why}). Try rephrasing.`);
        }
        if (lastStep && trace.length) status = "max_steps_reached";
        break;
      }

      contents.push({ role: "model", parts }); // keep original parts (incl. thought signatures)
      const responses = [];
      for (const p of calls) {
        const { name, args } = p.functionCall;
        let result;
        if (WRITE_TOOLS.has(name) && !writesAllowed) {
          result = { error: "Write actions are disabled for this message. Ask the user to explicitly request the action." };
        } else {
          result = await executeTool(name, args);
        }
        trace.push({ tool: name, args: args ?? {}, result });
        responses.push({ functionResponse: { name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
  } catch (e) {
    await save({ trigger: "chat", instruction: text, trace, output: e.message, status: "failed" });
    throw e;
  }

  const run = await save({ trigger: "chat", instruction: text, trace, output: reply, status });
  return { reply, status, run_id: run?.id ?? null, writes_enabled: writesAllowed, tool_calls: trace };
}

async function save({ trigger, instruction, trace, output, status }) {
  try {
    const { data, error } = await db()
      .from("agent_runs")
      .insert({ trigger, instruction, tool_calls: trace, output, status })
      .select("id")
      .single();
    if (error) console.error("agent_runs insert failed:", error.message);
    return data;
  } catch (e) {
    // Auditing must never break the request (e.g. Supabase not configured).
    console.error("agent_runs insert failed:", e.message);
    return null;
  }
}
