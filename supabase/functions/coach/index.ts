// The coach: a chat with an OpenAI-compatible model that knows the plan, the log and the memories,
// and can change them through tools.
import { admin, caller, cors, isOwner, json, localNow, nextWorkout } from '../_shared/util.ts';
import { SYSTEM } from './prompt.ts';

const KEY = Deno.env.get('OPENAI_API_KEY');
const BASE = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-6-luna';
const FALLBACK = Deno.env.get('OPENAI_FALLBACK_MODEL') ?? 'gpt-5.6-luna';

type DB = ReturnType<typeof admin>;
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

function validPlan(p: unknown): string | null {
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
  if (!plan.startDate || !Array.isArray(plan.phases)) return 'startDate or phases missing';
  return null;
}

async function runTool(db: DB, uid: string, name: string, args: Record<string, unknown>, changed: Set<string>): Promise<string> {
  switch (name) {
    case 'save_memory': {
      const { error } = await db.from('memories').insert({ user_id: uid, fact: String(args.fact) });
      if (error) return 'error: ' + error.message;
      changed.add('memories');
      return 'saved';
    }
    case 'forget_memory': {
      const { error } = await db.from('memories').delete().eq('user_id', uid).eq('id', args.id);
      if (error) return 'error: ' + error.message;
      changed.add('memories');
      return 'deleted';
    }
    case 'update_plan': {
      const bad = validPlan(args.plan);
      if (bad) return 'rejected: ' + bad + '. Send the complete plan.';
      const { error } = await db.from('plans').update({ data: args.plan }).eq('user_id', uid);
      if (error) return 'error: ' + error.message;
      const { data: v } = await db.from('plan_versions').select('id').eq('user_id', uid).order('id', { ascending: false }).limit(1).maybeSingle();
      if (v) await db.from('plan_versions').update({ note: String(args.summary ?? '') }).eq('id', v.id);
      changed.add('plan');
      return 'plan updated';
    }
    case 'log_checkin': {
      const row: Record<string, unknown> = { user_id: uid, day: args.day, status: args.status };
      for (const k of ['workout_code', 'skip_reason', 'rating', 'energy', 'notes']) if (args[k] != null) row[k] = args[k];
      const { error } = await db.from('checkins').upsert(row, { onConflict: 'user_id,day' });
      if (error) return 'error: ' + error.message;
      changed.add('checkins');
      return 'logged';
    }
    case 'log_metric': {
      const { error } = await db.from('metrics').upsert({ user_id: uid, day: args.day, kind: args.kind, value: args.value }, { onConflict: 'user_id,day,kind' });
      if (error) return 'error: ' + error.message;
      changed.add('metrics');
      return 'logged';
    }
  }
  return 'unknown tool';
}

