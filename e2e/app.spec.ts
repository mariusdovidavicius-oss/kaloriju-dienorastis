import { expect, test, type Page } from '@playwright/test';

// Testai veikia bandomajame režime (duomenys atmintyje, netikras AI) – tikri duomenys neliečiami.
type Item = { name: string; kcal: number; meal: string };
type W = {
  __store: { offline: boolean; calls: string[]; days: Record<string, { items: (Item & { amount: string; source?: string })[]; steps: number; water: number; ex: unknown[] }>; products: { name: string }[]; meals: { name: string; servings?: number | null; totalGrams?: number | null; items: unknown[] }[]; settings: { kcal: number; protein: number; onboarded: boolean; lang: string; remindWater: boolean; remindMeals: boolean; waterGoal: number | null; remindFrom: number } };
  __ai: { calls: { task: string; text: string; image: boolean }[] };
};
const store = (page: Page) => page.evaluate(() => (window as unknown as W).__store);
const aiCalls = (page: Page) => page.evaluate(() => (window as unknown as W).__ai.calls);
const today = () => { const d = new Date(); const z = (n: number) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
const sheet = (page: Page) => page.locator('.sheet-panel');

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()); });
  (page as unknown as { __errors: string[] }).__errors = errors;
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => { try { localStorage.setItem('kd-lang', 'lt'); } catch { /* */ } });
  await page.goto('/' + query);
}
async function describe(page: Page, meal: string, text: string) {
  await page.locator(`.addbtn[data-add="${meal}"]`).click();
  await sheet(page).locator('#foodInput').fill(text);
  await sheet(page).locator('#aiBtn').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
}

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test.describe('pagrindinis', () => {
  test.beforeEach(async ({ page }) => { await open(page); await expect(page.locator('#viewToday')).toBeVisible(); });

  test('maistas per AI patenka į pasirinktą valgį', async ({ page }) => {
    await describe(page, 'pusryciai', 'avižinė košė, kava');
    await expect(page.locator('#toast')).toContainText('Pridėta: Avižinė košė, Kava');
    await expect(page.locator('.ring-num')).toHaveText(/1\s?600/);
    const s = await store(page);
    expect(s.days[today()].items.map((i) => [i.name, i.meal])).toEqual([['Avižinė košė', 'pusryciai'], ['Kava', 'pusryciai']]);
  });

  test('„Gal tai …?“ pakeičia į Mano produktą', async ({ page }) => {
    await describe(page, 'pietus', 'majonezas');
    await page.getByRole('button', { name: /Taip · 43 kcal/ }).click();
    await expect(page.locator('[data-meal="pietus"] .r-name')).toHaveText("Hellmann's Light majonezas");
    expect((await store(page)).days[today()].items[0].kcal).toBe(43);
  });

  test('taisymas, ištrynimas ir „Atšaukti“', async ({ page }) => {
    await describe(page, 'vakariene', 'obuolys');
    await page.locator('[data-item]').click();
    await sheet(page).locator('input[name=name]').fill('Žalias obuolys');
    await sheet(page).locator('input[name=kcal]').fill('95');
    await sheet(page).locator('select[name=meal]').selectOption('uzkandis');
    await sheet(page).getByRole('button', { name: 'Išsaugoti' }).click();
    await expect(page.locator('[data-meal="uzkandis"] .r-name')).toHaveText('Žalias obuolys');
    await expect(page.locator('.ring-num')).toHaveText(/1\s?905/);
    await page.locator('[data-item]').click();
    await sheet(page).getByRole('button', { name: 'Ištrinti' }).click();
    await expect(page.locator('[data-item]')).toHaveCount(0);
    await page.locator('#toast').getByRole('button', { name: 'Atšaukti' }).click();
    await expect(page.locator('[data-item]')).toHaveCount(1);
    const s = await store(page);
    expect(s.calls).toEqual(expect.arrayContaining(['addFood', 'updateFood', 'deleteFood']));
    expect(s.days[today()].items.map((i) => i.name)).toEqual(['Žalias obuolys']);
  });

  test('rankinis įvedimas veikia be AI', async ({ page }) => {
    await page.locator('.addbtn[data-add="pietus"]').click();
    await sheet(page).locator('details.manual summary').click();
    await sheet(page).locator('#manName').fill('Sriuba');
    await sheet(page).locator('#manKcal').fill('250');
    await sheet(page).locator('#manForm button').click();
    await expect(page.locator('.ring-num')).toHaveText(/1\s?750/);
    expect(await aiCalls(page)).toHaveLength(0);
  });

  test('sportas: treniruotė ir žingsniai formule', async ({ page }) => {
    await page.locator('[data-add-sport]').click();
    await sheet(page).locator('#sportMin').fill('40');
    await sheet(page).locator('#stepsIn').fill('8000');
    await sheet(page).locator('#sportForm button').click();
    await expect(page.locator('#toast')).toHaveText(/treniruotė 40 min \(−219 kcal\), 8\s?000 žingsnių \(−313 kcal\)/);
    await expect(page.locator('.sportcard .meal-head span')).toHaveText('−532 kcal');
    expect((await store(page)).days[today()].steps).toBe(8000);
    expect(await aiCalls(page)).toHaveLength(0);
  });

  test('Mano produktai: pridėti Profilyje, įrašyti gramais', async ({ page }) => {
    await page.locator('[data-nav="profile"]').click();
    await page.locator('#pName').fill('Graikiškas jogurtas');
    await page.locator('#pUnit').fill('100 g');
    await page.locator('#pKcal').fill('88');
    await page.locator('#pProt').fill('9');
    await page.locator('#prodForm button').click();
    await page.locator('[data-nav="today"]').click();
    await page.locator('.addbtn[data-add="uzkandis"]').click();
    await sheet(page).locator('.chipbtn', { hasText: 'Graikiškas jogurtas' }).click();
    await sheet(page).locator('#mpG').fill('150');
    await sheet(page).locator('#mpAdd').click();
    await expect(page.locator('[data-meal="uzkandis"] .r-sub')).toContainText('150 g');
    await expect(page.locator('.ring-num')).toHaveText(/1\s?868/);
  });

  test('dažnas valgis ir „Kaip vakar“', async ({ page }) => {
    await page.locator('.addbtn[data-add="pietus"]').click();
    await sheet(page).locator('[data-yday]').click();
    await expect(page.locator('.ring-num')).toHaveText(/1\s?670/);
    await page.locator('[data-save-meal="pietus"]').click();
    await page.locator('form.savemeal input').fill('Mano pietūs');
    await page.locator('form.savemeal button[type=submit]').click();
    await page.locator('.addbtn[data-add="vakariene"]').click();
    await sheet(page).locator('[data-ml]', { hasText: 'Mano pietūs' }).click();
    await expect(page.locator('.ring-num')).toHaveText(/1\s?340/);
    expect((await store(page)).meals.filter((m) => m.servings == null).map((m) => m.name)).toEqual(['Mano pietūs']);
  });

  test('neseniai valgyta – vienu paspaudimu', async ({ page }) => {
    await page.locator('.addbtn[data-add="pusryciai"]').click();
    await sheet(page).locator('[data-recent]', { hasText: 'Avižinė košė' }).click();
    await expect(page.locator('[data-meal="pusryciai"] .r-name')).toHaveText('Avižinė košė');
  });

  test('skaičiuoklė: produktas, palyginimas, valgio planas', async ({ page }) => {
    await page.locator('[data-nav="add"]').click();
    await sheet(page).locator('[data-tab="calc"]').click();
    await sheet(page).locator('#calcName').fill('graikiškas jogurtas');
    await sheet(page).locator('#calcBtn').click();
    await expect(sheet(page).locator('.res-name')).toHaveText('Graikiškas jogurtas');
    await sheet(page).locator('#calcG').fill('200');
    await expect(sheet(page).locator('#calcPortion')).toContainText('146 kcal');
    await sheet(page).locator('#calcCmp').click();
    await expect(sheet(page).locator('#cmpOut')).toContainText('Graikiškas jogurtas');
    await sheet(page).locator('#calcName').fill('2 kiaušiniai, duona');
    await sheet(page).locator('#calcBtn').click();
    await expect(sheet(page).locator('.res-name')).toHaveText('Valgio planas');
    await sheet(page).locator('#planAdd').click();
    await expect(page.locator('.ring-num')).toHaveText(/1\s?600/);
  });

  test('lengvesnio produkto paieška', async ({ page }) => {
    await page.locator('[data-nav="add"]').click();
    await sheet(page).locator('[data-tab="calc"]').click();
    await sheet(page).locator('#altQ').fill('majonezas');
    await sheet(page).locator('#altBtn').click();
    await expect(sheet(page).locator('.alts li')).toHaveCount(2);
    await expect(sheet(page).locator('.alts a').first()).toHaveAttribute('href', /barbora\.lt/);
  });

  test('AI klaida rodoma suprantamai', async ({ page }) => {
    await page.locator('.addbtn[data-add="pietus"]').click();
    await sheet(page).locator('#foodInput').fill('plyta');
    await sheet(page).locator('#aiBtn').click();
    await expect(sheet(page).locator('#addStatus')).toHaveText(/Neatpažinau maisto/);
  });

  test('nuotrauka sumažinama ir siunčiama AI', async ({ page }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('.addbtn[data-add="pietus"]').click();
    await sheet(page).locator('#photoInput').setInputFiles({ name: 'maistas.png', mimeType: 'image/png', buffer: png });
    await expect(sheet(page).locator('.filechip')).toContainText('maistas.png');
    await sheet(page).locator('#aiBtn').click();
    await expect(page.locator('.sheet')).toHaveCount(0);
    expect((await aiCalls(page))[0]).toMatchObject({ task: 'estimate', image: true });
  });

  test('tikslai Profilyje ir perskaičiavimas', async ({ page }) => {
    await page.locator('[data-nav="profile"]').click();
    await page.locator('#gAct').selectOption('low');
    await page.locator('#gPace').selectOption('0.5');
    await page.locator('#recalc').click();
    await expect(page.locator('#gKcal')).toHaveValue('1750');
    await page.locator('#goalForm button[type=submit]').click();
    await page.locator('[data-nav="today"]').click();
    await expect(page.locator('.sum-of')).toHaveText(/1\s?750/);
    expect((await store(page)).settings.kcal).toBe(1750);
  });

  test('kalbos keitimas į anglų', async ({ page }) => {
    await page.locator('[data-nav="profile"]').click();
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-nav="today"]')).toContainText('Today');
    await page.locator('[data-nav="today"]').click();
    await expect(page.locator('[data-meal="pusryciai"] h2')).toHaveText('Breakfast');
    expect((await store(page)).settings.lang).toBe('en');
  });

  test('savaitės juosta, statistika ir pastebėjimai', async ({ page }) => {
    const wd = page.locator('.wday.sel');
    await expect(wd).toHaveClass(/is-today/);
    await page.locator('.wday').filter({ has: page.locator('.dot.on') }).first().click();
    await expect(page.locator('.ring-num')).toHaveText(/1\s?490/);
    await expect(page.locator('.balance')).toBeVisible();
    await page.locator('[data-nav="stats"]').click();
    await expect(page.locator('#viewStats')).toContainText('Vid. suvalgyta');
    await page.locator('#insightBtn').click();
    await expect(page.locator('#insightTxt')).toContainText('Bandomasis pastebėjimas');
  });

  test('mažas ekranas: nėra horizontalaus slinkimo, mygtukai ≥ 36 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    for (const k of ['today', 'stats', 'profile']) {
      await page.locator(`[data-nav="${k}"]`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
    await page.locator('[data-nav="today"]').click();
    const small = await page.evaluate(() => [...document.querySelectorAll('#viewToday button, .tabbar button')]
      .filter((b) => (b as HTMLElement).offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { c: b.className, t: (b.textContent || '').slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((r) => r.h < 36 || r.w < 36));
    expect(small).toEqual([]);
    await page.locator('[data-nav="add"]').click();
    expect(await page.evaluate(() => document.querySelector('.sheet-body')!.scrollWidth - document.querySelector('.sheet-body')!.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('2 etapas', () => {
  test.beforeEach(async ({ page }) => { await open(page); await expect(page.locator('#viewToday')).toBeVisible(); });

  test('svoris: kortelė su tikslu, įrašymas, grafikas', async ({ page }) => {
    const card = page.locator('.weightcard');
    await expect(card).toContainText('93,8 kg');
    await expect(card).toContainText('tikslas 85 kg');
    await card.locator('[data-weight]').click();
    await sheet(page).locator('#wKg').fill('93,2');
    await sheet(page).getByRole('button', { name: 'Išsaugoti' }).click();
    await expect(card).toContainText('93,2 kg');
    const s = await store(page);
    expect((s as unknown as { weights: { date: string; kg: number }[] }).weights.at(-1)).toEqual({ date: today(), kg: 93.2 });
    expect(s.settings.weight).toBe(93.2);
    await page.locator('[data-nav="stats"]').click();
    await expect(page.locator('#viewStats')).toContainText('Svorio kitimas');
    await expect(page.locator('#viewStats svg.chart circle')).toHaveCount(5);
  });

  test('paieška bazėje be lietuviškų raidžių ir įrašymas vienetais', async ({ page }) => {
    await page.locator('.addbtn[data-add="pusryciai"]').click();
    await sheet(page).locator('#q').fill('kiausinis');
    await sheet(page).locator('.results [data-mp]', { hasText: /^Kiaušinis/ }).first().click();
    await sheet(page).locator('#mpN').fill('3');
    await expect(sheet(page).locator('#mpTot')).toContainText('236 kcal');
    await sheet(page).locator('#mpAdd').click();
    await expect(page.locator('[data-meal="pusryciai"] .r-name')).toHaveText('Kiaušinis');
    await expect(page.locator('[data-meal="pusryciai"] .r-sub')).toContainText('3 × vnt. (165 g)');
    expect(await aiCalls(page)).toHaveLength(0);
  });

  test('bazės produktą galima įsidėti į Mano produktus', async ({ page }) => {
    await page.locator('[data-nav="add"]').click();
    await sheet(page).locator('#q').fill('skyras');
    await sheet(page).locator('.results [data-mp]').first().click();
    await sheet(page).locator('#toMine').click();
    await expect(sheet(page).locator('#toMine')).toHaveCount(0);
    expect((await store(page)).products.map((p) => p.name)).toContain('Skyras');
  });

  test('brūkšninis kodas (įvestas ranka) → Open Food Facts', async ({ page }) => {
    await page.route('**/api/v2/product/4770000000000.json*', (r) => r.fulfill({ json: { status: 1, product: { product_name: 'Varškė 0,5 %', brands: 'Rokiškio', nutriments: { 'energy-kcal_100g': 76, proteins_100g: 16, carbohydrates_100g: 2, fat_100g: 0.5 } } } }));
    await page.route('**/api/v2/product/1111111111111.json*', (r) => r.fulfill({ status: 404, json: { status: 0 } }));
    await page.locator('[data-nav="add"]').click();
    await sheet(page).locator('#scanBtn').click();
    await sheet(page).locator('#codeIn').fill('1111111111111');
    await sheet(page).locator('#codeForm button').click();
    await expect(sheet(page).locator('#addStatus')).toContainText('nerasta');
    await sheet(page).locator('#scanBtn').click();
    await sheet(page).locator('#codeIn').fill('4770000000000');
    await sheet(page).locator('#codeForm button').click();
    await expect(sheet(page).locator('.qty b')).toHaveText('Rokiškio Varškė 0,5 %');
    await sheet(page).locator('#mpG').fill('200');
    await expect(sheet(page).locator('#mpTot')).toContainText('152 kcal');
    await sheet(page).locator('#mpAdd').click();
    await expect(page.locator('#toast')).toContainText('Rokiškio Varškė');
  });

  test('be interneto: juosta, įrašai išsaugomi atsiradus ryšiui', async ({ page }) => {
    await page.evaluate(() => { (window as unknown as W).__store.offline = true; });
    await page.locator('.addbtn[data-add="pietus"]').click();
    await sheet(page).locator('details.manual summary').click();
    await sheet(page).locator('#manName').fill('Sriuba');
    await sheet(page).locator('#manKcal').fill('250');
    await sheet(page).locator('#manForm button').click();
    await expect(page.locator('#syncBar')).toContainText('Nėra ryšio');
    await expect(page.locator('[data-meal="pietus"] .r-name')).toHaveText('Sriuba');
    expect((await store(page)).calls).not.toContain('addFood');
    await page.evaluate(() => { (window as unknown as W).__store.offline = false; window.dispatchEvent(new Event('online')); });
    await expect(page.locator('#syncBar')).toBeHidden();
    expect((await store(page)).days[today()].items.map((i) => i.name)).toEqual(['Sriuba']);
  });
});

test('pirmo paleidimo vedlys apskaičiuoja tikslą', async ({ page }) => {
  await open(page, '?onboard=1');
  await expect(page.locator('#onboardView')).toBeVisible();
  await page.locator('.choice', { hasText: 'Moteris' }).click();
  await page.locator('#obAge').fill('30');
  await page.locator('button[type=submit]').click();
  await page.locator('#obHeight').fill('165');
  await page.locator('#obWeight').fill('70');
  await page.locator('button[type=submit]').click();
  await page.locator('.choice', { hasText: 'Šiek tiek vaikštau' }).click();
  await page.locator('.choice', { hasText: '−0,5' }).click();
  await page.locator('button[type=submit]').click();
  // BMR = 700 + 1031,25 − 150 − 161 = 1420; × 1,35 = 1917; − 550 = 1367 → 1350
  await expect(page.locator('#obKcal')).toHaveValue('1350');
  await expect(page.locator('#obProt')).toHaveValue('110');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#viewToday')).toBeVisible();
  await expect(page.locator('.sum-of')).toHaveText(/1\s?350/);
  const s = await store(page);
  expect(s.settings).toMatchObject({ kcal: 1350, protein: 110, onboarded: true });
});

test('vedlys: neteisingi skaičiai neleidžia tęsti', async ({ page }) => {
  await open(page, '?onboard=1');
  await page.locator('#obAge').fill('5');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#obErr')).toHaveText('Patikrink skaičius.');
});

test.describe('3 etapas', () => {
  test.beforeEach(async ({ page }) => { await open(page); await expect(page.locator('#viewToday')).toBeVisible(); });
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); const z = (n: number) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };

  test('vanduo: +250, +500, atimti; tikslas pagal svorį', async ({ page }) => {
    const card = page.locator('.watercard');
    await expect(card).toContainText('iš 2,75 l'); // 94 kg × 30 ml = 2 820 → 2 750
    await card.getByRole('button', { name: '+ 250 ml' }).click();
    await card.getByRole('button', { name: '+ 500 ml' }).click();
    await card.getByRole('button', { name: 'Atimti 250 ml' }).click();
    await expect(card.locator('.wnow')).toHaveText('0,5 l');
    await expect.poll(async () => (await store(page)).days[today()].water).toBe(500);
  });

  test('vanduo: sportas padidina tikslą', async ({ page }) => {
    await page.locator('[data-day="' + yesterday() + '"]').first().click();
    await expect(page.locator('.watercard')).toContainText('su sportu +0,25 l'); // 40 min → 333 ml → 250
  });

  test('kopijuoti visą valgį iš vakar į šiandien', async ({ page }) => {
    await page.locator('[data-day="' + yesterday() + '"]').first().click();
    await page.locator('[data-copy-meal="pusryciai"]').click();
    await sheet(page).getByRole('button', { name: 'Šiandien' }).click();
    await sheet(page).locator('#copyForm button[type=submit]').click();
    await expect(page.locator('#toast')).toContainText('Nukopijuota į šiandien: 1 įrašas');
    const s = await store(page);
    expect(s.days[today()].items.map((i) => [i.name, i.meal])).toEqual([['Avižinė košė', 'pusryciai']]);
  });

  test('kopijuoti įrašą į kitą valgį ir visą dieną', async ({ page }) => {
    await page.locator('[data-day="' + yesterday() + '"]').first().click();
    await page.locator('[data-item]').first().click();
    await sheet(page).getByRole('button', { name: 'Kopijuoti į…' }).click();
    await sheet(page).locator('#cpMeal').selectOption('uzkandis');
    await sheet(page).locator('#copyForm button[type=submit]').click();
    await page.locator('[data-copy-day]').click();
    await sheet(page).locator('#copyForm button[type=submit]').click();
    const items = (await store(page)).days[today()].items.map((i) => i.meal + ':' + i.name).sort();
    expect(items).toEqual(['pietus:Vištienos krūtinėlė', 'pusryciai:Avižinė košė', 'uzkandis:Avižinė košė']);
  });

  test('receptas: ⅓ puodo įrašoma kaip viena eilutė', async ({ page }) => {
    await page.locator('.addbtn[data-add="pietus"]').click();
    await sheet(page).locator('[data-rc]', { hasText: 'Lęšių sriuba' }).click();
    await expect(sheet(page)).toContainText('Visas: 1 510 kcal · 6 porc.');
    await sheet(page).locator('[data-frac="0.3333333333333333"]').click();
    await expect(sheet(page).locator('#rcN')).toHaveValue('2');
    await expect(sheet(page).locator('#rcG')).toHaveValue('800');
    await sheet(page).locator('#rcAdd').click();
    const it = (await store(page)).days[today()].items[0];
    expect([it.name, it.kcal, it.amount, it.source, it.meal]).toEqual(['Lęšių sriuba', 503, '2 porc. iš 6 · 800 g', 'recipe', 'pietus']);
  });

  test('receptas: gramais ir paieškoje', async ({ page }) => {
    await page.locator('.addbtn[data-add="vakariene"]').click();
    await sheet(page).locator('#q').fill('lesiu');
    await sheet(page).locator('.results [data-rc]').click();
    await sheet(page).locator('#rcG').fill('300');
    await expect(sheet(page).locator('#rcN')).toHaveValue('0.75');
    await sheet(page).locator('#rcAdd').click();
    expect((await store(page)).days[today()].items[0].kcal).toBe(189);
  });

  test('receptas: sukurti Profilyje iš bazės produktų', async ({ page }) => {
    await page.locator('[data-nav="profile"]').click();
    await page.locator('#newRecipe').click();
    await sheet(page).locator('#rcName').fill('Vištienos troškinys');
    await sheet(page).locator('#rcServ').fill('2');
    await sheet(page).locator('#rq').fill('vistienos krutinele');
    await sheet(page).locator('[data-rc-pick]').first().click();
    await sheet(page).locator('#riG').fill('400');
    await sheet(page).locator('#riAdd').click();
    await sheet(page).locator('details.manual summary').click();
    await sheet(page).locator('#rmName').fill('Padažas');
    await sheet(page).locator('#rmKcal').fill('120');
    await sheet(page).locator('#rcMan button[type=submit]').click();
    await expect(sheet(page).locator('#rcItems')).toContainText('Padažas');
    await sheet(page).locator('#rcSave').click();
    await expect(page.locator('#toast')).toContainText('Receptas „Vištienos troškinys“ išsaugotas');
    const r = (await store(page)).meals.find((m) => m.name === 'Vištienos troškinys')!;
    expect([r.servings, r.items.length]).toEqual([2, 2]);
    await expect(page.locator('[data-edit-recipe]', { hasText: 'Vištienos troškinys' })).toBeVisible();
  });

  test('priminimai išsaugomi; bandomajame režime pranešimai neveikia', async ({ page }) => {
    await page.locator('[data-nav="profile"]').click();
    await page.locator('#rWater').check();
    await page.locator('#rFrom').selectOption('8');
    await page.locator('#wGoal').fill('2500');
    await page.locator('#remForm button[type=submit]').click();
    await expect.poll(async () => { const s = (await store(page)).settings; return [s.remindWater, s.remindMeals, s.remindFrom, s.waterGoal]; }).toEqual([true, false, 8, 2500]);
    await page.locator('#pushOn').click();
    await expect(page.locator('#toast')).toContainText('Bandomajame režime');
    await page.locator('[data-nav="today"]').click();
    await expect(page.locator('.watercard')).toContainText('iš 2,5 l');
  });
});

test('kalibravimas pagal svorį ir serija (demo duomenys)', async ({ page }) => {
  await open(page, '?demo=1');
  await expect(page.locator('.streak')).toHaveText('28 d. iš eilės');
  await page.locator('[data-nav="stats"]').click();
  const card = page.locator('.calib');
  await expect(card).toContainText('Sudegini per dieną');
  const btn = card.locator('[data-calib]');
  const k = Number(await btn.getAttribute('data-calib'));
  expect(k).toBeGreaterThan(1900);
  await btn.click();
  await expect.poll(async () => (await store(page)).settings.kcal).toBe(k);
  await expect(card).toContainText('Dabartinis tikslas tinka');
});

test('kalibravimas: kol trūksta duomenų, rodoma kiek dar reikia', async ({ page }) => {
  await open(page);
  await page.locator('[data-nav="stats"]').click();
  await expect(page.locator('.calib')).toContainText('Dabar: 0 d. su įrašais, 4 svėrimai per 18 d.');
});
