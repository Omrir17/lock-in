// The coach: a chat with an OpenAI-compatible model that knows the plan, the log and the memories,
// and changes them through tools.
import { SYSTEM } from './prompt';
import { addDays, all, Env, first, HttpError, isDay, localNow, nextWorkout, run, savePlan, setMetric, upsertCheckin } from './util';

type Msg = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save a durable fact about the user (injury, schedule, equipment, preference, goal, how a change worked). Not passing moods. One fact per call, in Hebrew.',
      parameters: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget_memory',
      description: 'Delete a saved fact that is wrong or outdated, by its id from the memory list.',
      parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Replace the training plan. Only when the user asked for the change or approved your proposal. Send the COMPLETE plan JSON in the same shape as the current one, with the change applied.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'object', description: 'The full plan: startDate, rotation, warmup, rules, phases, workouts[{code,name,title,goal,exercises[{name,sets,reps,rest,notes,kind,track}]}]' },
          summary: { type: 'string', description: 'What changed, in Hebrew, one line' },
        },
        required: ['plan', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_checkin',
      description: 'Record a day from what the user said in chat: going (plans to train), done (trained), game (played basketball/football), skipped (did not train, with reason).',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'YYYY-MM-DD' },
          status: { type: 'string', enum: ['going', 'done', 'game', 'skipped'] },
          workout_code: { type: 'string' },
          skip_reason: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          energy: { type: 'integer', minimum: 1, maximum: 5 },
          notes: { type: 'string' },
        },
        required: ['day', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_metric',
      description: 'Record a number: sleep (hours), bodyweight (kg), vertical (vertical jump, cm), broad (broad jump, cm), squat5 (squat 5-rep weight, kg).',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string' },
          kind: { type: 'string', enum: ['sleep', 'bodyweight', 'vertical', 'broad', 'squat5'] },
          value: { type: 'number' },
        },
        required: ['day', 'kind', 'value'],
      },
    },
  },
];

export function validPlan(p: unknown): string | null {
  const plan = p as Record<string, unknown>;
  if (!plan || typeof plan !== 'object') return 'plan is not an object';
  if (!Array.isArray(plan.workouts) || !plan.workouts.length) return 'workouts missing';
  if (!Array.isArray(plan.rotation) || !plan.rotation.length) return 'rotation missing';
  for (const w of plan.workouts as Record<string, unknown>[]) {
    if (!w.code || !w.name || !Array.isArray(w.exercises)) return `workout ${w.code ?? '?'} is incomplete`;
    for (const e of w.exercises as Record<string, unknown>[]) {
      if (!e.name || typeof e.sets !== 'number' || !e.reps) return `exercise in ${w.code} is incomplete`;
    }
  }
  for (const c of plan.rotation as string[]) {
    if (!(plan.workouts as { code: string }[]).some((w) => w.code === c)) return `rotation code ${c} has no workout`;
  }
  if (!isDay(plan.startDate) || !Array.isArray(plan.phases)) return 'startDate or phases missing';
  return null;
}

async function runTool(db: D1Database, uid: number, name: string, a: Record<string, unknown>, changed: Set<string>): Promise<string> {
  try {
    switch (name) {
      case 'save_memory':
        await run(db, 'insert into memories (user_id, fact) values (?, ?)', uid, String(a.fact ?? '').slice(0, 500));
        changed.add('memories');
        return 'saved';
      case 'forget_memory':
        await run(db, 'delete from memories where user_id = ? and id = ?', uid, Number(a.id));
        changed.add('memories');
        return 'deleted';
      case 'update_plan': {
        const bad = validPlan(a.plan);
        if (bad) return `rejected: ${bad}. Send the complete plan.`;
        await savePlan(db, uid, a.plan, String(a.summary ?? ''));
        changed.add('plan');
        return 'plan updated';
      }
      case 'log_checkin': {
        if (!isDay(a.day)) return 'rejected: day must be YYYY-MM-DD';
        const patch: Record<string, unknown> = { status: a.status };
        for (const k of ['workout_code', 'skip_reason', 'rating', 'energy', 'notes']) if (a[k] != null) patch[k] = a[k];
        await upsertCheckin(db, uid, a.day, patch);
        changed.add('checkins');
        return 'logged';
      }
      case 'log_metric':
        if (!isDay(a.day) || typeof a.value !== 'number') return 'rejected: day YYYY-MM-DD and numeric value required';
        await setMetric(db, uid, a.day, String(a.kind), a.value);
        changed.add('metrics');
        return 'logged';
    }
    return 'unknown tool';
  } catch (e) {
    return 'error: ' + (e as Error).message;
  }
}

