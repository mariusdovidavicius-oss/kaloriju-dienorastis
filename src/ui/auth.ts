// Prisijungimo / registracijos / slaptažodžio atkūrimo langas.
import type { SupabaseClient } from '@supabase/supabase-js';
import { $, inp } from './dom';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

const TEXT: Record<Mode, { btn: string; switch: string; intro: string }> = {
  login: { btn: 'Prisijungti', switch: 'Neturi paskyros? Registruokis', intro: 'Prisijunk, kad matytum savo įrašus bet kuriame įrenginyje.' },
  signup: { btn: 'Sukurti paskyrą', switch: 'Jau turi paskyrą? Prisijunk', intro: 'Sukurk paskyrą. Slaptažodis – bent 8 simboliai.' },
  forgot: { btn: 'Siųsti nuorodą', switch: 'Grįžti į prisijungimą', intro: 'Įvesk el. paštą – atsiųsime nuorodą naujam slaptažodžiui.' },
  reset: { btn: 'Išsaugoti naują slaptažodį', switch: 'Grįžti į prisijungimą', intro: 'Įvesk naują slaptažodį.' },
};

function authErr(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Neteisingas el. paštas arba slaptažodis.';
  if (m.includes('email not confirmed')) return 'El. paštas dar nepatvirtintas. Paspausk nuorodą laiške.';
  if (m.includes('already registered')) return 'Toks el. paštas jau užregistruotas. Prisijunk.';
  if (m.includes('password')) return 'Slaptažodis per silpnas: bent 8 simboliai.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Per daug bandymų. Palauk kelias minutes.';
  return 'Nepavyko: ' + msg;
}

export function showAuth(db: SupabaseClient, initial: Mode = 'login') {
  let mode: Mode = initial;
  const msg = (t: string, kind: '' | 'err' | 'ok' = '') => { const el = $('#authMsg'); el.textContent = t; el.className = 'authmsg' + (kind ? ' ' + kind : ''); };

  function paint() {
    const t = TEXT[mode];
    $('#authBtn').textContent = t.btn;
    $('#authSwitch').textContent = t.switch;
    $('#authIntro').textContent = t.intro;
    $('#authPassLbl').hidden = mode === 'forgot';
    inp('#authPass').required = mode !== 'forgot';
    inp('#authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#authEmail').parentElement!.hidden = mode === 'reset';
    inp('#authEmail').required = mode !== 'reset';
    $('#authForgot').hidden = mode !== 'login';
    msg('');
  }

  $('#authSwitch').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; paint(); };
  $('#authForgot').onclick = () => { mode = 'forgot'; paint(); };

  $('#authForm').onsubmit = async (e) => {
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
      } else {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        msg('Slaptažodis pakeistas.', 'ok');
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
