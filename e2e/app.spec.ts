import { expect, test, type Page } from '@playwright/test';

type W = { __store: { calls: string[]; days: Record<string, { items: { name: string; kcal: number; meal: string }[]; steps: number; ex: unknown[] }>; products: { name: string }[]; meals: { name: string }[]; settings: { kcal: number } }; __ai: { calls: { task: string; text: string; image: boolean }[] } };
const store = (page: Page) => page.evaluate(() => (window as unknown as W).__store);
const today = () => { const d = new Date(); const z = (n: number) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  (page as unknown as { __errors: string[] }).__errors = errors;
  // Išoriniai šriftai testuose nereikalingi
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/');
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#mockBar')).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test('maisto įrašymas per AI ir dienos suvestinė', async ({ page }) => {
  await page.locator('#foodInput').fill('bananas, kava');
  await page.locator('#addBtn').click();
  await expect(page.locator('#status')).toContainText('Pridėta: Bananas, Kava');
  await expect(page.locator('#kcalVal')).toHaveText('400');
  await expect(page.locator('#countTxt')).toHaveText('2 įrašai');
  const s = await store(page);
  expect(s.days[today()].items.map((i) => i.name)).toEqual(['Bananas', 'Kava']);
});

test('„Gal tai …?“ pakeičia į Mano produktą', async ({ page }) => {
  await page.locator('#foodInput').fill('majonezas');
  await page.locator('#addBtn').click();
  await page.getByRole('button', { name: /Taip \(43 kcal\)/ }).click();
  await expect(page.locator('#logBody')).toContainText("Hellmann's Light majonezas");
  await expect(page.locator('#kcalVal')).toHaveText('43');
  const s = await store(page);
  expect(s.days[today()].items[0]).toMatchObject({ name: "Hellmann's Light majonezas", kcal: 43 });
});

test('rankinis įvedimas, taisymas ir trynimas', async ({ page }) => {
  await page.locator('#manual summary').click();
  await page.locator('#manName').fill('Obuolys');
  await page.locator('#manKcal').fill('80');
  await page.locator('#manForm button').click();
  await expect(page.locator('#kcalVal')).toHaveText('80');
  await page.getByRole('button', { name: 'Taisyti' }).first().click();
  await page.locator('.editrow input[name=k]').fill('95');
  await page.locator('.editrow button[type=submit]').click();
  await expect(page.locator('#kcalVal')).toHaveText('95');
  await page.getByRole('button', { name: 'Ištrinti' }).first().click();
  await expect(page.locator('#kcalVal')).toHaveText('0');
  const s = await store(page);
  expect(s.calls).toEqual(expect.arrayContaining(['addFood', 'updateFood', 'deleteFood']));
  expect(s.days[today()]?.items ?? []).toHaveLength(0);
});

test('sportas: treniruotė ir žingsniai skaičiuojami formule', async ({ page }) => {
  await page.locator('#kindSport').click();
  await page.locator('#sportMin').fill('40');
  await page.locator('#stepsIn').fill('8000');
  await page.locator('#sportForm button').click();
  await expect(page.locator('#status')).toHaveText(/treniruotė 40 min \(−219 kcal\), 8\s?000 žingsnių \(−313 kcal\)/);
  await expect(page.locator('#balOut')).toHaveText(/2\s?632/);
  const s = await store(page);
  expect(s.days[today()].steps).toBe(8000);
  expect((await page.evaluate(() => (window as unknown as W).__ai.calls)).length).toBe(0);
});

test('Mano produktai: pridėti, įrašyti vienetais, ištrinti', async ({ page }) => {
  await page.locator('#mpManage').click();
  await page.locator('#mpName').fill('Graikiškas jogurtas');
  await page.locator('#mpUnit').fill('100 g');
  await page.locator('#mpKcal').fill('88');
  await page.locator('#mpProt').fill('9');
  await page.locator('#mpForm button').click();
  await page.locator('#mpChips button', { hasText: 'Graikiškas jogurtas' }).click();
  await page.locator('#mpG').fill('150');
  await page.locator('#mpAddBtn').click();
  await expect(page.locator('#kcalVal')).toHaveText('132');
  await expect(page.locator('#logBody')).toContainText('150 g');
  await page.locator('#mpList li', { hasText: 'Graikiškas' }).getByRole('button').click();
  const s = await store(page);
  expect(s.products.map((p) => p.name)).not.toContain('Graikiškas jogurtas');
});

