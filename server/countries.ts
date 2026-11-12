/**
 * Countries outside the war zones, for news that happens (or is said) abroad:
 * "UAE condemns the strike", "У Німеччині затримали…", "Зеленський прибув до ОАЕ".
 * Such posts are shown at that country's capital, like diplomatic news on
 * liveuamap, instead of being dropped or pinned to the channel's home town.
 *
 * Each entry has patterns for English, Ukrainian/Russian (word stems, so
 * inflected forms match) and Arabic, including the capital and well-known
 * cities ("Dubai" → United Arab Emirates).
 */

export interface Country {
  name: string;
  /** shown as the location name */
  capital: string;
  lat: number;
  lng: number;
  en: string;
  cyr: string;
  ar?: string;
}

// prettier-ignore
export const WORLD: Country[] = [
  { name: 'United States', capital: 'Washington', lat: 38.9, lng: -77.04, en: 'United States|U\\.S\\.A?\\.?|USA|US|America|Washington|White House|Pentagon|State Department', cyr: 'США|Сполучен\\S+ Штат|Соединенн\\S+ Штат|Вашингтон|Біл\\S+ дім|Бел\\S+ дом|Пентагон|Держдеп|Госдеп', ar: 'الولايات المتحدة|أمريكا|امريكا|واشنطن|البيت الأبيض|البنتاغون' },
  { name: 'United Kingdom', capital: 'London', lat: 51.5, lng: -0.13, en: 'United Kingdom|UK|Britain|London|Downing Street', cyr: 'Велик\\S+ Британ|Великобритан|Британі|Британи|Лондон', ar: 'بريطانيا|المملكة المتحدة|لندن' },
  { name: 'Germany', capital: 'Berlin', lat: 52.52, lng: 13.4, en: 'Germany|Berlin|Bundestag|Bundeswehr', cyr: 'Німеччин|Германи|Берлін|Берлин|Бундестаг|ФРН|ФРГ', ar: 'ألمانيا|المانيا|برلين' },
  { name: 'France', capital: 'Paris', lat: 48.86, lng: 2.35, en: 'France|Paris|Elysee|Élysée', cyr: 'Франці|Франци|Париж|Єлисейськ|Елисейск', ar: 'فرنسا|باريس' },
  { name: 'Poland', capital: 'Warsaw', lat: 52.23, lng: 21.01, en: 'Poland|Warsaw', cyr: 'Польщ|Польш|Варшав', ar: 'بولندا|وارسو' },
  { name: 'Italy', capital: 'Rome', lat: 41.9, lng: 12.5, en: 'Italy|Rome', cyr: 'Італі|Итали|(?:у|в|до|з|из) Рим', ar: 'إيطاليا|ايطاليا|روما' },
  { name: 'Spain', capital: 'Madrid', lat: 40.42, lng: -3.7, en: 'Spain|Madrid', cyr: 'Іспані|Испани|Мадрид', ar: 'إسبانيا|اسبانيا|مدريد' },
  { name: 'Netherlands', capital: 'The Hague', lat: 52.08, lng: 4.31, en: 'Netherlands|The Hague|Amsterdam|Dutch', cyr: 'Нідерланд|Нидерланд|Гааг|Амстердам', ar: 'هولندا|لاهاي' },
  { name: 'Belgium', capital: 'Brussels', lat: 50.85, lng: 4.35, en: 'Belgium|Brussels|European Commission|European Council|European Parliament|NATO headquarters', cyr: 'Бельгі|Бельги|Брюссел|Єврокомісі|Еврокомисси|Європарламент|Европарламент|Євросовєт|Європейськ\\S+ рад', ar: 'بلجيكا|بروكسل|المفوضية الأوروبية|الاتحاد الأوروبي' },
  { name: 'Switzerland', capital: 'Geneva', lat: 46.2, lng: 6.14, en: 'Switzerland|Geneva|Davos|Bern', cyr: 'Швейцарі|Швейцари|Женев|Давос', ar: 'سويسرا|جنيف' },
  { name: 'Austria', capital: 'Vienna', lat: 48.21, lng: 16.37, en: 'Austria|Vienna|IAEA', cyr: 'Австрі|Австри(?!й)|Відн|Вене|МАГАТЕ|МАГАТЭ', ar: 'النمسا|فيينا' },
  { name: 'Hungary', capital: 'Budapest', lat: 47.5, lng: 19.04, en: 'Hungary|Budapest', cyr: 'Угорщин|Венгри|Будапешт', ar: 'المجر|هنغاريا|بودابست' },
  { name: 'Slovakia', capital: 'Bratislava', lat: 48.15, lng: 17.11, en: 'Slovakia|Bratislava', cyr: 'Словаччин|Словаки|Братислав' },
  { name: 'Czechia', capital: 'Prague', lat: 50.08, lng: 14.43, en: 'Czechia|Czech Republic|Prague', cyr: 'Чехі|Чехи|Праг[аиіу]' },
  { name: 'Romania', capital: 'Bucharest', lat: 44.43, lng: 26.1, en: 'Romania|Bucharest', cyr: 'Румуні|Румыни|Бухарест' },
  { name: 'Bulgaria', capital: 'Sofia', lat: 42.7, lng: 23.32, en: 'Bulgaria|Sofia', cyr: 'Болгарі|Болгари' },
  { name: 'Lithuania', capital: 'Vilnius', lat: 54.69, lng: 25.28, en: 'Lithuania|Vilnius', cyr: 'Литв[аиіуо]|Вільнюс|Вильнюс' },
  { name: 'Latvia', capital: 'Riga', lat: 56.95, lng: 24.11, en: 'Latvia|Riga', cyr: 'Латві|Латви|(?:у|в|до) Ри[гз]' },
  { name: 'Estonia', capital: 'Tallinn', lat: 59.44, lng: 24.75, en: 'Estonia|Tallinn', cyr: 'Естоні|Эстони|Таллінн|Таллин' },
  { name: 'Finland', capital: 'Helsinki', lat: 60.17, lng: 24.94, en: 'Finland|Helsinki', cyr: 'Фінлянді|Финлянди|Гельсінкі|Хельсинки' },
  { name: 'Sweden', capital: 'Stockholm', lat: 59.33, lng: 18.07, en: 'Sweden|Stockholm', cyr: 'Швеці|Швеци|Стокгольм' },
  { name: 'Norway', capital: 'Oslo', lat: 59.91, lng: 10.75, en: 'Norway|Oslo', cyr: 'Норвегі|Норвеги|Осло' },
  { name: 'Denmark', capital: 'Copenhagen', lat: 55.68, lng: 12.57, en: 'Denmark|Copenhagen', cyr: 'Дані[яїює]|Дани[яюией]|Копенгаген' },
  { name: 'Greece', capital: 'Athens', lat: 37.98, lng: 23.73, en: 'Greece|Athens', cyr: 'Греці|Греци|Афін|Афин', ar: 'اليونان|أثينا' },
  { name: 'Serbia', capital: 'Belgrade', lat: 44.79, lng: 20.45, en: 'Serbia|Belgrade', cyr: 'Сербі|Серби|Белград' },
  { name: 'Turkey', capital: 'Ankara', lat: 39.93, lng: 32.86, en: 'Turkey|Türkiye|Turkiye|Ankara|Istanbul', cyr: 'Туреччин|Турци|Анкар|Стамбул', ar: 'تركيا|أنقرة|انقرة|إسطنبول|اسطنبول' },
  { name: 'Georgia', capital: 'Tbilisi', lat: 41.72, lng: 44.79, en: 'Tbilisi', cyr: 'Грузі|Грузи(?!н)|Тбілісі|Тбилиси' },
  { name: 'Armenia', capital: 'Yerevan', lat: 40.18, lng: 44.51, en: 'Armenia|Yerevan', cyr: 'Вірмені|Армени|Єреван|Ереван' },
  { name: 'Azerbaijan', capital: 'Baku', lat: 40.41, lng: 49.87, en: 'Azerbaijan|Baku', cyr: 'Азербайджан|Баку' },
  { name: 'Kazakhstan', capital: 'Astana', lat: 51.17, lng: 71.43, en: 'Kazakhstan|Astana', cyr: 'Казахстан|Астан' },
  { name: 'China', capital: 'Beijing', lat: 39.9, lng: 116.4, en: 'China|Beijing', cyr: 'Кита[йюєяї]|Китае|КНР|Пекін|Пекин', ar: 'الصين|بكين' },
  { name: 'Japan', capital: 'Tokyo', lat: 35.68, lng: 139.69, en: 'Japan|Tokyo', cyr: 'Японі|Япони|Токіо|Токио', ar: 'اليابان|طوكيو' },
  { name: 'North Korea', capital: 'Pyongyang', lat: 39.02, lng: 125.75, en: 'North Korea|Pyongyang|DPRK', cyr: 'КНДР|Північн\\S+ Коре|Северн\\S+ Коре|Пхеньян', ar: 'كوريا الشمالية' },
  { name: 'South Korea', capital: 'Seoul', lat: 37.57, lng: 126.98, en: 'South Korea|Seoul', cyr: 'Південн\\S+ Коре|Южн\\S+ Коре|Сеул', ar: 'كوريا الجنوبية' },
  { name: 'India', capital: 'New Delhi', lat: 28.61, lng: 77.21, en: 'India|New Delhi', cyr: 'Інді[яїює]|Инди[яюией]|Нью-Делі|Нью-Дели', ar: 'الهند|نيودلهي' },
  { name: 'Pakistan', capital: 'Islamabad', lat: 33.69, lng: 73.05, en: 'Pakistan|Islamabad', cyr: 'Пакистан|Ісламабад|Исламабад', ar: 'باكستان|إسلام آباد' },
  { name: 'United Arab Emirates', capital: 'Abu Dhabi', lat: 24.45, lng: 54.38, en: 'United Arab Emirates|UAE|Emirates|Emirati|Abu Dhabi|Dubai', cyr: 'ОАЕ|ОАЭ|Емірат|Эмират|Абу-Дабі|Абу-Даби|Дуба[йїюєяе]', ar: 'الإمارات|الامارات|أبو ظبي|ابوظبي|أبوظبي|دبي' },
  { name: 'Saudi Arabia', capital: 'Riyadh', lat: 24.71, lng: 46.68, en: 'Saudi Arabia|Saudi|Riyadh|Jeddah', cyr: 'Саудівськ|Саудовск|Ер-Ріяд|Эр-Рияд|Джидд', ar: 'السعودية|الرياض' },
  { name: 'Qatar', capital: 'Doha', lat: 25.29, lng: 51.53, en: 'Qatar|Qatari|Doha', cyr: 'Катар|Дох[аиіу]', ar: 'قطر|الدوحة' },
  { name: 'Kuwait', capital: 'Kuwait City', lat: 29.38, lng: 47.99, en: 'Kuwait', cyr: 'Кувейт', ar: 'الكويت' },
  { name: 'Bahrain', capital: 'Manama', lat: 26.23, lng: 50.59, en: 'Bahrain|Manama', cyr: 'Бахрейн', ar: 'البحرين|المنامة' },
  { name: 'Oman', capital: 'Muscat', lat: 23.59, lng: 58.41, en: 'Oman|Muscat', cyr: 'Оман|Маскат', ar: 'سلطنة عمان|مسقط' },
  { name: 'Egypt', capital: 'Cairo', lat: 30.04, lng: 31.24, en: 'Egypt|Egyptian|Cairo|Sharm el-Sheikh', cyr: 'Єгип[те]|Египет|Египт|Каїр|Каир', ar: 'مصر|القاهرة|شرم الشيخ' },
  { name: 'Jordan', capital: 'Amman', lat: 31.95, lng: 35.93, en: 'Jordan|Jordanian|Amman', cyr: 'Йордані|Иордани|Амман', ar: 'الأردن|الاردن|عمّان' },
  { name: 'Algeria', capital: 'Algiers', lat: 36.75, lng: 3.06, en: 'Algeria|Algiers', cyr: 'Алжир', ar: 'الجزائر' },
  { name: 'Libya', capital: 'Tripoli', lat: 32.89, lng: 13.19, en: 'Libya', cyr: 'Ліві[яїює]|Ливи[яюией]', ar: 'ليبيا' },
  { name: 'Sudan', capital: 'Khartoum', lat: 15.5, lng: 32.56, en: 'Sudan|Khartoum', cyr: 'Судан', ar: 'السودان|الخرطوم' },
  { name: 'South Africa', capital: 'Pretoria', lat: -25.75, lng: 28.19, en: 'South Africa|Pretoria', cyr: 'ПАР|ЮАР|Південн\\S+ Африк|Южн\\S+ Африк', ar: 'جنوب أفريقيا|جنوب افريقيا' },
  { name: 'Canada', capital: 'Ottawa', lat: 45.42, lng: -75.7, en: 'Canada|Ottawa', cyr: 'Канад|Оттав', ar: 'كندا' },
  { name: 'Brazil', capital: 'Brasília', lat: -15.79, lng: -47.88, en: 'Brazil|Brasilia', cyr: 'Бразилі|Бразили', ar: 'البرازيل' },
  { name: 'Venezuela', capital: 'Caracas', lat: 10.48, lng: -66.9, en: 'Venezuela|Caracas', cyr: 'Венесуел|Каракас', ar: 'فنزويلا' },
  { name: 'Australia', capital: 'Canberra', lat: -35.28, lng: 149.13, en: 'Australia|Canberra', cyr: 'Австралі|Австрали', ar: 'أستراليا|استراليا' },
  { name: 'Ireland', capital: 'Dublin', lat: 53.35, lng: -6.26, en: 'Ireland|Dublin', cyr: 'Ірланді|Ирланди|Дублін|Дублин', ar: 'أيرلندا|ايرلندا' },
  { name: 'United Nations', capital: 'New York (UN)', lat: 40.75, lng: -73.97, en: 'United Nations|UN Security Council|Security Council|UN General Assembly|UN Secretary[- ]General|Guterres', cyr: 'Радбез|Совбез|Рад\\S+ Безпеки ООН|Совет\\S+ Безопасности ООН|Генасамбле|Генассамбле|Гутерріш|Гутерриш', ar: 'مجلس الأمن(?! القومي)|الأمم المتحدة|غوتيريش' },
];

