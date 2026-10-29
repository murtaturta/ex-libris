import type {
  Book,
  BookFormat,
  BookLanguageProfile,
  BookUserOverride,
  EnrichedBookMetadata,
  LanguageCode,
} from '../../types/library';

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  EN: 'English',
  TR: 'Turkish',
  FR: 'French',
  DE: 'German',
  RU: 'Russian',
  JA: 'Japanese',
  PL: 'Polish',
  ZH: 'Chinese',
  IT: 'Italian',
  ES: 'Spanish',
  PT: 'Portuguese',
  GRC: 'Ancient Greek',
  KY: 'Kyrgyz',
  IS: 'Icelandic',
  NO: 'Norwegian',
  OTHER: 'Other',
};

export const FORMAT_LABELS: Record<BookFormat, string> = {
  prose: 'Prose',
  'comic-manga': 'Comic / Manga',
  'short-essay': 'Short / Essay',
  'academic-ref': 'Academic / Reference',
};

/**
 * Known creators/illustrators to filter out when inferring translators
 * from book.additionalAuthors.
 */
const NON_TRANSLATOR_CONTRIBUTORS = new Set([
  'ryan ottley',
  'cory walker',
  'charlie adlard',
  'stefano gaudiano',
  'cliff rathburn',
  'quentin blake',
  'takeshi obata',
  'eduardo risso',
  'mary grandpré',
  'mary grandpre',
  'alan lee',
  'doug wheatley',
  'dave gibbons',
  'david lloyd',
  'andy kubert',
  'hideo kojima',
  'bram stoker',
]);

const TURKISH_PUBLISHERS = [
  'yayıncılık',
  'yayınları',
  'yayınevi',
  'kitap',
  'kitabevi',
  'dergah',
  'metis',
  'inkılâp',
  'timaş',
  'yapı kredi',
  'karbon',
  'türk dil kurumu',
  'türk tarih kurumu',
  'basımevi',
  'yayinlari',
];

const TURKISH_TITLE_MARKERS = [
  '(turkish edition)',
  'cilt',
  'üzerine',
  'öyküleri',
  'mektuplar',
  'mor ciglik',
  'tabsira',
];

const FRENCH_PUBLISHERS = [
  'gallimard',
  'livre de poche',
  'grasset',
  'seuil',
  'robert laffont',
  'jc lattès',
  'jc lattes',
  'lattès',
  'lattes',
  'hachette',
  'édito',
  'edito',
  'pocket',
  'ligaran',
  'rouergue',
];

const FRENCH_TITLE_MARKERS = [
  '(french edition)',
  'la ',
  'le ',
  'les ',
  "l'",
  'du contrat',
  'de la terre',
  "et si c'était",
  "rien ne s'oppose",
  'au grand jamais',
  'qui a tué',
  'kilomètre zéro',
];

// Helper to normalize strings (lowercase, trim, collapse whitespace)
function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Strip diacritics for flexible fuzzy matching
function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Comprehensive author origin lookup map.
 * Normalized to lowercase and diacritic-stripped entries.
 */
const AUTHOR_ORIGIN_MAP: Record<string, LanguageCode> = {};

function registerAuthor(name: string, lang: LanguageCode) {
  const norm = normalizeText(name);
  AUTHOR_ORIGIN_MAP[norm] = lang;
  const stripped = stripAccents(norm);
  if (stripped !== norm) {
    AUTHOR_ORIGIN_MAP[stripped] = lang;
  }
}

