// Svoris: kortelė „Šiandien“ ekrane, įrašymo langas ir grafikas Statistikoje.
import { t } from '../../i18n';
import { weightTrend } from '../../lib/calc';
import { addDays, parseD, today } from '../../lib/dates';
import { esc, fmtShortDate, nf1 } from '../../lib/format';
import { inp, toast } from '../dom';
import { closeSheet, openSheet } from '../sheet';
import type { AppState } from '../state';

/** Kortelė pagrindiniame ekrane: dabartinis svoris, tikslas, kiek liko. */
export function weightCardHtml(s: AppState): string {
  const upTo = s.weights.filter((w) => w.date <= s.view);
  const last = upTo.at(-1), goal = s.settings.goalWeight;
  if (!last) {
    return '<section class="card weightcard"><div class="meal-head"><div><h2>' + esc(t('weight')) + '</h2><span>' + esc(t('weightFirst')) + '</span></div>'
      + '<button type="button" class="addbtn wt" data-weight aria-label="' + esc(t('weightLog')) + '">+</button></div></section>';
  }
  const trend = weightTrend(upTo).at(-1)!;
  const first = s.weights[0];
  let progress = '';
  if (goal) {
    const total = first.kg - goal, done = first.kg - trend.avg;
    const pct = total > 0 ? Math.max(0, Math.min(100, done / total * 100)) : 100;
    const left = trend.avg - goal;
    progress = '<div class="macro-row"><span>' + esc(t('weightGoalShort', { n: nf1(goal) })) + '</span><b class="num">' + esc(left > 0.05 ? t('weightToGo', { n: nf1(left) }) : t('weightReached')) + '</b></div>'
      + '<div class="bar wbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
  }
  return '<section class="card weightcard"><div class="meal-head"><div><h2>' + esc(t('weight')) + ' <span class="wnow num">' + nf1(last.kg) + ' kg</span></h2>'
    + '<span class="num">' + esc(t('weightAvg7', { n: nf1(trend.avg) })) + '</span></div>'
    + '<button type="button" class="addbtn wt" data-weight aria-label="' + esc(t('weightLog')) + '">+</button></div>' + progress + '</section>';
}

export function openWeight(s: AppState, date = s.view > today() ? today() : s.view) {
  const sh = openSheet(t('weightLog'));
  const existing = s.weights.find((w) => w.date === date);
  const val = existing?.kg ?? s.latestWeight()?.kg ?? s.settings.weight;
  sh.body.innerHTML = '<form class="grid2" id="wForm" autocomplete="off">'
    + '<label>' + esc(t('weightKg')) + '<input type="text" id="wKg" inputmode="decimal" autocomplete="off" required value="' + nf1(val) + '"></label>'
    + '<label>' + esc(t('weightDate')) + '<input type="date" id="wDate" max="' + today() + '" value="' + date + '"></label>'
    + '<button type="submit" class="btn main span2">' + esc(t('save')) + '</button>'
    + (existing ? '<button type="button" class="btn danger span2" data-delete>' + esc(t('delete')) + '</button>' : '') + '</form>';
  const f = sh.body.querySelector<HTMLFormElement>('#wForm')!;
  const kgIn = inp('#wKg', f); kgIn.select();
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const kg = Math.round(parseFloat(kgIn.value.replace(',', '.')) * 10) / 10, d = inp('#wDate', f).value || date;
    if (!(kg >= 30 && kg <= 300) || d > today()) { toast(t('obInvalid')); return; }
    closeSheet();
    s.setWeight(d, kg);
    toast(t('weightSaved', { n: nf1(kg) }));
  });
  f.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-delete]')) { closeSheet(); s.setWeight(date, null); } });
}

/** Svorio grafikas Statistikoje: paskutinės max(n, 30) dienos. */
export function weightChartHtml(s: AppState, n: number): string {
  const span = Math.max(n, 30), from = addDays(today(), -(span - 1));
  const all = weightTrend(s.weights).filter((w) => w.date >= from);
  if (all.length < 2) return '<section class="card"><h2>' + esc(t('weightChart')) + '</h2><p class="hint">' + esc(t('weightNoData')) + '</p>'
    + '<button type="button" class="btn" data-weight>' + esc(t('weightLog')) + '</button></section>';
  const goal = s.settings.goalWeight;
  const W = 336, H = 150, L = 34, R = 8, T = 10, B = 22;
  const vals = all.flatMap((w) => [w.kg, w.avg]).concat(goal ? [goal] : []);
  let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const t0 = Date.parse(from), t1 = Date.parse(today());
  const X = (d: string) => L + (Date.parse(d) - t0) / Math.max(1, t1 - t0) * (W - L - R);
  const Y = (kg: number) => T + (hi - kg) / (hi - lo) * (H - T - B);
  let sv = '';
  const step = Math.max(1, Math.round((hi - lo) / 4));
  for (let v = lo; v <= hi; v += step) sv += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)"/><text x="' + (L - 4) + '" y="' + (Y(v) + 3.5) + '" text-anchor="end" font-size="9.5" fill="var(--muted)">' + v + '</text>';
  if (goal && goal >= lo && goal <= hi) sv += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(goal) + '" y2="' + Y(goal) + '" stroke="var(--ok)" stroke-dasharray="4 4"/>';
  sv += '<polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" points="' + all.map((w) => X(w.date).toFixed(1) + ',' + Y(w.avg).toFixed(1)).join(' ') + '"/>';
  sv += all.map((w) => '<circle cx="' + X(w.date).toFixed(1) + '" cy="' + Y(w.kg).toFixed(1) + '" r="2.6" fill="var(--surface)" stroke="var(--muted)" stroke-width="1.2"/>').join('');
  for (const d of [from, addDays(from, Math.floor(span / 2)), today()]) sv += '<text x="' + X(d) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9.5" fill="var(--muted)">' + esc(fmtShortDate(parseD(d))) + '</text>';
  const change = all.at(-1)!.avg - all[0].avg, lost = s.weights[0].kg - all.at(-1)!.avg;
  return '<section class="card"><div class="res-head"><h2>' + esc(t('weightChart')) + '</h2><button type="button" class="chipbtn" data-weight>+ ' + esc(t('weightLog')) + '</button></div>'
    + '<div class="tiles num"><div class="tile"><span>' + esc(t('weightChange', { n: span })) + '</span><b class="' + (change <= 0 ? 'def' : 'sur') + '">' + (change > 0 ? '+' : '') + nf1(change) + ' kg</b></div>'
    + '<div class="tile"><span>' + esc(t('weightLost')) + '</span><b class="' + (lost >= 0 ? 'def' : 'sur') + '">' + nf1(lost) + ' kg</b></div></div>'
    + '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('weightChart')) + '">' + sv + '</svg><p class="hint">' + esc(t('weightChartHint')) + '</p></section>';
}
