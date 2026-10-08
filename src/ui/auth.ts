// Prisijungimo langas: be registracijos (anoniminė paskyra), prisijungimas, registracija,
// slaptažodžio atkūrimas ir anoniminės paskyros „išsaugojimas“ (el. pašto prisiejimas).
import type { SupabaseClient } from '@supabase/supabase-js';
import { LANGS, lang, setLang, t, type Key, type Lang } from '../i18n';
import { esc } from '../lib/format';
import { $, inp } from './dom';

/** Žymė, kad po el. pašto patvirtinimo reikia paprašyti nusistatyti slaptažodį. */
export const NEEDS_PASSWORD = 'kd-needs-password';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'upgrade';

const TEXT: Record<AuthMode, { btn: Key; switch: Key | null; intro: Key }> = {
  login: { btn: 'login', switch: 'toSignup', intro: 'authTagline' },
  signup: { btn: 'signup', switch: 'toLogin', intro: 'signupIntro' },
  forgot: { btn: 'sendLink', switch: 'backToLogin', intro: 'forgotIntro' },
  reset: { btn: 'savePassword', switch: null, intro: 'resetIntro' },
  upgrade: { btn: 'saveAccount', switch: null, intro: 'upgradeIntro' },
};

function authErr(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return t('authErrLogin');
  if (m.includes('email not confirmed')) return t('authErrConfirm');
  if (m.includes('already registered') || m.includes('already been registered')) return t('authErrExists');
  if (m.includes('anonymous sign-ins are disabled')) return t('authErrAnonOff');
  if (m.includes('password')) return t('authErrWeak');
  if (m.includes('rate limit') || m.includes('too many')) return t('authErrRate');
  return t('authErr', { msg });
}

export interface AuthOptions {
  /** Grįžti į programą (tik „upgrade“ režime). */
  onBack?: () => void;
}

export function showAuth(db: SupabaseClient, initial: AuthMode = 'login', opts: AuthOptions = {}) {
  let mode: AuthMode = initial;
  const root = $('#authView');

  function paint() {
    const tx = TEXT[mode];
    const anon = mode === 'login' || mode === 'signup', noPass = mode === 'forgot' || mode === 'upgrade', noEmail = mode === 'reset';
    root.innerHTML = '<div class="auth-top"><h1>' + esc(t('appName')) + '</h1>'
      + '<div class="seg small" role="group" aria-label="' + esc(t('language')) + '">' + LANGS.map((l) => '<button type="button" data-lang="' + l.code + '" aria-pressed="' + (lang() === l.code) + '">' + l.code.toUpperCase() + '</button>').join('') + '</div></div>'
      + '<p class="lead">' + esc(t(tx.intro)) + '</p>'
      + (anon ? '<div class="card authcard"><button class="btn main big" type="button" id="anonBtn">' + esc(t('authAnon')) + '</button><p class="hint center">' + esc(t('authAnonHint')) + '</p><div class="status" id="anonMsg" role="status"></div></div><p class="lead">' + esc(t('authOr')) + '</p>' : '')
      + '<form class="card authcard" id="authForm" autocomplete="on">'
      + (noEmail ? '' : '<label>' + esc(t('email')) + '<input type="email" id="authEmail" autocomplete="email" required></label>')
      + (noPass ? '' : '<label>' + esc(t('password')) + '<input type="password" id="authPass" minlength="8" required autocomplete="' + (mode === 'login' ? 'current-password' : 'new-password') + '"></label>')
      + '<button class="btn main big" type="submit" id="authBtn">' + esc(t(tx.btn)) + '</button>'
      + '<div class="status" id="authMsg" role="status"></div>'
      + (tx.switch ? '<button type="button" class="linkbtn" id="authSwitch">' + esc(t(tx.switch)) + '</button>' : '')
      + (mode === 'login' ? '<button type="button" class="linkbtn" id="authForgot">' + esc(t('forgot')) + '</button>' : '')
      + (opts.onBack ? '<button type="button" class="linkbtn" id="authBack">' + esc(t('backToApp')) + '</button>' : '')
      + '</form>';
  }
  const msg = (text: string, kind: '' | 'err' | 'ok' = '') => { const el = $('#authMsg'); el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); };

  root.onclick = async (e) => {
    const el = e.target as HTMLElement;
    const lb = el.closest<HTMLElement>('[data-lang]'); if (lb) { setLang(lb.dataset.lang as Lang); paint(); return; }
    if (el.id === 'authSwitch') { mode = mode === 'login' ? 'signup' : 'login'; paint(); return; }
    if (el.id === 'authForgot') { mode = 'forgot'; paint(); return; }
    if (el.id === 'authBack') { opts.onBack?.(); return; }
    if (el.id === 'anonBtn') {
      const btn = el as HTMLButtonElement, m = $('#anonMsg');
      btn.disabled = true; m.textContent = t('wait'); m.className = 'status';
      const { error } = await db.auth.signInAnonymously();
      btn.disabled = false;
      if (error) { m.textContent = authErr(error.message); m.className = 'status err'; } else m.textContent = '';
    }
  };

  root.onsubmit = async (e) => {
    e.preventDefault();
    const email = root.querySelector<HTMLInputElement>('#authEmail')?.value.trim() || '';
    const password = root.querySelector<HTMLInputElement>('#authPass')?.value || '';
    const btn = $<HTMLButtonElement>('#authBtn');
    btn.disabled = true; msg(t('wait'));
    try {
      if (mode === 'login') {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        msg('');
      } else if (mode === 'signup') {
        const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) msg(t('authSignupSent'), 'ok');
      } else if (mode === 'forgot') {
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        msg(t('authResetSent'), 'ok');
      } else if (mode === 'upgrade') {
        // Anoniminei paskyrai prisiejamas el. paštas – vartotojo id ir duomenys nesikeičia.
        // Supabase reikalauja pirma patvirtinti el. paštą, tik tada galima nustatyti slaptažodį.
        const { error } = await db.auth.updateUser({ email }, { emailRedirectTo: location.origin });
        if (error) throw error;
        try { localStorage.setItem(NEEDS_PASSWORD, '1'); } catch { /* nesvarbu */ }
        msg(t('authUpgradeSent'), 'ok');
      } else {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        try { localStorage.removeItem(NEEDS_PASSWORD); } catch { /* nesvarbu */ }
        msg(t('authPasswordSaved'), 'ok');
        location.reload();
      }
    } catch (err) {
      msg(authErr((err as Error).message || String(err)), 'err');
    } finally {
      btn.disabled = false;
    }
  };

  paint();
  $('#bootView').hidden = true;
  $('#appView').hidden = true;
  $('#onboardView').hidden = true;
  root.hidden = false;
  if (mode !== 'login' && mode !== 'signup') inp('#authEmail, #authPass', root).focus?.();
}