const AUTHOR_SEEDS: Array<{ lang: LanguageCode; authors: string[] }> = [
  {
    lang: 'JA',
    authors: [
      'Osamu Dazai',
      'Hajime Isayama',
      'Hiroshi Sakurazaka',
      'Ryōsuke Takeuchi',
      'Ryosuke Takeuchi',
      'Hitori Nojima',
      'Junji Ito',
    ],
  },
  {
    lang: 'RU',
    authors: [
      'Fyodor Dostoevsky',
      'Leo Tolstoy',
      'Ivan Goncharov',
      'Dmitry Glukhovsky',
      'Grigory Petrov',
      'Chingiz Aitmatov',
    ],
  },
  {
    lang: 'DE',
    authors: [
      'Franz Kafka',
      'Stefan Zweig',
      'Erich Maria Remarque',
      'Erich Auerbach',
    ],
  },
  {
    lang: 'PL',
    authors: ['Jacek Dukaj', 'Andrzej Sapkowski'],
  },
  {
    lang: 'ZH',
    authors: ['Liu Cixin'],
  },
  {
    lang: 'FR',
    authors: [
      'Jean-Paul Sartre',
      'Albert Camus',
      'Victor Hugo',
      'Émile Zola',
      'Emile Zola',
      'Honoré de Balzac',
      'Honore de Balzac',
      'Michel Houellebecq',
      'Laurent Binet',
      'Delphine de Vigan',
      'Jakuta Alikavazovic',
      'Maud Ankaoua',
      'Dominique Maingueneau',
      'Alexandre Seurat',
      'Amin Maalouf',
      'Antoine de Saint-Exupéry',
      'Pierre Boulle',
      'Édouard Louis',
      'Edouard Louis',
      'Antoine Compagnon',
      'Alfred de Musset',
      'Guy de Maupassant',
      'Jules Verne',
      'Jean-Jacques Rousseau',
      'Michel de Montaigne',
      'Marc Levy',
      'Alexandre Dumas',
    ],
  },
  {
    lang: 'GRC',
    authors: ['Plato', 'Homer'],
  },
  {
    lang: 'ES',
    authors: ['Miguel de Cervantes Saavedra', 'Federico García Lorca'],
  },
  {
    lang: 'IT',
    authors: ['Alba de Céspedes', 'Matteo Casali'],
  },
  {
    lang: 'PT',
    authors: ['José Mauro de Vasconcelos', 'Paulo Coelho'],
  },
  {
    lang: 'NO',
    authors: ['Knut Hamsun'],
  },
  {
    lang: 'IS',
    authors: ['Valdimar Ásmundsson'],
  },
  {
    lang: 'TR',
    authors: [
      'Ahmet Hamdi Tanpınar',
      'Yusuf Atılgan',
      'Reşat Nuri Güntekin',
      'Sabahattin Ali',
      'Afşin Kum',
      'Erman Çağlar',
      'Falih Rıfkı Atay',
      'Aziz Nesin',
      'Halide Edib Adıvar',
      'Akşit Göktürk',
      'Mehmet Rifat',
      'Bahaeddin Ögel',
      'Gülten Dayıoğlu',
      'Serdar Özkan',
      'İlhami Algör',
      'Ahmet Yılmaz Boyunağa',
      'Ahmet Temir',
      'Süleyman Bulut',
      'Ali Budak',
      'Senem Akçay',
      'Saban Ali Imamoglu',
    ],
  },
  {
    lang: 'EN',
    authors: [
      'George Orwell',
      'Frank Herbert',
      'George R.R. Martin',
      'Suzanne Collins',
      'Andy Weir',
      'J.R.R. Tolkien',
      'Oscar Wilde',
      'Mary Wollstonecraft Shelley',
      'Robert A. Heinlein',
      'Philip K. Dick',
      'Isaac Asimov',
      'Harlan Ellison',
      'Robert Kirkman',
      'Alan Moore',
      'Bernard Cornwell',
      'Margaret Atwood',
      'J.K. Rowling',
      'Enid Blyton',
      'John Steinbeck',
      'Ernest Hemingway',
      'F. Scott Fitzgerald',
      'William Shakespeare',
      'Charles Dickens',
      'Jane Austen',
      'Emily Brontë',
      'Charlotte Brontë',
      'Bram Stoker',
      'H.G. Wells',
      'Arthur C. Clarke',
      'Aldous Huxley',
      'Ray Bradbury',
      'William Golding',
      'Harper Lee',
      'J.D. Salinger',
      'Cormac McCarthy',
      'Larry McMurtry',
      'Donna Tartt',
      'Stephen King',
      'Chuck Palahniuk',
      'Agatha Christie',
      'Douglas Adams',
      'Terry Pratchett',
      'Philip Pullman',
      'C.S. Lewis',
      'Roald Dahl',
      'Louisa May Alcott',
      'Mark Twain',
      'Edgar Allan Poe',
      'Jack London',
      'Herman Melville',
      'Robert Louis Stevenson',
      'Lewis Carroll',
      'Jonathan Swift',
      'Daniel Defoe',
      'Thomas More',
      'Christopher Isherwood',
      'P.D. James',
      'Ling Ma',
      'Hernan Diaz',
      'Edward Ashton',
      'Tim O\'Brien',
      'Ted Chiang',
      'John W. Campbell Jr.',
      'J.M. Coetzee',
      'George Saunders',
      'Bret Easton Ellis',
      'Richard Matheson',
      'Forrest Brazeal',
      'Reza Negarestani',
      'Maggie O\'Farrell',
      'Marina Warner',
      'Ernest Callenbach',
      'Kai Bird',
      'Jeff Lindsay',
      'Maria Manuel Lisboa',
      'Stephenie Meyer',
      'Jennifer Lynn Barnes',
      'Victoria A. Fromkin',
      'Cressida Cowell',
      'John Man',
      'Brian Azzarello',
      'Geoff Johns',
      'Crassius Curio',
      'Bethesda Softworks',
      'Timothy Dexter',
      'Mark Dunn',
      'Richard P. Feynman',
      'Richard Sennett',
      'Ivan Illich',
      'Neil A. Stillings',
      'Federal Aviation Administration',
      'Yuval Noah Harari',
    ],
  },
];