async function context(db: D1Database, uid: number): Promise<string> {
  const { day, dow } = localNow();
  const [profile, plan, mem, checks, sets, metrics] = await Promise.all([
    first<{ ask_time: string; review_time: string; weekly_goal: number }>(db, 'select ask_time, review_time, weekly_goal from profiles where user_id = ?', uid),
    first<{ data: string }>(db, 'select data from plans where user_id = ?', uid),
    all<{ id: number; fact: string }>(db, 'select id, fact from memories where user_id = ? order by id', uid),
    all<{ day: string; status: string; workout_code: string | null }>(db, 'select day, status, workout_code, skip_reason, rating, energy, notes from checkins where user_id = ? and day >= ? order by day', uid, addDays(day, -28)),
    all<{ day: string; exercise: string; weight: number | null; reps: number | null }>(db, 'select day, exercise, weight, reps from set_logs where user_id = ? and day >= ? order by day, set_no', uid, addDays(day, -45)),
    all<{ day: string; kind: string; value: number }>(db, 'select day, kind, value from metrics where user_id = ? order by day desc limit 60', uid),
  ]);
  const p = plan ? JSON.parse(plan.data) : null;
  const week = p ? Math.max(1, Math.floor((Date.parse(day) - Date.parse(p.startDate)) / (7 * 86400000)) + 1) : null;
  const next = p ? nextWorkout(p, checks, day) : null;
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  const byKey = new Map<string, string[]>();
  for (const s of sets) {
    const k = `${s.day} ${s.exercise}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(`${s.weight ?? '-'}×${s.reps ?? '-'}`);
  }
  const setLines = [...byKey].map(([k, v]) => `${k}: ${v.join(', ')}`);

  return [
    `היום: יום ${days[dow]}, ${day}.${week ? ` שבוע ${week} בתוכנית.` : ''}${next ? ` האימון הבא בתור: ${next.code} (${next.label}).` : ''}`,
    profile ? `הגדרות: שאלה ב-${profile.ask_time}, סיכום ב-${profile.review_time}, יעד ${profile.weekly_goal} אימונים בשבוע.` : '',
    `## מה שאתה יודע עליו (memories, עם id)\n${mem.map((m) => `[${m.id}] ${m.fact}`).join('\n') || '(עדיין כלום. תכיר אותו.)'}`,
    `## התוכנית הנוכחית (JSON)\n${plan?.data ?? 'null'}`,
    `## ימים אחרונים (28 יום)\n${checks.map((c) => JSON.stringify(c)).join('\n') || '(אין)'}`,
    `## סטים שנרשמו (45 יום, משקל×חזרות)\n${setLines.join('\n') || '(אין)'}`,
    `## מדדים אחרונים\n${metrics.map((m) => `${m.day} ${m.kind}=${m.value}`).join('\n') || '(אין)'}`,
  ].join('\n\n');
}

// Some models reject reasoning_effort together with function tools unless it is 'none';
// others reject 'none' or the parameter altogether. Try in this order.
const EFFORTS: (string | null)[] = ['low', 'none', null];

async function complete(env: Env, messages: Msg[], model: string, effort: string | null) {
  const body: Record<string, unknown> = { model, messages, tools: TOOLS, max_completion_tokens: 3000 };
  if (effort) body.reasoning_effort = effort;
  const r = await fetch(`${env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({})) as { choices?: { message: Msg }[]; error?: { message?: string } };
  return { ok: r.ok, status: r.status, j };
}

async function chat(env: Env, messages: Msg[]): Promise<Msg> {
  const fallback = env.OPENAI_FALLBACK_MODEL ?? 'gpt-5.6-luna';
  let model = env.OPENAI_MODEL ?? 'gpt-6-luna', e = 0;
  let last = 'the model did not answer';
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await complete(env, messages, model, EFFORTS[e]);
    if (res.ok && res.j.choices?.[0]) return res.j.choices[0].message;
    const msg = res.j.error?.message ?? `HTTP ${res.status}`;
    last = msg;
    if (/reasoning/i.test(msg) && e < EFFORTS.length - 1) { e++; continue; }
    if (model !== fallback && (res.status === 400 || res.status === 404 || /model/i.test(msg))) { model = fallback; e = 0; continue; }
    throw new Error(msg);
  }
  throw new Error(last);
}

export async function coach(env: Env, uid: number, message: unknown) {
  if (!env.OPENAI_API_KEY) throw new HttpError(500, 'חסר OPENAI_API_KEY בשרת');
  const text = String(message ?? '').trim().slice(0, 4000);
  if (!text) throw new HttpError(400, 'הודעה ריקה');
  const db = env.DB;

  const hist = await all<{ role: string; content: string }>(db, 'select role, content from messages where user_id = ? order by id desc limit 30', uid);
  await run(db, "insert into messages (user_id, role, content) values (?, 'user', ?)", uid, text);

  const messages: Msg[] = [
    { role: 'system', content: SYSTEM + '\n\n' + (await context(db, uid)) },
    ...hist.reverse().map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: text },
  ];

  const changed = new Set<string>();
  for (let round = 0; round < 6; round++) {
    let reply: Msg;
    try {
      reply = await chat(env, messages);
    } catch (e) {
      throw new HttpError(502, `המודל לא ענה: ${(e as Error).message}`);
    }
    if (!reply.tool_calls?.length) {
      const content = (reply.content ?? '').trim() || 'בוצע.';
      await run(db, "insert into messages (user_id, role, content) values (?, 'assistant', ?)", uid, content);
      return { reply: content, changed: [...changed] };
    }
    messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls });
    for (const call of reply.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* bad args */ }
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(db, uid, call.function.name, args, changed) });
    }
  }
  throw new HttpError(500, 'המאמן נתקע בלולאה. נסה לנסח שוב.');
}
