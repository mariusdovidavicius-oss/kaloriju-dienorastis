// Pirmo paleidimo vedlys: 4 žingsniai → pasiūlytas kalorijų ir baltymų tikslas.
import { LANGS, lang, setLang, t, type Lang } from '../../i18n';
import { suggestGoal } from '../../lib/calc';
import { esc, nf } from '../../lib/format';
import type { Activity, Settings } from '../../types';
import { inp } from '../dom';

const STEPS = 4;

export function runOnboarding(root: HTMLElement, initial: Settings, onDone: (s: Settings) => void) {
  const st: Settings = { ...initial };
  let step = 0, warn = '';

  function render() {
    const radio = (name: string, opts: [string, string][], cur: string) => '<div class="choices" role="radiogroup">'
      + opts.map(([v, label]) => '<label class="choice"><input type="radio" name="' + name + '" value="' + v + '"' + (String(cur) === v ? ' checked' : '') + '><span>' + esc(label) + '</span></label>').join('') + '</div>';
    const num = (id: string, label: string, val: number, min: number, max: number, step = 1) =>
      '<label>' + esc(label) + '<input type="number" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" inputmode="decimal" required value="' + val + '"></label>';
    let body = '';
    if (step === 0) {
      body = '<h1>' + esc(t('obWelcome')) + '</h1><p class="lead">' + esc(t('obIntro')) + '</p>'
        + '<div class="seg" role="group" aria-label="' + esc(t('language')) + '">' + LANGS.map((l) => '<button type="button" data-lang="' + l.code + '" aria-pressed="' + (lang() === l.code) + '">' + esc(l.label) + '</button>').join('') + '</div>'
        + '<h2>' + esc(t('obAboutYou')) + '</h2>' + radio('sex', [['m', t('male')], ['f', t('female')]], st.sex)
        + '<div class="grid2">' + num('obAge', t('age'), st.age, 14, 100) + '</div>';
    } else if (step === 1) {
      body = '<h2>' + esc(t('obBody')) + '</h2><div class="grid2">' + num('obHeight', t('heightCm'), st.height, 120, 230) + num('obWeight', t('weightKg'), st.weight, 30, 300, 0.1) + '</div>';
    } else if (step === 2) {
      body = '<h2>' + esc(t('obGoal')) + '</h2><p class="lead">' + esc(t('obActivity')) + '</p>'
        + radio('act', [['low', t('actLow')], ['light', t('actLight')], ['mid', t('actMid')]], st.activity)
        + '<p class="lead">' + esc(t('obPace')) + '</p>'
        + radio('pace', [['0', t('paceKeep')], ['0.25', t('paceSlow')], ['0.5', t('paceMid')], ['0.75', t('paceFast')]], String(st.pace));
    } else {
      body = '<h2>' + esc(t('obResult')) + '</h2><div class="grid2">' + num('obKcal', t('kcalGoal'), st.kcal, 800, 6000, 50) + num('obProt', t('proteinGoal'), st.protein, 20, 400, 5) + '</div>'
        + (warn ? '<p class="warn">' + esc(warn) + '</p>' : '') + '<p class="hint">' + esc(t('obResultHint')) + '</p>';
    }
    root.innerHTML = '<form class="onboard" id="obForm" autocomplete="off" novalidate><div class="ob-progress"><span class="num">' + esc(t('obStep', { n: step + 1, m: STEPS })) + '</span><div class="bar"><i style="width:' + ((step + 1) / STEPS * 100) + '%"></i></div></div>'
      + body + '<p class="status err" id="obErr" role="status"></p>'
      + '<div class="ob-nav">' + (step > 0 ? '<button type="button" class="btn" data-back>' + esc(t('obBack')) + '</button>' : '<span></span>')
      + '<button type="submit" class="btn main">' + esc(step === STEPS - 1 ? t('obStart') : t('obNext')) + '</button></div></form>';
  }

  const val = (id: string) => parseFloat(inp('#' + id, root).value.replace(',', '.'));
  const bad = () => { root.querySelector('#obErr')!.textContent = t('obInvalid'); };

  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const lb = el.closest<HTMLElement>('[data-lang]');
    if (lb) { const a = val('obAge'); if (a) st.age = Math.round(a); st.lang = lb.dataset.lang as Lang; setLang(st.lang); render(); return; }
    if (el.closest('[data-back]')) { step = Math.max(0, step - 1); render(); }
  });
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'sex') st.sex = el.value === 'f' ? 'f' : 'm';
    if (el.name === 'act') st.activity = el.value as Activity;
    if (el.name === 'pace') st.pace = parseFloat(el.value) || 0;
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step === 0) { const a = Math.round(val('obAge')); if (!(a >= 14 && a <= 100)) return bad(); st.age = a; }
    if (step === 1) {
      const h = Math.round(val('obHeight')), w = Math.round(val('obWeight') * 10) / 10;
      if (!(h >= 120 && h <= 230) || !(w >= 30 && w <= 300)) return bad();
      st.height = h; st.weight = w;
    }
    if (step === 2) { const r = suggestGoal(st); st.kcal = r.kcal; st.protein = r.protein; warn = r.clamped ? t('obMinWarn', { n: nf(r.min) }) : ''; }
    if (step === 3) {
      const k = Math.round(val('obKcal')), p = Math.round(val('obProt'));
      if (!(k >= 800 && k <= 6000) || !(p >= 20 && p <= 400)) return bad();
      st.kcal = k; st.protein = p;
      onDone({ ...st, lang: lang(), onboarded: true });
      return;
    }
    step++; render();
  });
  render();
}