for (const group of AUTHOR_SEEDS) {
  for (const author of group.authors) {
    registerAuthor(author, group.lang);
  }
}

/**
 * Normalizes author name and attempts lookup against known world literature canon.
 */
function lookupAuthorOriginalLanguage(author: string): LanguageCode | null {
  if (!author) return null;

  const raw = normalizeText(author);
  if (AUTHOR_ORIGIN_MAP[raw]) {
    return AUTHOR_ORIGIN_MAP[raw];
  }

  const stripped = stripAccents(raw);
  if (AUTHOR_ORIGIN_MAP[stripped]) {
    return AUTHOR_ORIGIN_MAP[stripped];
  }

  // Handle "Lastname, Firstname" format if present
  if (author.includes(',')) {
    const parts = author.split(',').map(p => p.trim());
    if (parts.length === 2) {
      const swapped = normalizeText(`${parts[1]} ${parts[0]}`);
      if (AUTHOR_ORIGIN_MAP[swapped]) return AUTHOR_ORIGIN_MAP[swapped];
      const swappedStripped = stripAccents(swapped);
      if (AUTHOR_ORIGIN_MAP[swappedStripped]) return AUTHOR_ORIGIN_MAP[swappedStripped];
    }
  }

  // Substring or word-contained matches for multi-author strings
  for (const [key, lang] of Object.entries(AUTHOR_ORIGIN_MAP)) {
    if (raw.includes(key) || key.includes(raw)) {
      return lang;
    }
  }

  return null;
}

/**
 * Classifies both reading edition language and original work publication language,
 * deriving translation flows, translator candidates, and format category.
 */
