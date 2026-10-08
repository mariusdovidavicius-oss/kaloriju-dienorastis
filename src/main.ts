import './styles.css';
import { t } from './i18n';
import { $ } from './ui/dom';
import { startApp } from './ui/app';

const MOCK = import.meta.env.VITE_MOCK === '1';

function showBoot(text = t('loading')) {
  $('#bootView').textContent = text;
  $('#bootView').hidden = false;
  $('#authView').hidden = true;
  $('#appView').hidden = true;
  $('#onboardView').hidden = true;
}

async function boot() {
  showBoot();
  if (MOCK) {
    // Bandomasis režimas: niekas nesiunčiama į serverį. ?onboard=1 – parodo vedlį.
    const [{ MemoryStore }, { MockAi }] = await Promise.all([import('./data/memoryStore'), import('./ai/mockAi')]);
    const onboarded = !new URLSearchParams(location.search).has('onboard');
    const store = new MemoryStore(true, onboarded), ai = new MockAi();
    Object.assign(window, { __store: store, __ai: ai }); // testams
    await startApp({ store, ai, mock: true, anonymous: false, onLogout: () => location.reload(), onSaveAccount: () => {} });
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
      showBoot();
      try {
        await startApp({
          store: new SupabaseStore(db, session.user.id), ai: new SupabaseAi(db), mock: false, anonymous,
          onLogout: async () => { await db.auth.signOut(); location.reload(); },
          onSaveAccount: () => showAuth(db, 'upgrade', { onBack: () => { $('#authView').hidden = true; $('#appView').hidden = false; } }),
        });
      } catch (e) {
        console.error(e);
        showBoot(t('loadFailed'));
      }
    }, 0);
  });
}

void boot();
