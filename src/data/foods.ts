// Bendra produktų bazė: dažniausi produktai Lietuvoje, vertės 100 g (gėrimams – 100 ml).
// Vertės apytikslės, pagal įprastas maistinės vertės lenteles (paruošti produktai – jei nurodyta „virti“, „kepti“).
// Formatas: [lietuviškai, angliškai, kcal, baltymai, angliavandeniai, riebalai, vienetas LT?, vienetas EN?, vieneto g?]
type Row = [string, string, number, number, number, number, string?, string?, number?];

const ROWS: Row[] = [
  // kiaušiniai, pieno produktai
  ['Kiaušinis', 'Egg', 143, 12.6, 0.7, 9.5, 'vnt.', 'pc', 55],
  ['Kiaušinio baltymas', 'Egg white', 52, 10.9, 0.7, 0.2, 'vnt.', 'pc', 33],
  ['Kiaušinienė (be aliejaus)', 'Scrambled eggs (no oil)', 149, 10, 1.6, 11],
  ['Pienas 2,5 %', 'Milk 2.5%', 52, 3.2, 4.7, 2.5, 'stiklinė', 'glass', 250],
  ['Pienas 1 %', 'Milk 1%', 42, 3.4, 4.8, 1, 'stiklinė', 'glass', 250],
  ['Kefyras 2,5 %', 'Kefir 2.5%', 51, 3, 4, 2.5, 'stiklinė', 'glass', 250],
  ['Rūgpienis', 'Soured milk', 58, 3, 4.1, 3.2, 'stiklinė', 'glass', 250],
  ['Varškė 0,5 %', 'Cottage cheese 0.5%', 76, 16, 2, 0.5],
  ['Varškė 9 %', 'Cottage cheese 9%', 159, 16, 2, 9],
  ['Grūdėta varškė', 'Granular cottage cheese', 98, 11, 3.4, 4.3],
  ['Graikiškas jogurtas 2 %', 'Greek yogurt 2%', 73, 9, 4, 2],
  ['Graikiškas jogurtas 10 %', 'Greek yogurt 10%', 133, 6, 4, 10],
  ['Natūralus jogurtas', 'Plain yogurt', 63, 4.3, 5, 3],
  ['Skyras', 'Skyr', 63, 11, 4, 0.2],
  ['Varškės sūrelis (glaistytas)', 'Glazed curd snack', 410, 8, 32, 27, 'vnt.', 'pc', 45],
  ['Grietinė 20 %', 'Sour cream 20%', 204, 2.8, 3.2, 20, 'šaukštas', 'tbsp', 20],
  ['Grietinė 10 %', 'Sour cream 10%', 115, 3, 3.5, 10, 'šaukštas', 'tbsp', 20],
  ['Grietinėlė 10 %', 'Cream 10%', 118, 3, 4, 10, 'šaukštas', 'tbsp', 15],
  ['Sviestas', 'Butter', 740, 0.6, 0.6, 82, 'arbat. šaukštelis', 'tsp', 5],
  ['Kietasis sūris (Džiugas)', 'Hard cheese (Parmesan-style)', 390, 30, 0, 30, 'riekelė', 'slice', 20],
  ['Fermentinis sūris', 'Semi-hard cheese', 350, 25, 0, 27, 'riekelė', 'slice', 20],
  ['Mocarela', 'Mozzarella', 254, 18, 2, 19],
  ['Lydytas sūris', 'Processed cheese', 280, 12, 6, 23],
  ['Fetos sūris', 'Feta', 264, 14, 4, 21],
  ['Kepto pieno sūris (sūris su kmynais)', 'Farmer cheese', 300, 20, 2, 24],
  // mėsa, žuvis
  ['Vištienos krūtinėlė (kepta)', 'Chicken breast (cooked)', 165, 31, 0, 3.6],
  ['Vištienos krūtinėlė (žalia)', 'Chicken breast (raw)', 110, 23, 0, 1.5],
  ['Vištienos šlaunelės be odos (keptos)', 'Chicken thighs, skinless (cooked)', 209, 26, 0, 11],
  ['Vištienos šlaunelės su oda (keptos)', 'Chicken thighs with skin (cooked)', 232, 24, 0, 15],
  ['Vištienos faršas', 'Ground chicken', 143, 17, 0, 8],
  ['Kalakutienos krūtinėlė (kepta)', 'Turkey breast (cooked)', 135, 30, 0, 1],
  ['Kiaulienos nugarinė (kepta)', 'Pork loin (cooked)', 242, 27, 0, 14],
  ['Kiaulienos sprandinė (kepta)', 'Pork neck (cooked)', 290, 24, 0, 21],
  ['Kiaulienos kumpis (keptas)', 'Pork ham steak (cooked)', 220, 28, 0, 11],
  ['Kiaulienos šoninė', 'Pork belly', 518, 9, 0, 53],
  ['Malta kiauliena ir jautiena', 'Ground pork and beef', 260, 17, 0, 21],
  ['Jautienos kepsnys (keptas)', 'Beef steak (cooked)', 250, 26, 0, 15],
  ['Malta jautiena 10 %', 'Ground beef 10%', 176, 20, 0, 10],
  ['Rūkytas kumpis', 'Smoked ham', 145, 21, 1, 6, 'riekelė', 'slice', 20],
  ['Virta dešra', 'Bologna sausage', 260, 12, 2, 23, 'riekelė', 'slice', 20],
  ['Dešrelės', 'Frankfurters', 270, 11, 2, 24, 'vnt.', 'pc', 50],
  ['Rūkyta dešra', 'Smoked sausage', 450, 22, 1, 40, 'riekelė', 'slice', 10],
  ['Lašiša (kepta)', 'Salmon (cooked)', 206, 22, 0, 13],
  ['Silkė (sūdyta)', 'Salted herring', 217, 17, 0, 16],
  ['Menkė (kepta)', 'Cod (cooked)', 105, 23, 0, 0.9],
  ['Tunas savo sultyse', 'Tuna in water', 116, 26, 0, 1],
  ['Krabų lazdelės', 'Crab sticks', 95, 7, 15, 0.5, 'vnt.', 'pc', 17],
  ['Krevetės (virtos)', 'Shrimp (cooked)', 99, 24, 0.2, 0.3],
  // grūdai, duona
  ['Ruginė duona', 'Rye bread', 235, 7, 45, 1.5, 'riekė', 'slice', 33],
  ['Batonas (balta duona)', 'White bread', 265, 9, 49, 3.2, 'riekė', 'slice', 30],
  ['Pilno grūdo duona', 'Wholegrain bread', 247, 13, 41, 3.4, 'riekė', 'slice', 33],
  ['Skrebučio duona', 'Toast bread', 270, 8, 50, 4, 'riekė', 'slice', 25],
  ['Lavašas', 'Tortilla wrap', 300, 8, 50, 7, 'vnt.', 'pc', 60],
  ['Ryžiai (virti)', 'Rice (cooked)', 130, 2.7, 28, 0.3],
  ['Ryžiai (sausi)', 'Rice (dry)', 360, 7, 79, 0.6],
  ['Grikiai (virti)', 'Buckwheat (cooked)', 92, 3.4, 20, 0.6],
  ['Grikiai (sausi)', 'Buckwheat (dry)', 343, 13, 72, 3.4],
  ['Makaronai (virti)', 'Pasta (cooked)', 158, 5.8, 31, 0.9],
  ['Makaronai (sausi)', 'Pasta (dry)', 351, 12, 72, 1.5],
  ['Avižiniai dribsniai (sausi)', 'Rolled oats (dry)', 375, 13, 60, 7, 'šaukštas', 'tbsp', 10],
  ['Avižinė košė su vandeniu', 'Oatmeal with water', 71, 2.5, 12, 1.5],
  ['Bulgurai (virti)', 'Bulgur (cooked)', 83, 3, 19, 0.2],
  ['Kuskusas (virtas)', 'Couscous (cooked)', 112, 3.8, 23, 0.2],
  ['Perlinės kruopos (virtos)', 'Pearl barley (cooked)', 123, 2.3, 28, 0.4],
  ['Kukurūzų dribsniai', 'Corn flakes', 357, 7.5, 84, 0.4],
  ['Granola', 'Granola', 471, 10, 64, 20],
  ['Traškučiai duonelės', 'Crispbread', 350, 10, 70, 2, 'vnt.', 'pc', 10],
  ['Blynai', 'Pancakes', 227, 6.4, 28, 10, 'vnt.', 'pc', 50],
  ['Lietiniai', 'Crepes', 200, 6, 26, 8, 'vnt.', 'pc', 60],
  // bulvės, daržovės
  ['Bulvės (virtos)', 'Potatoes (boiled)', 87, 1.9, 20, 0.1],
  ['Bulvės (keptos gruzdintuvėje be aliejaus)', 'Potatoes (air-fried, no oil)', 93, 2.5, 21, 0.1],
  ['Bulvių košė', 'Mashed potatoes', 106, 2, 16, 4],
  ['Gruzdintos bulvytės', 'French fries', 312, 3.4, 41, 15],
  ['Cepelinas', 'Cepelinai (potato dumpling)', 190, 8, 22, 8, 'vnt.', 'pc', 200],
  ['Bulviniai blynai', 'Potato pancakes', 220, 4, 24, 12, 'vnt.', 'pc', 70],
  ['Kugelis', 'Potato pudding (kugelis)', 180, 5, 18, 10],
  ['Agurkas', 'Cucumber', 15, 0.7, 3.6, 0.1, 'vnt.', 'pc', 120],
  ['Pomidoras', 'Tomato', 18, 0.9, 3.9, 0.2, 'vnt.', 'pc', 120],
  ['Paprika', 'Bell pepper', 26, 1, 6, 0.3, 'vnt.', 'pc', 150],
  ['Morka', 'Carrot', 41, 0.9, 10, 0.2, 'vnt.', 'pc', 70],
  ['Svogūnas', 'Onion', 40, 1.1, 9, 0.1, 'vnt.', 'pc', 100],
  ['Česnakas', 'Garlic', 149, 6.4, 33, 0.5, 'skiltelė', 'clove', 4],
  ['Kopūstas', 'Cabbage', 25, 1.3, 6, 0.1],
  ['Rauginti kopūstai', 'Sauerkraut', 19, 0.9, 4.3, 0.1],
  ['Brokoliai', 'Broccoli', 34, 2.8, 7, 0.4],
  ['Žiedinis kopūstas', 'Cauliflower', 25, 1.9, 5, 0.3],
  ['Burokėliai (virti)', 'Beetroot (cooked)', 44, 1.7, 10, 0.2],
  ['Salotos', 'Lettuce', 15, 1.4, 2.9, 0.2],
  ['Špinatai', 'Spinach', 23, 2.9, 3.6, 0.4],
  ['Cukinija', 'Courgette', 17, 1.2, 3.1, 0.3],
  ['Pievagrybiai', 'Mushrooms', 22, 3.1, 3.3, 0.3],
  ['Žirneliai (žali)', 'Green peas', 81, 5.4, 14, 0.4],
  ['Kukurūzai (konservuoti)', 'Sweet corn (canned)', 86, 3.2, 19, 1.2],
  ['Šparaginės pupelės', 'Green beans', 31, 1.8, 7, 0.2],
  ['Raugintas agurkas', 'Pickled cucumber', 12, 0.5, 2, 0.2, 'vnt.', 'pc', 60],
  ['Avokadas', 'Avocado', 160, 2, 8.5, 14.7, 'vnt.', 'pc', 150],
  // ankštiniai
  ['Lęšiai (virti)', 'Lentils (cooked)', 116, 9, 20, 0.4],
  ['Avinžirniai (virti)', 'Chickpeas (cooked)', 164, 8.9, 27, 2.6],
  ['Pupelės (konservuotos)', 'Kidney beans (canned)', 100, 6.7, 17, 0.5],
  ['Humusas', 'Hummus', 166, 7.9, 14, 9.6, 'šaukštas', 'tbsp', 15],
  ['Tofu', 'Tofu', 76, 8, 1.9, 4.8],
  // vaisiai, uogos
  ['Obuolys', 'Apple', 52, 0.3, 14, 0.2, 'vnt.', 'pc', 180],
  ['Bananas', 'Banana', 89, 1.1, 23, 0.3, 'vnt.', 'pc', 120],
  ['Apelsinas', 'Orange', 47, 0.9, 12, 0.1, 'vnt.', 'pc', 160],
  ['Mandarinas', 'Mandarin', 53, 0.8, 13, 0.3, 'vnt.', 'pc', 80],
  ['Kriaušė', 'Pear', 57, 0.4, 15, 0.1, 'vnt.', 'pc', 170],
  ['Vynuogės', 'Grapes', 69, 0.7, 18, 0.2],
  ['Braškės', 'Strawberries', 32, 0.7, 7.7, 0.3],
  ['Mėlynės', 'Blueberries', 57, 0.7, 14, 0.3],
  ['Avietės', 'Raspberries', 52, 1.2, 12, 0.7],
  ['Vyšnios', 'Cherries', 50, 1, 12, 0.3],
  ['Arbūzas', 'Watermelon', 30, 0.6, 7.6, 0.2],
  ['Kivis', 'Kiwi', 61, 1.1, 15, 0.5, 'vnt.', 'pc', 75],
  ['Slyvos', 'Plums', 46, 0.7, 11, 0.3, 'vnt.', 'pc', 60],
  ['Ananasas', 'Pineapple', 50, 0.5, 13, 0.1],
  ['Džiovintos slyvos', 'Prunes', 240, 2.2, 64, 0.4],
  ['Razinos', 'Raisins', 299, 3.1, 79, 0.5],
  ['Datulės', 'Dates', 282, 2.5, 75, 0.4, 'vnt.', 'pc', 8],
  // riešutai, sėklos
  ['Graikiniai riešutai', 'Walnuts', 654, 15, 14, 65],
  ['Migdolai', 'Almonds', 579, 21, 22, 50],
  ['Lazdyno riešutai', 'Hazelnuts', 628, 15, 17, 61],
  ['Žemės riešutai', 'Peanuts', 567, 26, 16, 49],
  ['Anakardžiai', 'Cashews', 553, 18, 30, 44],
  ['Saulėgrąžos (luptos)', 'Sunflower seeds', 584, 21, 20, 51],
  ['Moliūgų sėklos', 'Pumpkin seeds', 559, 30, 11, 49],
  ['Žemės riešutų sviestas', 'Peanut butter', 588, 25, 20, 50, 'šaukštas', 'tbsp', 16],
  ['Chia sėklos', 'Chia seeds', 486, 17, 42, 31, 'šaukštas', 'tbsp', 12],
  // aliejai, padažai
  ['Alyvuogių aliejus', 'Olive oil', 884, 0, 0, 100, 'šaukštas', 'tbsp', 13],
  ['Saulėgrąžų aliejus', 'Sunflower oil', 884, 0, 0, 100, 'šaukštas', 'tbsp', 13],
  ['Majonezas', 'Mayonnaise', 680, 1, 1, 75, 'šaukštas', 'tbsp', 15],
  ['Lengvas majonezas', 'Light mayonnaise', 290, 0.8, 7, 28, 'šaukštas', 'tbsp', 15],
  ['Kečupas', 'Ketchup', 112, 1.3, 26, 0.2, 'šaukštas', 'tbsp', 15],
  ['Garstyčios', 'Mustard', 66, 4.4, 5.8, 3.3, 'arbat. šaukštelis', 'tsp', 5],
  ['Česnakinis padažas', 'Garlic sauce', 420, 1.5, 6, 43, 'šaukštas', 'tbsp', 15],
  ['Pomidorų padažas', 'Tomato sauce', 50, 1.5, 9, 1],
  ['Sojų padažas', 'Soy sauce', 53, 8, 4.9, 0.6, 'šaukštas', 'tbsp', 15],
  // patiekalai
  ['Šaltibarščiai', 'Cold beet soup', 70, 3, 5, 4],
  ['Barščiai', 'Beetroot soup', 45, 1.5, 6, 1.5],
  ['Vištienos sriuba', 'Chicken soup', 40, 3, 3, 1.5],
  ['Žirnių sriuba', 'Pea soup', 75, 4.5, 10, 2],
  ['Grybų sriuba', 'Mushroom soup', 50, 1.5, 5, 2.5],
  ['Balandėliai', 'Cabbage rolls', 130, 7, 9, 7],
  ['Kotletas (kiaulienos/jautienos)', 'Meat patty (pork/beef)', 250, 15, 9, 17, 'vnt.', 'pc', 100],
  ['Vištienos kotletas', 'Chicken patty', 190, 16, 8, 10, 'vnt.', 'pc', 100],
  ['Koldūnai', 'Meat dumplings', 230, 10, 28, 9],
  ['Varškėčiai', 'Curd pancakes', 220, 12, 22, 9, 'vnt.', 'pc', 60],
  ['Kepta duona su česnaku', 'Fried garlic bread', 450, 8, 45, 27],
  ['Picos gabalas', 'Pizza slice', 266, 11, 33, 10, 'gabalas', 'slice', 110],
  ['Kebabas (lavaše)', 'Kebab wrap', 215, 11, 20, 10, 'vnt.', 'pc', 400],
  ['Mėsainis', 'Burger', 250, 13, 25, 11, 'vnt.', 'pc', 220],
  ['Šašlykas (kiaulienos)', 'Pork shashlik', 260, 22, 2, 18],
  ['Silkė pataluose', 'Herring under a fur coat', 190, 6, 8, 15],
  ['Mišrainė (rusiška salotos)', 'Olivier salad', 200, 5, 10, 16],
  ['Graikiškos salotos', 'Greek salad', 90, 3, 4, 7],
  ['Cezario salotos su vištiena', 'Caesar salad with chicken', 160, 11, 7, 10],
  ['Plovas', 'Pilaf', 180, 8, 22, 7],
  ['Spagečiai bolonija', 'Spaghetti bolognese', 140, 7, 17, 5],
  ['Troškinys su mėsa', 'Meat stew', 120, 9, 8, 6],
  // saldumynai, užkandžiai
  ['Juodasis šokoladas 70 %', 'Dark chocolate 70%', 598, 7.8, 46, 43, 'eilutė', 'row', 20],
  ['Pieninis šokoladas', 'Milk chocolate', 535, 7.7, 59, 30, 'eilutė', 'row', 20],
  ['Saldainis (šokoladinis)', 'Chocolate candy', 500, 5, 60, 27, 'vnt.', 'pc', 12],
  ['Sausainiai', 'Biscuits', 480, 6.5, 70, 20, 'vnt.', 'pc', 10],
  ['Vafliai', 'Wafers', 530, 5, 62, 29],
  ['Bandelė su cinamonu', 'Cinnamon bun', 380, 7, 55, 15, 'vnt.', 'pc', 90],
  ['Spurga', 'Doughnut', 420, 6, 50, 22, 'vnt.', 'pc', 70],
  ['Tortas', 'Cake', 380, 5, 45, 20, 'gabalas', 'piece', 100],
  ['Šakotis', 'Šakotis (tree cake)', 450, 8, 45, 27],
  ['Ledai', 'Ice cream', 207, 3.5, 24, 11, 'porcija', 'scoop', 70],
  ['Bulvių traškučiai', 'Potato chips', 536, 7, 53, 34],
  ['Spraginti kukurūzai', 'Popcorn', 387, 13, 78, 4.5],
  ['Medus', 'Honey', 304, 0.3, 82, 0, 'arbat. šaukštelis', 'tsp', 7],
  ['Cukrus', 'Sugar', 400, 0, 100, 0, 'arbat. šaukštelis', 'tsp', 5],
  ['Uogienė', 'Jam', 250, 0.4, 62, 0.1, 'šaukštas', 'tbsp', 20],
  ['Baltyminis batonėlis', 'Protein bar', 360, 30, 35, 12, 'vnt.', 'pc', 50],
  ['Išrūgų baltymai (milteliai)', 'Whey protein powder', 380, 78, 8, 5, 'samtelis', 'scoop', 30],
  // gėrimai (100 ml)
  ['Kava (juoda)', 'Black coffee', 2, 0.3, 0, 0, 'puodelis', 'cup', 250],
  ['Kava su pienu', 'Coffee with milk', 25, 1.4, 2, 1.2, 'puodelis', 'cup', 250],
  ['Kapučinas', 'Cappuccino', 40, 2.2, 3.5, 2, 'puodelis', 'cup', 250],
  ['Latte', 'Latte', 50, 2.6, 4, 2.5, 'puodelis', 'cup', 350],
  ['Arbata (be cukraus)', 'Tea (unsweetened)', 1, 0, 0.2, 0, 'puodelis', 'cup', 250],
  ['Apelsinų sultys', 'Orange juice', 45, 0.7, 10, 0.2, 'stiklinė', 'glass', 250],
  ['Obuolių sultys', 'Apple juice', 46, 0.1, 11, 0.1, 'stiklinė', 'glass', 250],
  ['Gira', 'Kvass', 27, 0.2, 6.5, 0, 'stiklinė', 'glass', 250],
  ['Kokakola', 'Cola', 42, 0, 10.6, 0, 'skardinė', 'can', 330],
  ['Kokakola Zero', 'Cola Zero', 0.3, 0, 0, 0, 'skardinė', 'can', 330],
  ['Alus', 'Beer', 43, 0.5, 3.6, 0, 'bokalas', 'pint', 500],
  ['Nealkoholinis alus', 'Alcohol-free beer', 25, 0.3, 5, 0, 'bokalas', 'pint', 500],
  ['Raudonas vynas', 'Red wine', 85, 0.1, 2.6, 0, 'taurė', 'glass', 150],
  ['Baltas vynas', 'White wine', 82, 0.1, 2.6, 0, 'taurė', 'glass', 150],
  ['Degtinė', 'Vodka', 231, 0, 0, 0, 'taurelė', 'shot', 40],
  ['Kokteilis su baltymais (pienas + milteliai)', 'Protein shake (milk + powder)', 70, 9, 5, 1.5, 'stiklinė', 'glass', 300],
];

