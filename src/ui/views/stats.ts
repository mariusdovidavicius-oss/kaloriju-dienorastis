// „Statistika“: vidurkiai, balanso grafikas, daugiausiai kalorijų davę produktai, Claude pastebėjimai.
import { t } from '../../i18n';
import { baseline, bmr, calibrate, dayLimit, dayStat, KCAL_PER_KG_FAT } from '../../lib/calc';
import { parseD, periodDays, today } from '../../lib/dates';
import { esc, fmtStamp, fmtTime, fmtWeekday, nf, nf1 } from '../../lib/format';
import { toast } from '../dom';
import { aiErr, type AppState } from '../state';
import { openWeight, weightChartHtml } from './weight';

let insightBusy = false;

export function renderStats(s: AppState, root: HTMLElement) {
  const n = s.statsN, td = today(), g = s.settings;
  const all = periodDays(n).map((d) => dayStat(d, s.days[d], g));
  const done = all.filter((x) => x.logged && x.d !== td);
  let h = '<header class="top"><div class="daytitle"><h1>' + esc(t('navStats')) + '</h1>'
    + '<div class="seg small" role="group">' + [7, 30].map((k) => '<button type="button" data-n="' + k + '" aria-pressed="' + (n === k) + '">' + esc(t(k === 7 ? 'days7' : 'days30')) + '</button>').join('') + '</div></div></header>';

  h += weightChartHtml(s, n);
  h += calibHtml(s);

  // šiandienos balansas
  const tt = s.totals(td), out = baseline(g) + tt.burned, net = tt.kcal - out;
  h += '<section class="card"><h2>' + esc(t('todayBalance')) + '</h2><div class="tiles num">'
    + tile(t('eaten'), nf(tt.kcal) + ' kcal') + tile(t('burned'), nf(out) + ' kcal')
    + tile(net <= 0 ? t('deficit') : t('surplus'), nf(Math.abs(net)) + ' kcal', net <= 0 ? 'def' : 'sur')
    + '</div><p class="hint">' + esc(t('balanceHint', { base: nf(baseline(g)), bmr: nf(bmr(g)), extra: tt.burned ? t('balanceHintExtra', { n: nf(tt.burned) }) : '' })) + '</p></section>';

  h += '<section class="card"><div class="tiles num">';
  if (!done.length) h += '<div class="tile wide"><span>' + esc(t('statsEmpty')) + '</span></div>';
  else {
    const avg = (f: (x: typeof done[number]) => number) => done.reduce((a, x) => a + f(x), 0) / done.length;
    const kg = -done.reduce((a, x) => a + x.bal, 0) / KCAL_PER_KG_FAT, avgBal = avg((x) => x.bal);
    const inGoal = done.filter((x) => x.kcal <= dayLimit(g, x.burned)).length;
    const stepDays = all.filter((x) => x.steps > 0), wk = all.reduce((a, x) => a + x.workouts, 0);
    h += tile(t('avgEaten'), nf(avg((x) => x.kcal)) + ' kcal') + tile(t('avgBurned'), nf(avg((x) => x.out)) + ' kcal')
      + tile(t(avgBal <= 0 ? 'avgDeficit' : 'avgSurplus'), nf(Math.abs(avgBal)) + ' kcal', avgBal <= 0 ? 'def' : 'sur', t('perDay'))
      + tile(t(kg >= 0 ? 'fatLost' : 'fatGained'), nf1(Math.abs(kg)) + ' kg', kg >= 0 ? 'def' : 'sur', t('fatHint'))
      + tile(t('avgProtein'), nf(avg((x) => x.protein)) + ' g', avg((x) => x.protein) >= g.protein * 0.9 ? 'def' : '', t('goalN', { n: nf(g.protein) }))
      + tile(t('inGoal'), t('nOfM', { n: inGoal, m: done.length }))
      + tile(t('workouts'), String(wk), '', wk ? t('perNDays', { n }) : '')
      + tile(t('avgSteps'), stepDays.length ? nf(stepDays.reduce((a, x) => a + x.steps, 0) / stepDays.length) : '–', '', stepDays.length ? t('daysWithEntry', { n: stepDays.length }) : '');
  }
  h += '</div>';

  // balanso grafikas
  const W = 336, mid = 68, half = 48, slot = W / n, bw = Math.max(4, slot * 0.62);
  const maxAbs = Math.max(500, ...all.filter((x) => x.logged).map((x) => Math.abs(x.bal)));
  let sv = '<line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '" stroke="var(--line)"/>'
    + '<text x="2" y="12" font-size="9.5" fill="var(--muted)">' + esc(t('chartSurplus')) + '</text><text x="2" y="' + (mid + half + 12) + '" font-size="9.5" fill="var(--muted)">' + esc(t('chartDeficit')) + '</text>';
  all.forEach((x, i) => {
    const cx = slot * i + slot / 2;
    sv += '<g class="barhit" data-day="' + x.d + '"><rect x="' + (slot * i) + '" y="0" width="' + slot + '" height="150" fill="transparent"/>';
    if (x.logged) {
      const hh = Math.max(2, Math.abs(x.bal) / maxAbs * half), y = x.bal > 0 ? mid - hh : mid;
      sv += '<rect x="' + (cx - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + hh + '" rx="' + Math.min(4, bw / 3) + '" fill="' + (x.bal > 0 ? 'var(--over)' : 'var(--ok)') + '" opacity="' + (x.d === td ? 0.45 : 0.85) + '"/>';
      if (n <= 7) sv += '<text x="' + cx + '" y="' + (x.bal > 0 ? y - 4 : y + hh + 11) + '" text-anchor="middle" font-size="9.5" fill="var(--muted)">' + (x.bal > 0 ? '+' : '−') + nf(Math.abs(x.bal)) + '</text>';
    }
    const lab = n <= 7 ? fmtWeekday(parseD(x.d)) : ((i % 5 === 4 || i === n - 1) ? String(parseD(x.d).getDate()) : '');
    if (lab) sv += '<text x="' + cx + '" y="146" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + esc(lab) + '</text>';
    sv += '</g>';
  });
  h += '<svg class="chart" viewBox="0 0 336 150" role="img" aria-label="' + esc(t('chartHint')) + '">' + sv + '</svg><p class="hint">' + esc(t('chartHint')) + '</p>';

  // daugiausiai kalorijų
  const agg: Record<string, { name: string; kcal: number; c: number }> = {};
  for (const x of all) for (const it of s.day(x.d).items) { const k = it.name.toLowerCase(); (agg[k] ||= { name: it.name, kcal: 0, c: 0 }); agg[k].kcal += +it.kcal || 0; agg[k].c++; }
  const top = Object.values(agg).sort((a, b) => b.kcal - a.kcal).slice(0, 5);
  if (top.length) h += '<h3>' + esc(t('topFoods')) + '</h3><ul class="topf num">' + top.map((f) => '<li><span>' + esc(f.name) + '</span><span>' + f.c + '× · ' + nf(f.kcal) + ' kcal</span></li>').join('') + '</ul>';
  h += '</section>';

  // pastebėjimai
  const ins = s.insight;
  h += '<section class="card"><h2>' + esc(t('insights')) + '</h2>'
    + '<div class="insight" id="insightTxt">' + esc(insightBusy ? t('insightReading') : ins ? ins.text : '') + '</div>'
    + (!insightBusy && ins ? '<p class="hint">' + esc(t('insightMeta', { at: fmtStamp(ins.at), n: ins.n || 7 })) + '</p>' : '')
    + '<button type="button" class="btn main" id="insightBtn"' + (insightBusy ? ' disabled' : '') + '>' + esc(insightBusy ? t('thinking') : ins ? t('updateInsights') : t('getInsights')) + '</button>'
    + '<p class="hint">' + esc(t('insightHint')) + '</p></section>';
  root.innerHTML = h;
}

/** Tikrasis sudeginimas pagal svorio pokytį ir suvalgytas kalorijas. */
function calibHtml(s: AppState) {
  const c = calibrate(s.days, s.weights, s.settings, today());
  let h = '<section class="card calib"><h2>' + esc(t('calibTitle')) + '</h2>';
  if (!c.ok) {
    return h + '<p class="hint">' + esc(t('calibNeed')) + '</p><p class="hint num">' + esc(t('calibProgress', { d: c.loggedDays, w: c.weighIns, s: c.span })) + '</p></section>';
  }
  h += '<div class="tiles num">' + tile(t('calibTdee'), nf(c.tdee) + ' kcal') + tile(t('calibFormula'), nf(c.formula) + ' kcal')
    + tile(t('calibIntake'), nf(c.intake) + ' kcal') + tile(t('calibRate'), (c.perWeek > 0 ? '+' : '') + nf1(c.perWeek) + ' kg', c.perWeek <= 0 ? 'def' : 'sur') + '</div>';
  if (Math.abs(c.suggested - c.current) < 100) h += '<p class="status ok">' + esc(t('calibFine')) + '</p>';
  else h += '<p class="num">' + esc(t('calibSuggest', { n: nf(c.suggested), cur: nf(c.current) })) + '</p><button type="button" class="btn main" data-calib="' + c.suggested + '">' + esc(t('calibApply', { n: nf(c.suggested) })) + '</button>';
  if (c.clamped) h += '<p class="hint">' + esc(t('obMinWarn', { n: nf(c.suggested) })) + '</p>';
  return h + '<p class="hint">' + esc(t('calibHint', { d: c.days })) + '</p></section>';
}

function tile(label: string, val: string, cls = '', sub = '') {
  return '<div class="tile"><span>' + esc(label) + '</span><b class="' + cls + '">' + esc(val) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
}

function insightLines(s: AppState, n: number): string {
  const td = today(), g = s.settings;
  return periodDays(n).map((d) => dayStat(d, s.days[d], g)).filter((x) => x.logged || x.steps || x.workouts).map((x) => {
    const foods = s.day(x.d).items.slice().sort((a, b) => a.t - b.t).slice(0, 30)
      .map((it) => (it.t ? fmtTime(it.t) + ' ' : '') + it.name + (it.amount ? ' (' + it.amount + ')' : '') + ' ' + Math.round(+it.kcal || 0) + ' kcal/' + Math.round(+it.protein || 0) + ' g b.').join('; ');
    return x.d + ' ' + fmtWeekday(parseD(x.d)) + (x.d === td ? ' (šiandien, diena nebaigta)' : '')
      + ' | suvalgyta ' + x.kcal + ' kcal, baltymai ' + Math.round(x.protein) + ' g | sportas ' + s.day(x.d).ex.map((e) => e.amount || '').join(', ') + ' (' + x.burned + ' kcal su žingsniais) | žingsniai ' + x.steps
      + ' | balansas ' + (x.bal > 0 ? '+' : '') + x.bal + ' kcal | maistas: ' + (foods || '–');
  }).join('\n');
}

export function bindStats(s: AppState, root: HTMLElement) {
  root.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    const nb = el.closest<HTMLElement>('[data-n]'); if (nb) { s.statsN = +nb.dataset.n!; s.changed(); return; }
    if (el.closest('[data-weight]')) { openWeight(s, today()); return; }
    const cb = el.closest<HTMLElement>('[data-calib]');
    if (cb) { const k = +cb.dataset.calib!; s.saveSettings({ ...s.settings, kcal: k }); toast(t('calibApplied', { n: nf(k) })); return; }
    const d = (e.target as Element).closest('[data-day]'); if (d) { s.tab = 'today'; s.goDay(d.getAttribute('data-day')!); return; }
    if (el.id === 'insightBtn' && !insightBusy) {
      const n = s.statsN, lines = insightLines(s, n);
      if (!lines) { toast(t('insightNeedData')); return; }
      insightBusy = true; s.changed();
      try {
        const text = await s.ai.insight(n, lines);
        insightBusy = false;
        s.setInsight({ text: text.trim(), at: Date.now(), n });
      } catch (err) {
        insightBusy = false; s.changed(); toast(aiErr(err));
      }
    }
  });
}
