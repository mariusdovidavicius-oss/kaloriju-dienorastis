// Priminimai telefone (Web Push). Paleidžiama kas 30 min. per pg_cron (žr. migraciją *_push_reminders.sql).
// Sprendžia, kam ir ką priminti: vanduo (kas ~2 val., jei atsilieki nuo plano) ir valgiai (13 ir 20 val.).
// Slaptos reikšmės (VAPID privatus raktas, cron slaptažodis) laikomos Supabase Vault, ne kode.
import postgres from 'npm:postgres@3.4.5';
import webpush from 'npm:web-push@3.6.7';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 2, prepare: false });

const TEXT = {
  lt: {
    waterTitle: 'Laikas atsigerti vandens 💧',
    waterBody: (ml: number, goal: number) => `Šiandien išgerta ${l(ml, 'lt')} l iš ${l(goal, 'lt')} l.`,
    lunchTitle: 'Neužmiršk įrašyti valgių',
    lunchBody: 'Šiandien dar nieko neįrašei. Pusryčiai, pietūs?',
    dinnerTitle: 'Ar jau vakarieniavai?',
    dinnerBody: 'Įrašyk vakarienę, kad dienos suvestinė būtų tiksli.',
  },
  en: {
    waterTitle: 'Time for some water 💧',
    waterBody: (ml: number, goal: number) => `Today: ${l(ml, 'en')} L of ${l(goal, 'en')} L.`,
    lunchTitle: 'Don’t forget to log your meals',
    lunchBody: 'Nothing logged yet today. Breakfast, lunch?',
    dinnerTitle: 'Had dinner yet?',
    dinnerBody: 'Log your dinner so the day’s summary is accurate.',
  },
};
function l(ml: number, lang: 'lt' | 'en') { return new Intl.NumberFormat(lang === 'lt' ? 'lt-LT' : 'en-GB', { maximumFractionDigits: 2 }).format(ml / 1000); }

/** Vietos data ir valanda vartotojo laiko juostoje. */
function local(tz: string, now: Date): { date: string; hour: number } {
  let p: Intl.DateTimeFormatPart[];
  try { p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); }
  catch { return local('Europe/Vilnius', now); }
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: +g('hour') + +g('minute') / 60 };
}

/** Tas pats skaičiavimas kaip programoje (src/lib/calc.ts: waterGoal, waterExpected). */
const r250 = (x: number) => Math.round(x / 250) * 250;
function waterGoal(goal: number | null, weight: number, sportMin: number) {
  const base = goal ?? Math.min(3500, Math.max(1500, r250(weight * 30)));
  return base + r250(sportMin / 60 * 500);
}
function expected(goal: number, hour: number, from: number, to: number) {
  return to <= from ? 0 : Math.round(goal * Math.min(1, Math.max(0, (hour - from) / (to - from))) / 50) * 50;
}

type Row = {
  user_id: string; lang: 'lt' | 'en'; tz: string; remind_water: boolean; remind_meals: boolean; remind_from: number; remind_to: number;
  water_goal_ml: number | null; weight_kg: string; endpoint: string; p256dh: string; auth: string;
};

Deno.serve(async (req) => {
  const [{ v: secret } = { v: null }] = await sql`select decrypted_secret as v from vault.decrypted_secrets where name = 'remind_cron_secret'`;
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 });
  const [{ v: priv } = { v: null }] = await sql`select decrypted_secret as v from vault.decrypted_secrets where name = 'vapid_private_key'`;
  const [{ v: pub } = { v: null }] = await sql`select decrypted_secret as v from vault.decrypted_secrets where name = 'vapid_public_key'`;
  if (!priv || !pub) return Response.json({ error: 'vapid_missing' }, { status: 500 });
  webpush.setVapidDetails('https://github.com/mariusdovidavicius-oss/kaloriju-dienorastis', pub, priv);

  const body = await req.json().catch(() => ({}));
  const now = body?.now ? new Date(body.now) : new Date(); // testams galima perduoti laiką
  const dry = !!body?.dry;
  const rows = await sql<Row[]>`
    select p.id as user_id, p.lang, p.tz, p.remind_water, p.remind_meals, p.remind_from, p.remind_to, p.water_goal_ml, p.weight_kg,
           s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s join public.profiles p on p.id = s.user_id
    where p.remind_water or p.remind_meals`;

  // vienam vartotojui sprendžiam vieną kartą, siunčiam į visus jo įrenginius
  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const result = { users: byUser.size, sent: 0, removed: 0, decisions: [] as { user: string; kind: string }[] };
  for (const [uid, subs] of byUser) {
    const u = subs[0], { date, hour } = local(u.tz, now);
    if (hour < u.remind_from || hour >= u.remind_to) continue;
    const [day] = await sql`
      select coalesce((select ml from public.daily_water where user_id = ${uid} and day = ${date}), 0) as ml,
             coalesce((select sum(minutes) from public.workouts where user_id = ${uid} and day = ${date}), 0) as sport,
             (select count(*) from public.food_entries where user_id = ${uid} and day = ${date}) as entries,
             (select count(*) from public.food_entries where user_id = ${uid} and day = ${date} and meal = 'vakariene') as dinner`;
    const log = await sql`select kind, sent_at from private.reminder_log where user_id = ${uid} and day = ${date}`;
    const last = (k: string) => log.find((x) => x.kind === k)?.sent_at as Date | undefined;
    const t = TEXT[u.lang === 'en' ? 'en' : 'lt'];
    let msg: { kind: string; title: string; body: string } | null = null;

    if (u.remind_meals && hour >= 13 && hour < 15 && Number(day.entries) === 0 && !last('lunch')) msg = { kind: 'lunch', title: t.lunchTitle, body: t.lunchBody };
    else if (u.remind_meals && hour >= 20 && hour < 22 && Number(day.dinner) === 0 && !last('dinner')) msg = { kind: 'dinner', title: t.dinnerTitle, body: t.dinnerBody };
    else if (u.remind_water && hour >= u.remind_from + 1) {
      const goal = waterGoal(u.water_goal_ml, Number(u.weight_kg), Number(day.sport));
      const ml = Number(day.ml), exp = expected(goal, hour, u.remind_from, u.remind_to), prev = last('water');
      if (exp - ml >= 250 && (!prev || now.getTime() - prev.getTime() >= 115 * 60e3)) msg = { kind: 'water', title: t.waterTitle, body: t.waterBody(ml, goal) };
    }
    if (!msg) continue;
    result.decisions.push({ user: uid.slice(0, 8), kind: msg.kind });
    if (dry) continue;

    let delivered = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: msg.title, body: msg.body, tag: 'kd-' + msg.kind, url: '/' }), { TTL: 3600, urgency: 'normal' });
        delivered = true; result.sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { await sql`delete from public.push_subscriptions where endpoint = ${s.endpoint}`; result.removed++; }
        else console.error('push', code, (e as Error).message);
      }
    }
    if (delivered) await sql`
      insert into private.reminder_log (user_id, kind, day, sent_at) values (${uid}, ${msg.kind}, ${date}, ${now})
      on conflict (user_id, kind, day) do update set sent_at = excluded.sent_at`;
  }
  return Response.json(result);
});