export interface Food {
  id: string;
  lt: string;
  en: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unit?: { lt: string; en: string; g: number };
}

export const FOODS: Food[] = ROWS.map((r, i) => ({
  id: 'f' + i, lt: r[0], en: r[1], kcal: r[2], protein: r[3], carbs: r[4], fat: r[5],
  unit: r[6] && r[7] && r[8] ? { lt: r[6], en: r[7], g: r[8] } : undefined,
}));

/** Mažosios raidės be lietuviškų ženklų: „vištiena“ → „vistiena“. */
export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%., ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const INDEX = FOODS.map((f, i) => ({ f, i, key: norm(f.lt + ' ' + f.en) }));

/** Žodžio kamienas paieškai: lietuviškos galūnės kinta („vištiena“ / „vištienos“), todėl ilgesniems žodžiams nukerpam 2 raides. */
export const stem = (w: string) => (w.length > 4 ? w.slice(0, -2) : w);

/** Paieška: visi užklausos žodžiai (kamienai) turi būti pavadinime; pirmiau – prasidedantys užklausa. */
export function searchFoods(q: string, limit = 20): Food[] {
  const words = norm(q).split(' ').filter(Boolean).map(stem);
  if (!words.length) return [];
  const hits = INDEX.filter((x) => words.every((w) => x.key.includes(w)));
  const first = words[0];
  // Pirmiau – prasidedantys užklausa, tada – pagal sąrašo tvarką (dažnesni produktai sąraše aukščiau)
  const score = (x: typeof INDEX[number]) => (x.key.startsWith(first) ? 0 : x.key.includes(' ' + first) ? 1 : 2) * 1000 + x.i;
  return hits.sort((a, b) => score(a) - score(b)).slice(0, limit).map((x) => x.f);
}
