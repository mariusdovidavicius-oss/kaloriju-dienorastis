import './styles.css';
import { $ } from './ui/dom';
import { startApp } from './ui/app';

const MOCK = import.meta.env.VITE_MOCK === '1';

async function boot() {
  if (MOCK) {
    // Bandomasis režimas: niekas nesiunčiama į serverį.
    const [{ MemoryStore }, { MockAi }] = await Promise.all([import('./data/memoryStore'), import('./ai/mockAi')]);
    const store = new MemoryStore(), ai = new MockAi();
    Object.assign(window, { __store: store, __ai: ai }); // testams
    await startApp({ store, ai, mock: true, anonymous: false, onLogout: () => location.reload(), onSaveAccount: () => {} });
    show('app');
    return;
  }

  const [{ supabase }, { SupabaseStore }, { SupabaseAi }, { showAuth, NEEDS_PASSWORD }] = await Promise.all([
    import('./data/supabase'), import('./data/supabaseStore'), import('./ai/supabaseAi'), import('./ui/auth'),
  ]);
  const db = supabase();
  let startedFor: string | null = null;

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { showAuth(db, 'reset'); return; }
    if (!session) { if (startedFor) location.reload(); else showAuth(db); return; }
    if (startedFor === session.user.id) return;
    startedFor = session.user.id;
    const anonymous = !!session.user.is_anonymous;
    // Anoniminė paskyra ką tik patvirtino el. paštą – paprašom nusistatyti slaptažodį.
    let needsPassword = false;
    try { needsPassword = !anonymous && !!session.user.email && localStorage.getItem(NEEDS_PASSWORD) === '1'; } catch { /* nesvarbu */ }
    if (needsPassword) { showAuth(db, 'reset'); return; }
    // startApp kviečiamas už įvykio ribų (supabase-js rekomendacija – nelaukti onAuthStateChange viduje).
    setTimeout(async () => {
      show('boot');
      try {
        await startApp({
          store: new SupabaseStore(db, session.user.id), ai: new SupabaseAi(db), mock: false, anonymous,
          onLogout: async () => { await db.auth.signOut(); location.reload(); },
          onSaveAccount: () => showAuth(db, 'upgrade', { onBack: () => show('app') }),
        });
        show('app');
      } catch (e) {
        console.error(e);
        $('#bootView').textContent = 'Nepavyko įkelti duomenų. Patikrink ryšį ir perkrauk puslapį.';
        show('boot');
      }
    }, 0);
  });
}

function show(which: 'boot' | 'app') {
  $('#bootView').hidden = which !== 'boot';
  $('#authView').hidden = true;
  $('#appView').hidden = which !== 'app';
}

void boot();