export function classifyBookLanguageAndFormat(
  book: Book,
  override?: BookUserOverride,
  enriched?: EnrichedBookMetadata
): BookLanguageProfile {
  // ==========================================
  // 1. EDITION LANGUAGE (Reading Edition)
  // ==========================================
  let editionLanguage: LanguageCode = 'EN';

  if (override?.editionLanguageOverride) {
    editionLanguage = override.editionLanguageOverride;
  } else {
    const rawIsbn = (book.isbn13 || book.isbn || '').replace(/[^0-9X]/gi, '');
    const pubLower = (book.publisher || '').toLowerCase();
    const titleLower = (book.title || '').toLowerCase();

    let matchedFromIsbn = false;

    // Check edge case publishers & ISBNs first (e.g. Heyne German edition, Edizioni BD Italian edition)
    if (
      rawIsbn.startsWith('9783') ||
      (rawIsbn.length === 10 && rawIsbn.startsWith('3')) ||
      pubLower.includes('heyne')
    ) {
      editionLanguage = 'DE';
      matchedFromIsbn = true;
    } else if (
      rawIsbn.startsWith('97888') ||
      (rawIsbn.length === 10 && rawIsbn.startsWith('88')) ||
      pubLower.includes('edizioni bd')
    ) {
      editionLanguage = 'IT';
      matchedFromIsbn = true;
    } else if (
      rawIsbn.startsWith('978605') ||
      rawIsbn.startsWith('978625') ||
      rawIsbn.startsWith('978975') ||
      rawIsbn.startsWith('9789944') ||
      rawIsbn.startsWith('605') ||
      rawIsbn.startsWith('625') ||
      rawIsbn.startsWith('975') ||
      rawIsbn.startsWith('9944')
    ) {
      editionLanguage = 'TR';
      matchedFromIsbn = true;
    } else if (
      rawIsbn.startsWith('9782') ||
      (rawIsbn.length === 10 && rawIsbn.startsWith('2') && (pubLower.length > 0 || titleLower.length > 0))
    ) {
      editionLanguage = 'FR';
      matchedFromIsbn = true;
    } else if (
      rawIsbn.startsWith('9780') ||
      rawIsbn.startsWith('9781') ||
      rawIsbn.startsWith('9798') ||
      (rawIsbn.length === 10 && (rawIsbn.startsWith('0') || rawIsbn.startsWith('1')))
    ) {
      editionLanguage = 'EN';
      matchedFromIsbn = true;
    }

    if (!matchedFromIsbn) {
      // 3. Publisher & Title lexical rules
      const hasTurkishPublisher = TURKISH_PUBLISHERS.some(p => pubLower.includes(p));
      const hasTurkishCharsOrWords =
        /[ğşıİĞŞI]/.test(book.title || '') ||
        /[ğşıİĞŞI]/.test(book.publisher || '') ||
        TURKISH_TITLE_MARKERS.some(w => titleLower.includes(w) || pubLower.includes(w));

      const hasFrenchPublisher = FRENCH_PUBLISHERS.some(p => pubLower.includes(p));
      const hasFrenchTitle = FRENCH_TITLE_MARKERS.some(
        m => titleLower.startsWith(m) || titleLower.includes(` ${m}`) || titleLower.includes(m)
      );

      if (hasTurkishPublisher || hasTurkishCharsOrWords) {
        editionLanguage = 'TR';
      } else if (hasFrenchPublisher || hasFrenchTitle) {
        editionLanguage = 'FR';
      } else {
        editionLanguage = 'EN';
      }
    }
  }

  // ==========================================
  // 2. ORIGINAL LANGUAGE (Work Original Language)
  // ==========================================
  let originalLanguage: LanguageCode = editionLanguage;

  if (override?.originalLanguageOverride) {
    originalLanguage = override.originalLanguageOverride;
  } else if (enriched?.detectedOriginalLanguage) {
    originalLanguage = enriched.detectedOriginalLanguage;
  } else {
    const mapped = lookupAuthorOriginalLanguage(book.author);
    if (mapped) {
      originalLanguage = mapped;
    } else {
      // Fallback: infer 'TR' if author has Turkish characters (ğ, ş, ı, İ),
      // 'FR' if edition is 'FR' and no additionalAuthors, else editionLanguage
      const authorHasTurkish = /[ğşıİĞŞI]/.test(book.author || '');
      if (authorHasTurkish) {
        originalLanguage = 'TR';
      } else if (editionLanguage === 'FR' && (!book.additionalAuthors || book.additionalAuthors.length === 0)) {
        originalLanguage = 'FR';
      } else {
        originalLanguage = editionLanguage;
      }
    }
  }

  // ==========================================
  // 3. TRANSLATION FLOW & TRANSLATORS
  // ==========================================
  const isTranslation = editionLanguage !== originalLanguage;
  const translationFlow = isTranslation
    ? `${originalLanguage} → ${editionLanguage}`
    : `${editionLanguage} · Original`;

  let translators: string[] = [];
  if (isTranslation && book.additionalAuthors && book.additionalAuthors.length > 0) {
    translators = book.additionalAuthors
      .map(a => a.trim())
      .filter(a => {
        if (!a) return false;
        const lower = a.toLowerCase();
        return !NON_TRANSLATOR_CONTRIBUTORS.has(lower);
      });
  }

  // ==========================================
  // 4. BOOK FORMAT
  // ==========================================
  let format: BookFormat = 'prose';

  if (override?.formatOverride) {
    format = override.formatOverride;
  } else {
    const bindingLower = (book.binding || '').toLowerCase();
    const titleLower = (book.title || '').toLowerCase();
    const pubLower = (book.publisher || '').toLowerCase();
    const authorLower = (book.author || '').toLowerCase();

    const comicKeywords = [
      'kodansha',
      'image comics',
      'dc comics',
      'vertigo',
      'dark horse',
      'viz media',
      'jbc',
      '集英社',
      'attack on titan',
      'invincible',
      'walking dead',
      'watchmen',
      'v for vendetta',
      'flashpoint',
      'batman',
      'junji ito',
      'all you need is kill 1',
    ];

    const academicKeywords = [
      'handbook',
      'introduction to language',
      'cognitive science',
      'dilbilim',
      'göstergebilim',
      'gostergebilim',
      'syntaxe du français',
      'syntaxe du francais',
      'teorinin cini',
      'feynman fizik',
      'türkoloji',
      'turkoloji',
      'türk mitolojisi',
      'turk mitolojisi',
      'mimesis',
      'okuma uğraşı',
      'okuma ugrasi',
      'çeviri: dillerin dili',
      'ceviri: dillerin dili',
      'deschooling society',
      'corrosion of character',
    ];

    const isComic =
      bindingLower.includes('comic') ||
      comicKeywords.some(
        k => pubLower.includes(k) || titleLower.includes(k) || authorLower.includes(k)
      );

    const isAcademic = academicKeywords.some(
      k => titleLower.includes(k) || pubLower.includes(k)
    );

    if (isComic) {
      format = 'comic-manga';
    } else if (isAcademic) {
      format = 'academic-ref';
    } else if (book.pageCount !== null && book.pageCount > 0 && book.pageCount <= 80) {
      format = 'short-essay';
    } else {
      format = 'prose';
    }
  }

  return {
    editionLanguage,
    originalLanguage,
    isTranslation,
    translationFlow,
    translators,
    format,
  };
}
