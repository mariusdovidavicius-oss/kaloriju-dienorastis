// Programos karkasas: apatinė navigacija, ekranų perjungimas, vedlys.
import type { AiClient } from '../ai/client';
import type { Store } from '../data/store';
import { onLangChange, setLang, t } from '../i18n';
import { today } from '../lib/dates';
import { esc } from '../lib/format';
import type { Settings } from '../types';
import { $ } from './dom';
import { closeSheet } from './sheet';
import { AppState, type Tab } from './state';
import { openAdd } from './views/add';
import { runOnboarding } from './views/onboarding';
import { bindProfile, renderProfile } from './views/profile';
import { bindStats, renderStats } from './views/stats';
import { bindToday, renderToday } from './views/today';

export interface AppContext {
  store: Store;
  ai: AiClient;
  mock: boolean;
  /** Naudojasi be registracijos (anoniminė paskyra). */
  anonymous: boolean;
  onLogout: () => void;
  onSaveAccount: () => void;
}

const ICONS: Record<string, string> = {
  today: '<path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
};

export async function startApp(ctx: AppContext) {
  const s = new AppState(ctx.store, ctx.ai);
  await s.load();
  if (s.settings.onboarded) setLang(s.settings.lang);
  const app = $('#appView');
  Object.assign(window, { __state: s }); // testams ir derinimui

  function shell() {
    app.innerHTML = (ctx.mock ? '<div class="mockbar">' + esc(t('mockBar')) + '</div>' : '')
      + '<main class="view" id="viewToday"></main><main class="view" id="viewStats" hidden></main><main class="view" id="viewProfile" hidden></main>'
      + '<nav class="tabbar" aria-label="Navigacija">'
      + (['today', 'add', 'stats', 'profile'] as const).map((k) => '<button type="button" data-nav="' + k + '" class="' + (k === 'add' ? 'nav-add' : '') + '"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + '</svg><span>' + esc(t(k === 'today' ? 'navToday' : k === 'add' ? 'navAdd' : k === 'stats' ? 'navStats' : 'navProfile')) + '</span></button>').join('')
      + '</nav>';
    bindToday(s, $('#viewToday'));
    bindStats(s, $('#viewStats'));
    bindProfile(s, $('#viewProfile'), ctx);
  }

  function render() {
    const views: Record<Tab, string> = { today: '#viewToday', stats: '#viewStats', profile: '#viewProfile' };
    for (const [k, sel] of Object.entries(views)) $(sel).hidden = k !== s.tab;
    app.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => { if (b.dataset.nav === s.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (s.tab === 'today') renderToday(s, $('#viewToday'));
    else if (s.tab === 'stats') renderStats(s, $('#viewStats'));
    else renderProfile(s, $('#viewProfile'), ctx);
  }

  let lastTab: Tab = s.tab;
  s.subscribe(() => {
    // Profilio formos neperpiešiam, kol vartotojas jose rašo (kitaip dingtų įvesti skaičiai).
    if (s.tab === 'profile' && lastTab === 'profile' && $('#viewProfile').contains(document.activeElement) && document.activeElement?.tagName !== 'BUTTON') return;
    if (s.tab !== lastTab) window.scrollTo(0, 0);
    lastTab = s.tab;
    render();
  });

  app.addEventListener('click', (e) => {
    const nav = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
    if (!nav) return;
    const k = nav.dataset.nav!;
    if (k === 'add') { openAdd(s, { meal: s.defaultMeal(), tab: 'food' }); return; }
    if (k === 'today' && s.tab === 'today' && s.view !== today()) { s.goDay(today()); return; }
    s.tab = k as Tab; s.changed();
  });

  onLangChange(() => { closeSheet(); shell(); render(); });

  // Grįžus į programą: perjungiam „šiandien“, jei praėjo vidurnaktis, ir atnaujinam duomenis.
  let lastToday = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const td = today();
    if (td !== lastToday) { if (s.view === lastToday) s.view = td; lastToday = td; }
    void s.afterSaves().then(() => s.reload());
  });

  const showApp = () => { $('#onboardView').hidden = true; $('#bootView').hidden = true; app.hidden = false; };
  shell();
  if (!s.settings.onboarded) {
    $('#bootView').hidden = true; app.hidden = true;
    const ob = $('#onboardView'); ob.hidden = false;
    runOnboarding(ob, s.settings, (ns: Settings) => { s.saveSettings(ns); showApp(); render(); window.scrollTo(0, 0); });
  } else {
    showApp(); render();
  }
}
