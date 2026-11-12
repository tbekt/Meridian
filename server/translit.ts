/** Cyrillic / Arabic → Latin transliteration for names (no other dependencies). */

export type Lang = 'uk' | 'ru' | 'ar';

/** Simple Arabic romanisation (no vowel marks in news text, so only consonants and long vowels). */
const AR_LATIN: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'a', ٱ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'dh',
  ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: "'", غ: 'gh', ف: 'f', ق: 'q', ك: 'k',
  ل: 'l', م: 'm', ن: 'n', ه: 'h', ة: 'a', و: 'w', ي: 'y', ى: 'a', ء: "'", ؤ: "'", ئ: "'", پ: 'p', چ: 'ch', گ: 'g',
};

function arabicToLatin(text: string) {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0600-\u06FF]+/g, (word) => {
      const latin = [...word].map((c) => AR_LATIN[c] ?? '').join('');
      return latin.charAt(0).toUpperCase() + latin.slice(1);
    });
}

const UK_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '',
};
const UK_INITIAL: Record<string, string> = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };
const RU_LATIN: Record<string, string> = {
  ...UK_LATIN, г: 'g', е: 'e', и: 'i', й: 'y', ы: 'y', э: 'e', ё: 'yo', ю: 'yu', я: 'ya', х: 'kh', щ: 'shch',
};

/** Latin spelling: Ukrainian national standard (2010), or common Russian romanisation. */
export function transliterate(text: string, lang: Lang): string {
  if (/[\u0600-\u06FF]/.test(text)) text = arabicToLatin(text);
  const table = lang === 'ru' ? RU_LATIN : UK_LATIN;
  let out = '';
  const chars = [...text.replace(/['’ʼ]/g, '')];
  chars.forEach((ch, i) => {
    const lower = ch.toLowerCase();
    if (!(lower in table)) {
      out += ch;
      return;
    }
    const wordStart = i === 0 || !/[а-яіїєґёыэъ]/i.test(chars[i - 1]);
    let lat = lang === 'uk' && wordStart && UK_INITIAL[lower] ? UK_INITIAL[lower] : table[lower];
    if (lang === 'uk' && lower === 'г' && chars[i - 1]?.toLowerCase() === 'з') lat = 'gh'; // зг → zgh
    if (ch !== lower && lat) {
      const nextUpper = chars[i + 1] && chars[i + 1] !== chars[i + 1].toLowerCase();
      lat = nextUpper ? lat.toUpperCase() : lat[0].toUpperCase() + lat.slice(1);
    }
    out += lat;
  });
  return out;
}
