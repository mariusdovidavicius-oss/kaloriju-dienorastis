// Claude nurodymai. Perkelti iš Artifact versijos (v16) su minimaliais pakeitimais.

export interface Product { id: string; name: string; unit: string; grams: number | null; kcal: number; protein: number; carbs: number; fat: number }
export interface Profile { kcal_goal: number; protein_goal: number; weight_kg: number; age: number; height_cm: number; sex: 'm' | 'f'; accurate: boolean }

function myProductsPrompt(ps: Product[], withMaybe: boolean): string {
  if (!ps.length) return '';
  const list = ps.map((p) =>
    '  • ' + (withMaybe ? p.id + ' – ' : '') + p.name + ': ' + (/^\d/.test(p.unit) ? '' : '1 ') + p.unit +
    (p.grams ? ' (' + p.grams + ' g)' : '') + ' = ' + p.kcal + ' kcal, baltymai ' + (p.protein || 0) + ' g' +
    (p.carbs ? ', angliavandeniai ' + p.carbs + ' g' : '') + (p.fat ? ', riebalai ' + p.fat + ' g' : ''),
  ).join('\n');
  return '- Šio žmogaus dažnai vartojami produktai:\n' + list + '\n' +
    '  Jei įraše produktas AIŠKIAI nurodytas kaip vienas iš šių (prekės ženklu, pvz. „Hellmann\'s“, „Vilniaus duona“, arba žodžiu „mano“, pvz. „mano majonezas“), naudok BŪTENT jo vertes ir pavadinimą.\n' +
    (withMaybe
      ? '  Jei minimas tik bendras produktas (pvz. „majonezas“, „light majonezas“, „duona“, „ruginė duona“), kuris GALI būti vienas iš šių, vertink jį kaip įprastą vidutinį tokį produktą, bet pridėk laukus "maybe": "<produkto id>" ir "units": <kiek to produkto vienetų tai atitiktų, skaičius>.\n'
      : '  Jei minimas tik bendras produktas, vertink kaip įprastą vidutinį produktą.\n');
}

export function estimatePrompt(text: string, hasImage: boolean, products: Product[]): string {
  return `Tu esi mitybos skaičiuoklė. Žmogus aprašė, ką suvalgė (dažniausiai lietuviškai, gali būti su klaidomis ar be lietuviškų raidžių)${hasImage ? ', ir pridėjo maisto nuotrauką' : ''}.
Išskirk kiekvieną produktą ar patiekalą ir įvertink jo kalorijas bei makroelementus pagal įprastas maistinės vertės lenteles.
- Jei kiekis nurodytas (g, vnt., šaukštai), naudok jį.
- Jei kiekis nenurodytas, imk įprastą vidutinę suaugusio žmogaus porciją ir ją įrašyk lauke "amount".
- Jei mėsos, ryžių ar makaronų būsena nenurodyta, laikyk kad svoris yra paruošto (virto/kepto) produkto.
- Šis žmogus maistą dažniausiai gamina karšto oro gruzdintuvėje BE aliejaus. Jei aliejus nepaminėtas, aliejaus kalorijų nepridėk (ir "kepta" reiškia be aliejaus). Jei parašyta "šlakelis aliejaus", skaičiuok ~1 arbatinį šaukštelį alyvuogių aliejaus (~5 ml, ~40 kcal) kaip atskirą produktą.
- Restorano, kavinės, greito maisto ar kitų pagamintą maistą vertink įprastai, su įprastu riebalų kiekiu.
${myProductsPrompt(products, true)}- Pavadinimus rašyk taisyklinga lietuvių kalba, trumpai, iš didžiosios raidės.
Atsakyk TIK JSON objektu, be jokio kito teksto:
{"items":[{"name":"Bananas","amount":"1 vnt. (~120 g)","kcal":107,"protein":1.3,"carbs":27,"fat":0.4}]}
kcal – sveikas skaičius, protein/carbs/fat – gramai.
Jei įrašas visai nėra maistas ar gėrimas, grąžink {"items":[]}.

Įrašas: """${text || '(teksto nėra, vertink pagal nuotrauką)'}"""`;
}