/** Parties to the wars covered: their statements are about the front, not about home. */
export const PARTIES = new Set(['Ukraine', 'Russia', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Yemen', 'Iran', 'Iraq']);

interface Compiled {
  country: Country;
  /** "in / to the country": something happening there */
  locative: RegExp[];
  /** the country near the very start of the text: "UAE condemns…", "МЗС ОАЕ заявило…" */
  opening: RegExp[];
}

// Cyrillic and English names are matched case-sensitively: country names are
// capitalised, and "US" / "Оман" must not match "us" / "омана".
const NOT_CYR_BEFORE = '(?<![А-Яа-яІЇЄҐіїєґЁё])';
const NOT_LATIN = { before: '(?<![A-Za-z])', after: '(?![A-Za-z-])' };
const NOT_ARABIC_AFTER = '(?![\\u0600-\\u06FF])';
/** start of the text, at most a few words in, before any punctuation */
const LEAD = '^[^,;:.!?،\\n]{0,25}';

const COMPILED: Compiled[] = WORLD.map((country) => {
  const en = `${NOT_LATIN.before}(?:${country.en})${NOT_LATIN.after}`;
  const cyr = `${NOT_CYR_BEFORE}(?:${country.cyr})`;
  const ar = country.ar ? `(?:${country.ar})${NOT_ARABIC_AFTER}` : null;
  const locative = [
    new RegExp(`${NOT_CYR_BEFORE}(?:[ВвУу]|[Дд]о|[Нн]а|[Вв]о)\\s+(?:${country.cyr})`, 'u'),
    new RegExp(`${NOT_LATIN.before}(?:[Ii]n|[Vv]isits?|[Aa]rrive[sd]? in)\\s+(?:the\\s+)?(?:${country.en})${NOT_LATIN.after}`, 'u'),
  ];
  // a venue: "Abu Dhabi talks", "Geneva summit"
  locative.push(new RegExp(`${en}\\s+(?:peace \\s*)?(?:talks|summit|meeting|negotiations|conference|round)`, 'u'));
  const opening = [new RegExp(LEAD + cyr, 'u'), new RegExp(LEAD + en, 'u')];
  if (ar) {
    locative.push(new RegExp(`(?:في|إلى|الى)\\s+${ar}|(?<![\\u0600-\\u06FF])ب${ar}`, 'u'));
    opening.push(new RegExp(LEAD + ar, 'u'));
  }
  return { country, locative, opening };
});

const test = (res: RegExp[], text: string) => res.some((re) => re.test(text));

/** Statements, decisions and visits: what a country (or its officials) said or did. */
const STATEMENT =
  /(condemn|denounc|says|said|calls? (for|on)|urges?|announc|warns?|welcom|rejects?|reaffirm|express|pledg|approv|sanction|summon|foreign ministry|minister|president|spokes|will send|to send|deliver|suppl(y|ies)|hosts?|talks|summit|заяв|засуд|осуд|заклика|призва|оголос|объяв|схвал|одобр|запровад|ввел|ввод|нада(сть|ст|ла|ли|є|ет)|передас|переда[лє]|МЗС|МИД|міністр|министр|президент|прем'єр|премьер|канцлер|переговор|саміт|саммит|يدين|تدين|أدان|ادان|يدعو|تدعو|قال|يقول|أعلن|تعلن|يعلن|وزير|الخارجية|رئيس|المتحدث|يحذر|تحذر|يرحب|ترحب|محادثات|قمة)/i;

export interface Abroad {
  country: Country;
  /** how it was found, for the provenance note */
  via: 'speaker' | 'place';
}

/**
 * A country outside the war that the post is about.
 *
 *  - "speaker": the post opens with the country (or its capital / institutions)
 *    saying or doing something — placed there even if it also names towns at the
 *    front ("UAE condemns the strike on Kharkiv").
 *  - "place": something is happening in / someone travels to the country
 *    ("talks in Abu Dhabi", "Geneva summit"). Checked first.
 */
export function findAbroad(text: string): Abroad | null {
  const head = text.trimStart().slice(0, 160);
  // where it happens beats who is quoted: "US, Russia, Ukraine wrap up Abu Dhabi talks"
  for (const c of COMPILED) {
    if (PARTIES.has(c.country.name)) continue;
    if (test(c.locative, text)) return { country: c.country, via: 'place' };
  }
  for (const c of COMPILED) {
    if (PARTIES.has(c.country.name)) continue;
    if (test(c.opening, head) && STATEMENT.test(head)) return { country: c.country, via: 'speaker' };
  }
  return null;
}

/**
 * Which war a text is about. Only reports about one of the two wars are placed
 * abroad; other foreign news (a war in Sudan, bomb threats in Italy) is not.
 */
export function topicOf(text: string): 'ukraine' | 'israel-palestine' | undefined {
  if (/ukrain|russia|kyiv|moscow|kremlin|zelensky|putin|أوكراني|اوكراني|روسي|[а-яіїєґё]/i.test(text)) return 'ukraine';
  if (/israel|gaza|palestin|hamas|hezbollah|west bank|\bidf\b|إسرائيل|اسرائيل|غزة|فلسطين|حماس|حزب الله|الاحتلال|الضفة|ישראל|עזה/i.test(text)) {
    return 'israel-palestine';
  }
  return undefined;
}
