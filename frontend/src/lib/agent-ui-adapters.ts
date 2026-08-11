import type { PlanResult, PlanTransport } from '@forjio/agent-ui';
import {
  requestAssistantPlan,
  type AssistantMode,
  type AssistantResource,
} from '@/hooks/use-catentio';

/**
 * The @forjio/agent-ui plan seam, wired to malapos's catentio BFF
 * (backend/src/routes/catentio.ts). The browser never talks to catentio
 * directly — the call lands on our backend, which owns the API key, the
 * feature-flag gate, the credit pre-flight and the delegation token.
 *
 * MAPPING DECISION (ported from storlaunch, which ported it from
 * linksnap — the reference integration). The sheet's AgenticEditor
 * flattens everything into ONE string via
 * `resource.buildAgentPrompt(...)` and hands it to
 * `transport.requestPlan(fullPrompt)`. But our BFF builds the real agent
 * prompt SERVER-SIDE from structured pieces — POST /catentio/plan
 * {resource, mode, prompt, draft, initial, history} — and sanitizes the
 * returned plan against `MALAPOS_PROFILE.resources`. Prose-prompting
 * the BFF would double-wrap the prompt and route around that contract,
 * so the seam is split in two:
 *
 *  1. every CrudResource's buildAgentPrompt returns a JSON ENVELOPE —
 *     JSON.stringify({ prompt, draft, history }) — no prose, no schema
 *     text (the BFF owns the schema text);
 *  2. this per-(resource, mode) transport parses the envelope back and
 *     POSTs the structured body. It keeps its own {prompt, plan} turn
 *     log, which is exactly the `history` shape the BFF accepts. (The
 *     editor's flattened history string cannot be recovered into that
 *     shape; the transport witnessed both halves of every turn, so it
 *     records them itself.)
 *
 * The flattened history is still read for ONE thing: when an Apply
 * failed, the editor appends the server error after a fixed marker. We
 * lift that error into the next prompt so "fix it" puts the exact
 * rejection in front of the agent.
 */

interface PlanEnvelope {
  prompt?: string;
  draft?: Record<string, unknown>;
  history?: string;
}

/** Verbatim marker from @forjio/agent-ui's AgenticEditor (0.1.x). */
const APPLY_ERROR_MARKER =
  'system: the last Apply attempt was REJECTED by the server with this error — correct the plan accordingly:\n';

/** Mirror of the BFF's MAX_PROMPT_CHARS — it 422s past this. */
const MAX_PROMPT_CHARS = 4_000;

/** Turns the BFF actually reads (it slices history to the last 5). */
const HISTORY_TURNS = 5;

export function createPlanTransport(
  resource: AssistantResource,
  mode: AssistantMode,
  getInitial?: () => Record<string, unknown> | undefined,
): PlanTransport {
  // One transport instance = one sheet session; mount a fresh transport
  // per sheet open so context never leaks across sessions.
  const turns: { prompt: string; plan: Record<string, unknown> | null }[] = [];
  return {
    // The BFF bounds the run well before the request abort fires, so the
    // calm "still running" note should appear before that.
    slowAfterMs: 60_000,
    async requestPlan(fullPrompt): Promise<PlanResult> {
      let envelope: PlanEnvelope;
      try {
        envelope = JSON.parse(fullPrompt) as PlanEnvelope;
      } catch {
        // A resource whose buildAgentPrompt was not envelope-shaped —
        // treat the whole string as the user prompt rather than drop it.
        envelope = { prompt: fullPrompt };
      }
      let prompt = envelope.prompt ?? '';
      const at = (envelope.history ?? '').lastIndexOf(APPLY_ERROR_MARKER);
      if (at >= 0) {
        const applyError = envelope
          .history!.slice(at + APPLY_ERROR_MARKER.length)
          .trim();
        prompt = `${prompt}\n\nThe previous Apply attempt was rejected by the server with this error — correct the plan accordingly:\n${applyError}`;
      }
      const draft =
        envelope.draft && Object.keys(envelope.draft).length > 0
          ? envelope.draft
          : undefined;
      const resp = await requestAssistantPlan({
        resource,
        mode,
        prompt: prompt.slice(0, MAX_PROMPT_CHARS),
        draft,
        initial: getInitial?.(),
        history: turns.slice(-HISTORY_TURNS),
      });
      turns.push({ prompt: envelope.prompt ?? '', plan: resp.plan });
      // The BFF drops out-of-schema fields server-side; keep that
      // visible in the transcript rather than letting a field silently
      // vanish between what the agent said and what the form shows.
      const message =
        resp.droppedFields && resp.droppedFields.length > 0
          ? `${resp.message}\n\n_Out-of-schema fields the assistant proposed were dropped by the server: ${resp.droppedFields.join(', ')}._`
          : resp.message;
      return { message, plan: resp.plan };
    },
  };
}