export function lookupPrompt(text: string, hasImage: boolean, products: Product[]): string {
  return `Tu esi maisto produktų maistinės vertės žinynas. Žmogus stovi parduotuvėje ir nori sužinoti produkto maistinę vertę, kad nuspręstų, ką pirkti. Jis meta svorį.
${hasImage ? 'Pridėta nuotrauka: tai gali būti produkto etiketė su maistinės vertės lentele arba pats produktas. Jei matyti maistinės vertės lentelė, skaičius 100 g imk TIKSLIAI iš jos, o pavadinimą – iš pakuotės.\n' : ''}Produktas: """${text || '(teksto nėra, žiūrėk nuotrauką)'}"""
Jei nuotraukos su lentele nėra, pateik įprastą tokio produkto maistinę vertę 100 g (gėrimams – 100 ml) pagal Lietuvos parduotuvėse įprastą sudėtį. Nurodyk ir įprastą porciją ar pakuotę gramais.
SVARBU: jei įraše nurodytas kiekis (pvz., "5 kiaušiniai", "3 riekės", "2 šaukštai", "200 g"), "portion" turi atitikti BŪTENT TĄ kiekį: grams = bendras to kiekio svoris (pvz., 5 kiaušiniai ≈ 250 g), desc = kiekis žodžiais (pvz., "5 vnt."). Pavadinime kiekio nerašyk. Tik jei kiekis nenurodytas, imk įprastą porciją.
${myProductsPrompt(products, false)}Atsakyk TIK JSON objektu:
{"name":"Graikiškas jogurtas 2 %","unit":"g","per100":{"kcal":73,"protein":9,"carbs":4,"sugar":4,"fat":2},"portion":{"grams":150,"desc":"1 indelis"},"tip":"Vienas trumpas sakinys lietuviškai: ar tai geras pasirinkimas metant svorį ir kodėl."}
unit – "g" arba "ml". Jei tai ne maistas ar gėrimas, grąžink {"name":""}.`;
}

export function alternativesPrompt(q: string): string {
  return `Žmogus Lietuvoje meta svorį ir ieško lengvesnės alternatyvos (mažiau kalorijų, mažiau cukraus arba daugiau baltymų) produktui: """${q}""".
Pasiūlyk 4–6 konkrečius produktus, kurie paprastai parduodami Lietuvos prekybos centruose (Maxima/Barbora, Rimi, Lidl, Iki). Pirmenybę teik tikriems prekių ženklams su konkrečiu variantu (light, zero, 0 %, be pridėtinio cukraus, high protein), pvz., Hellmann's, Heinz, Vilnius, Rokiškio, Žemaitijos, Dvaro, Pieno žvaigždės, Rimi, Lidl ženklai. Jei nesi tikras, kad produktas dabar parduodamas Lietuvoje, vis tiek gali siūlyti, bet nurodyk "sure": false. Gali įtraukti ir vieną naminę alternatyvą ("homemade": true).
Pateik ir įprasto tokio produkto kalorijas palyginimui.
Atsakyk TIK JSON objektu:
{"usual":{"name":"Įprastas majonezas","kcal":680},"items":[{"name":"Hellmann's Light majonezas 27 %","search":"hellmanns light","kcal":289,"protein":0.5,"unit":"g","why":"Perpus mažiau kalorijų, skonis panašus","sure":true,"homemade":false}]}
kcal ir protein – 100 g (gėrimams – 100 ml, tada unit "ml"). search – 2–4 žodžių paieškos frazė parduotuvės svetainei, be % ženklų. why – iki 12 žodžių lietuviškai. Rikiuok nuo geriausio pasirinkimo.`;
}

export function insightPrompt(p: Profile, n: number, lines: string): string {
  const bmr = Math.round(10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === 'f' ? -161 : 5));
  const base = Math.round(bmr * 1.1);
  return `Tu esi palaikantis, bet sąžiningas mitybos ir sporto treneris. Klientas: ${p.sex === 'f' ? 'moteris' : 'vyras'}, ${p.age} m., ${p.height_cm} cm, ${p.weight_kg} kg. Nori numesti svorio, sportuoja namuose.
Jo tikslas: ${p.kcal_goal} kcal ir ${p.protein_goal} g baltymų per dieną. Be judėjimo jo kūnas per dieną sudegina apie ${base} kcal (bazinė apykaita ${bmr} + maisto virškinimas); visi žingsniai ir treniruotės skaičiuojami atskirai, todėl dienos be žingsnių įrašo sudeginta gali būti nepakankamai įvertinta. "Balansas" = suvalgyta minus sudeginta (neigiamas = deficitas).
Paskutinių ${n} dienų įrašai (tik dienos su duomenimis):
${lines}

Parašyk lietuviškai 3–5 trumpus, konkrečius pastebėjimus ir pasiūlymus, remdamasis TIK šiais duomenimis:
- kas sekasi gerai;
- kas trukdo (pvz., konkretūs kaloringi produktai ar gėrimai, baltymų trūkumas, vėlyvas valgymas, savaitgaliai, per didelis ar per mažas deficitas);
- ką konkrečiai pakeisti ar pakeisti kuo (pvz., „vietoj X rinkis Y“).
Jei deficitas didesnis nei ~1000 kcal per dieną arba suvalgoma mažiau nei ~1700 kcal, švelniai įspėk, kad tai per mažai ilgam laikui. Jei pilnų dienų mažiau nei 3, paminėk, kad duomenų dar mažai.
Kiekvieną punktą pradėk "• " ir rašyk naujoje eilutėje. Jokių antraščių, iš viso iki 130 žodžių. Kreipkis „tu“. Neperdėk pagyrų ir nemoralizuok.`;
}