test('dažnas valgis: išsaugoti ir vėl pridėti', async ({ page }) => {
  await page.locator('[data-slot=pusryciai]').click();
  await page.locator('#manual summary').click();
  await page.locator('#manName').fill('Kiaušinienė');
  await page.locator('#manKcal').fill('300');
  await page.locator('#manForm button').click();
  await page.locator('[data-save-meal=pusryciai]').click();
  await page.locator('[data-save-form] input').fill('Mano pusryčiai');
  await page.locator('[data-save-form] button[type=submit]').click();
  await page.locator('#mlChips button', { hasText: 'Mano pusryčiai' }).click();
  await expect(page.locator('#kcalVal')).toHaveText('600');
  const s = await store(page);
  expect(s.meals.map((m) => m.name)).toEqual(['Mano pusryčiai']);
});

test('„Kaip vakar“ nukopijuoja vakarykštį valgį', async ({ page }) => {
  await page.locator('[data-slot=pietus]').click();
  await page.locator('[data-yday]').click();
  await expect(page.locator('#kcalVal')).toHaveText('330');
});

test('skaičiuoklė: produktas, porcija, palyginimas, valgio planas', async ({ page }) => {
  await page.locator('#kindCalc').click();
  await page.locator('#calcName').fill('graikiškas jogurtas');
  await page.locator('#calcBtn').click();
  await expect(page.locator('.resname')).toHaveText('Graikiškas jogurtas');
  await expect(page.locator('#calcPortion')).toContainText('110 kcal');
  await page.locator('#calcG').fill('200');
  await expect(page.locator('#calcPortion')).toContainText('146 kcal');
  await page.locator('#calcCmp').click();
  await expect(page.locator('#cmpOut')).toContainText('Graikiškas jogurtas');
  await page.locator('#calcAdd').click();
  await expect(page.locator('#kcalVal')).toHaveText('146');

  await page.locator('#calcName').fill('2 kiaušiniai, duona');
  await page.locator('#calcBtn').click();
  await expect(page.locator('.resname')).toHaveText('Valgio planas');
  await page.locator('#mealAdd').click();
  await expect(page.locator('#kcalVal')).toHaveText('546');
});

test('lengvesnio produkto paieška', async ({ page }) => {
  await page.locator('#kindCalc').click();
  await page.locator('#altQ').fill('majonezas');
  await page.locator('#altBtn').click();
  await expect(page.locator('.alts li')).toHaveCount(2);
  await expect(page.locator('.alts a').first()).toHaveAttribute('href', /barbora\.lt/);
});

test('AI klaida rodoma suprantamai', async ({ page }) => {
  await page.locator('#foodInput').fill('plyta');
  await page.locator('#addBtn').click();
  await expect(page.locator('#status')).toHaveText(/Neatpažinau maisto/);
  await expect(page.locator('#status')).toHaveClass(/err/);
});

test('nuotrauka sumažinama ir siunčiama AI', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#photoInput').setInputFiles({ name: 'maistas.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#fileName')).toHaveText('maistas.png');
  await page.locator('#addBtn').click();
  await expect(page.locator('#status')).toContainText('Pridėta');
  const calls = await page.evaluate(() => (window as unknown as W).__ai.calls);
  expect(calls[0]).toMatchObject({ task: 'estimate', image: true });
});

test('tikslai išsaugomi ir keičia limitą', async ({ page }) => {
  await page.locator('#goals summary').click();
  await page.locator('#goalKcal').fill('1800');
  await expect(page.locator('#kcalOf')).toHaveText(/1\s?800 kcal/, { timeout: 3000 });
  const s = await store(page);
  expect(s.settings.kcal).toBe(1800);
});

test('statistika ir pastebėjimai, dienų naršymas', async ({ page }) => {
  await expect(page.locator('#statTiles')).toContainText('Vid. suvalgyta');
  await page.locator('#insightBtn').click();
  await expect(page.locator('#insightTxt')).toContainText('Bandomasis pastebėjimas');
  await page.locator('#prev').click();
  await expect(page.locator('#kcalVal')).toHaveText('510');
  await expect(page.locator('#todayBtn')).toBeVisible();
  await page.locator('#todayBtn').click();
  await expect(page.locator('#dateLbl')).toContainText('Šiandien');
});

test('telefono plotyje nėra horizontalaus slinkimo', async ({ page }) => {
  for (const k of ['#kindFood', '#kindSport', '#kindCalc']) {
    await page.locator(k).click();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  }
});
