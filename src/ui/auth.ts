// Prisijungimo langas: be registracijos (anoniminė paskyra), prisijungimas, registracija,
// slaptažodžio atkūrimas ir anoniminės paskyros „išsaugojimas“ (el. pašto prisiejimas).
import type { SupabaseClient } from '@supabase/supabase-js';
import { $, inp } from './dom';

/** Žymė, kad po el. pašto patvirtinimo reikia paprašyti nusistatyti slaptažodį. */
export const NEEDS_PASSWORD = 'kd-needs-password';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'upgrade';

const TEXT: Record<AuthMode, { btn: string; switch: string; intro: string }> = {
  login: { btn: 'Prisijungti', switch: 'Neturi paskyros? Registruokis', intro: 'Kalorijų ir baltymų dienoraštis lietuviškai.' },
  signup: { btn: 'Sukurti paskyrą', switch: 'Jau turi paskyrą? Prisijunk', intro: 'Sukurk paskyrą. Slaptažodis – bent 8 simboliai.' },
  forgot: { btn: 'Siųsti nuorodą', switch: 'Grįžti į prisijungimą', intro: 'Įvesk el. paštą – atsiųsime nuorodą naujam slaptažodžiui.' },
  reset: { btn: 'Išsaugoti naują slaptažodį', switch: 'Grįžti į prisijungimą', intro: 'Įvesk naują slaptažodį.' },
  upgrade: { btn: 'Išsaugoti paskyrą', switch: '', intro: 'Įvesk el. paštą. Atsiųsime patvirtinimo nuorodą, o paspaudęs ją nusistatysi slaptažodį. Visi įrašai liks.' },
};

function authErr(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Neteisingas el. paštas arba slaptažodis.';
  if (m.includes('email not confirmed')) return 'El. paštas dar nepatvirtintas. Paspausk nuorodą laiške.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Toks el. paštas jau užregistruotas. Prisijunk.';
  if (m.includes('anonymous sign-ins are disabled')) return 'Naudojimas be registracijos dar neįjungtas. Užsiregistruok el. paštu.';
  if (m.includes('password')) return 'Slaptažodis per silpnas: bent 8 simboliai.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Per daug bandymų. Palauk kelias minutes.';
  return 'Nepavyko: ' + msg;
}

export interface AuthOptions {
  /** Grįžti į programą (tik „upgrade“ režime). */
  onBack?: () => void;
}

export function showAuth(db: SupabaseClient, initial: AuthMode = 'login', opts: AuthOptions = {}) {
  let mode: AuthMode = initial;
  const msg = (t: string, kind: '' | 'err' | 'ok' = '') => { const el = $('#authMsg'); el.textContent = t; el.className = 'authmsg' + (kind ? ' ' + kind : ''); };

  function paint() {
    const t = TEXT[mode];
    $('#authBtn').textContent = t.btn;
    $('#authSwitch').textContent = t.switch;
    $('#authSwitch').hidden = !t.switch;
    $('#authIntro').textContent = t.intro;
    const noPass = mode === 'forgot' || mode === 'upgrade';
    $('#authPassLbl').hidden = noPass;
    inp('#authPass').required = !noPass;
    inp('#authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#authEmail').parentElement!.hidden = mode === 'reset';
    inp('#authEmail').required = mode !== 'reset';
    $('#authForgot').hidden = mode !== 'login';
    // „Pradėti be registracijos“ rodoma tik pradiniame lange
    const anon = mode === 'login' || mode === 'signup';
    $('#anonCard').hidden = !anon;
    $('#orLogin').hidden = !anon;
    $('#authBack').hidden = !opts.onBack;
    msg('');
  }

  $('#authSwitch').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; paint(); };
  $('#authForgot').onclick = () => { mode = 'forgot'; paint(); };
  $('#authBack').onclick = () => opts.onBack?.();

  $('#anonBtn').onclick = async () => {
    const btn = $<HTMLButtonElement>('#anonBtn'), m = $('#anonMsg');
    btn.disabled = true; m.textContent = 'Palauk…'; m.className = 'authmsg';
    const { error } = await db.auth.signInAnonymously();
    btn.disabled = false;
    if (error) { m.textContent = authErr(error.message); m.className = 'authmsg err'; } else m.textContent = '';
  };

  $<HTMLFormElement>('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = inp('#authEmail').value.trim(), password = inp('#authPass').value;
    const btn = $<HTMLButtonElement>('#authBtn');
    btn.disabled = true; msg('Palauk…');
    try {
      if (mode === 'login') {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        msg('');
      } else if (mode === 'signup') {
        const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) msg('Paskyra sukurta. Patikrink el. paštą ir paspausk patvirtinimo nuorodą.', 'ok');
      } else if (mode === 'forgot') {
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        msg('Jei toks el. paštas registruotas, nuoroda išsiųsta.', 'ok');
      } else if (mode === 'upgrade') {
        // Anoniminei paskyrai prisiejamas el. paštas – vartotojo id ir duomenys nesikeičia.
        // Supabase reikalauja pirma patvirtinti el. paštą, tik tada galima nustatyti slaptažodį.
        const { error } = await db.auth.updateUser({ email }, { emailRedirectTo: location.origin });
        if (error) throw error;
        try { localStorage.setItem(NEEDS_PASSWORD, '1'); } catch { /* nesvarbu */ }
        msg('Patikrink el. paštą ir paspausk patvirtinimo nuorodą – tada nusistatysi slaptažodį. Iki tol gali naudotis programa kaip anksčiau.', 'ok');
      } else {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        try { localStorage.removeItem(NEEDS_PASSWORD); } catch { /* nesvarbu */ }
        msg('Slaptažodis išsaugotas.', 'ok');
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
  $('#authView').hidden = false;
}