async function context(db: DB, uid: string): Promise<string> {
  const { day, dow } = localNow();
  const since28 = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const since45 = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const [profile, plan, mem, checks, sets, metrics] = await Promise.all([
    db.from('profiles').select('ask_time,review_time,weekly_goal').eq('user_id', uid).maybeSingle(),
    db.from('plans').select('data').eq('user_id', uid).maybeSingle(),
    db.from('memories').select('id,fact').eq('user_id', uid).order('id'),
    db.from('checkins').select('day,status,workout_code,skip_reason,rating,energy,notes').eq('user_id', uid).gte('day', since28).order('day'),
    db.from('set_logs').select('day,exercise,set_no,weight,reps').eq('user_id', uid).gte('day', since45).order('day').order('set_no'),
    db.from('metrics').select('day,kind,value').eq('user_id', uid).order('day', { ascending: false }).limit(60),
  ]);
  const p = plan.data?.data;
  const week = p ? Math.max(1, Math.floor((Date.parse(day) - Date.parse(p.startDate)) / (7 * 86400000)) + 1) : null;
  const next = p ? nextWorkout(p, checks.data ?? [], day) : null;
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  const setLines: string[] = [];
  const byKey = new Map<string, string[]>();
  for (const s of sets.data ?? []) {
    const k = `${s.day} ${s.exercise}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(`${s.weight ?? '-'}×${s.reps ?? '-'}`);
  }
  for (const [k, v] of byKey) setLines.push(`${k}: ${v.join(', ')}`);

  return [
    `היום: יום ${days[dow]}, ${day}.${week ? ` שבוע ${week} בתוכנית.` : ''}${next ? ` האימון הבא בתור: ${next.code} (${next.label}).` : ''}`,
    `הגדרות: שאלה ב-${profile.data?.ask_time?.slice(0, 5)}, סיכום ב-${profile.data?.review_time?.slice(0, 5)}, יעד ${profile.data?.weekly_goal} אימונים בשבוע.`,
    `## מה שאתה יודע עליו (memories, עם id)\n${(mem.data ?? []).map((m) => `[${m.id}] ${m.fact}`).join('\n') || '(עדיין כלום. תכיר אותו.)'}`,
    `## התוכנית הנוכחית (JSON)\n${JSON.stringify(p ?? null)}`,
    `## ימים אחרונים (28 יום)\n${(checks.data ?? []).map((c) => JSON.stringify(c)).join('\n') || '(אין)'}`,
    `## סטים שנרשמו (45 יום, משקל×חזרות)\n${setLines.join('\n') || '(אין)'}`,
    `## מדדים אחרונים\n${(metrics.data ?? []).map((m) => `${m.day} ${m.kind}=${m.value}`).join('\n') || '(אין)'}`,
  ].join('\n\n');
}

async function complete(messages: Msg[], model: string, effort: boolean) {
  const body: Record<string, unknown> = { model, messages, tools: TOOLS, max_completion_tokens: 3000 };
  if (effort) body.reasoning_effort = 'low';
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

async function chat(messages: Msg[]) {
  let model = MODEL, effort = true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await complete(messages, model, effort);
    if (res.ok) return res.j.choices[0].message as Msg;
    const msg: string = res.j?.error?.message ?? `HTTP ${res.status}`;
    if (effort && /reasoning/i.test(msg)) { effort = false; continue; }
    if (model !== FALLBACK && (res.status === 404 || /model/i.test(msg))) { model = FALLBACK; continue; }
    throw new Error(msg);
  }
  throw new Error('the model did not answer');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  const user = await caller(req, db);
  if (!user) return json({ error: 'צריך להתחבר' }, 401);
  if (!(await isOwner(db, user))) return json({ error: 'המאמן פתוח רק לבעל החשבון' }, 403);
  if (!KEY) return json({ error: 'חסר OPENAI_API_KEY בשרת' }, 500);

  const { message } = await req.json().catch(() => ({ message: '' }));
  const text = String(message ?? '').trim().slice(0, 4000);
  if (!text) return json({ error: 'הודעה ריקה' }, 400);

  const uid = user.id;
  const { data: hist } = await db.from('messages').select('role,content').eq('user_id', uid)
    .order('created_at', { ascending: false }).limit(30);
  await db.from('messages').insert({ user_id: uid, role: 'user', content: text });

  const messages: Msg[] = [
    { role: 'system', content: SYSTEM + '\n\n' + (await context(db, uid)) },
    ...(hist ?? []).reverse().map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: text },
  ];

  const changed = new Set<string>();
  try {
    for (let round = 0; round < 6; round++) {
      const reply = await chat(messages);
      if (!reply.tool_calls?.length) {
        const content = (reply.content ?? '').trim() || 'בוצע.';
        await db.from('messages').insert({ user_id: uid, role: 'assistant', content });
        return json({ reply: content, changed: [...changed] });
      }
      messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls });
      for (const call of reply.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* bad args */ }
        const result = await runTool(db, uid, call.function.name, args, changed);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return json({ error: 'המאמן נתקע בלולאה. נסה לנסח שוב.', changed: [...changed] }, 500);
  } catch (e) {
    console.error(e);
    return json({ error: `המודל לא ענה: ${(e as Error).message}`, changed: [...changed] }, 502);
  }
});
