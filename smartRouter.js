/**
 * SMART ROUTER
 * ------------
 * Decides whether an incoming WhatsApp message can be answered locally
 * (instant, free, 100% accurate) or needs to be forwarded to the AI.
 *
 * Order of checks:
 *   1. Messages that clearly need AI (long, multi-question, context replies like "haan")
 *   2. Fixed intents: greeting, thanks, contact/address, phone number shared (lead)
 *   3. Course-specific fee / duration / syllabus questions (from courses.json)
 *   4. Knowledge Base fuzzy match (questions + keywords added from dashboard)
 *   5. Course list
 *   6. Everything else -> AI
 *
 * Returns { handled: true, reply, source, reason } or { handled: false, reason }.
 */

const CONTACT_PHONE = '+91 6280458005';
const CONTACT_ADDRESS = 'SCO 19, Sector 11, Panchkula, Haryana 134109';

// ---------- Text normalisation ----------

// Common Hinglish / spelling variants -> one canonical word
const SYNONYMS = {
  fees: 'fee', fess: 'fee', fes: 'fee', fis: 'fee', fiss: 'fee', charges: 'fee', charge: 'fee',
  price: 'fee', cost: 'fee', paisa: 'fee', paise: 'fee', amount: 'fee', kharcha: 'fee',
  kitni: 'kitna', kitne: 'kitna', ktna: 'kitna', ktni: 'kitna',
  courses: 'course', cource: 'course', corse: 'course', coarse: 'course', cours: 'course', kors: 'course',
  timings: 'time', timing: 'time', samay: 'time', batch: 'time', batches: 'time',
  certifcate: 'certificate', certificates: 'certificate', certification: 'certificate', certi: 'certificate',
  placment: 'placement', placements: 'placement', naukri: 'job', jobs: 'job',
  internships: 'internship',
  adress: 'address', addres: 'address', location: 'address', loc: 'address', office: 'address', institute: 'address',
  mobile: 'contact', phone: 'contact', number: 'contact', whatsapp: 'contact', call: 'contact',
  designing: 'design', designer: 'design', graphics: 'graphic',
  editing: 'edit', editor: 'edit',
  developement: 'development', develop: 'development', developer: 'development',
  duration: 'duration', months: 'month', mahine: 'month', mahina: 'month',
  syllabus: 'syllabus', silebus: 'syllabus', topics: 'syllabus', curriculum: 'syllabus',
  classes: 'class', clas: 'class',
  offline: 'offline', onlin: 'online',
};

// Words that carry no meaning for matching
const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'do', 'does', 'did', 'you', 'your', 'i', 'me', 'my',
  'we', 'our', 'to', 'of', 'for', 'in', 'on', 'at', 'and', 'or', 'it', 'this', 'that', 'what', 'can', 'will',
  'please', 'pls', 'plz', 'sir', 'mam', 'madam', 'ji', 'any', 'have', 'has', 'with', 'about', 'tell', 'get',
  'there', 'any', 'how', 'much', 'many', 'which', 'want', 'need', 'know', 'give', 'provide', 'some',
  // Hindi / Hinglish / Punjabi (roman)
  'kya', 'kia', 'hai', 'h', 'he', 'hain', 'hai?', 'ho', 'hoga', 'hogi', 'hoti', 'hota', 'hongi', 'honge',
  'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'mai', 'main', 'mujhe', 'muje', 'mera', 'meri', 'mere',
  'aap', 'ap', 'aapka', 'aapki', 'apka', 'apki', 'aapke', 'apke', 'hum', 'hamara', 'hamare', 'tusi', 'tuhada',
  'tuhadi', 'da', 'di', 'de', 'nu', 'naal', 'vich', 'ch', 'te', 'ae', 'aa', 'hega', 'ne',
  'bhi', 'v', 'vi', 'to', 'toh', 'tho', 'na', 'ya', 'aur', 'or', 'ek', 'koi', 'kuch', 'kis', 'kaun', 'kon',
  'kaunsa', 'konsa', 'kehda', 'kehra', 'kithe', 'kidda', 'kive', 'kiven', 'kinni', 'kinne',
  'milega', 'milegi', 'milti', 'milta', 'milenge', 'mil', 'sakta', 'sakti', 'sakte', 'skta', 'skti',
  'batao', 'bataye', 'bataiye', 'btao', 'dasso', 'daso', 'dsso', 'chahiye', 'chaida', 'chahida',
  'karna', 'karni', 'karte', 'krte', 'kar', 'kr', 'lena', 'leni', 'details', 'detail', 'info', 'information',
  'regarding', 'related', 'bare', 'baare', 'baray',
]);

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9ऀ-ॿ਀-੿\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonical(word) {
  if (SYNONYMS[word]) return SYNONYMS[word];
  // light plural stemming: "projects" -> "project"
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) {
    const stem = word.slice(0, -1);
    return SYNONYMS[stem] || stem;
  }
  return word;
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean)
    .map(canonical)
    .filter(w => !STOPWORDS.has(w));
}

function hasAny(tokens, words) {
  return words.some(w => tokens.includes(w));
}

function containsPhrase(normalized, phrases) {
  return phrases.some(p => (' ' + normalized + ' ').includes(' ' + p + ' '));
}

// ---------- Localised fixed replies ----------

function langKey(language) {
  const l = String(language || '').toLowerCase();
  if (l.includes('english')) return 'english';
  if (l.includes('punjabi')) return 'punjabi';
  return 'hinglish'; // Hindi + Hinglish users get Roman Hinglish
}

const TEMPLATES = {
  welcome: {
    english: "👋 Welcome to Digital ORRA! We offer practical training, live projects and placement assistance.\n\nAre you looking for a course to learn, or services to grow your business?",
    hinglish: "👋 Welcome to Digital ORRA! Hum practical learning, live projects aur placement assistance provide karte hain.\n\nKya aap apne liye koi course dekh rahe hain ya phir apne business ko grow karne ke liye services search kar rahe hain?",
    punjabi: "👋 Digital ORRA vich tuhada swagat hai! Asi practical learning, live projects te placement assistance dinde haan.\n\nTusi apne layi koi course dekh rahe ho ja apne business layi services?",
  },
  greetingAgain: {
    english: "Hello again! 😊 How can I help you?",
    hinglish: "Haan ji, bataiye! 😊 Hum aapki kya help kar sakte hain?",
    punjabi: "Haanji, dasso! 😊 Asi tuhadi ki madad kar sakde haan?",
  },
  thanks: {
    english: "You're welcome! 😊 Feel free to message anytime. Can I help you with anything else?",
    hinglish: "Aapka swagat hai! 😊 Kuch aur jaanna ho toh zaroor puchiye.",
    punjabi: "Koi gall nahi ji! 😊 Hor kuch puchhna hove taan zaroor puchho.",
  },
  contact: {
    english: `📞 Phone: ${CONTACT_PHONE}\n📍 Address: ${CONTACT_ADDRESS}\n\nYou can call or message on this number, or share your number and our team will call you.`,
    hinglish: `📞 Phone: ${CONTACT_PHONE}\n📍 Address: ${CONTACT_ADDRESS}\n\nAap is number par call ya message kar sakte hain, ya apna number bata dijiye, hamari team aapko call kar legi.`,
    punjabi: `📞 Phone: ${CONTACT_PHONE}\n📍 Address: ${CONTACT_ADDRESS}\n\nTusi is number te call ja message kar sakde ho, ja apna number dasso, saadi team tuhanu call kar legi.`,
  },
  leadCaptured: {
    english: "Thank you for your interest in Digital ORRA! 🙏 Our team will contact you shortly with complete details.",
    hinglish: "Thank you for your interest in Digital ORRA! 🙏 Hamari team aapse jaldi hi complete details ke saath contact karegi.",
    punjabi: "Digital ORRA vich interest layi shukriya! 🙏 Saadi team tuhanu jaldi hi poori details naal contact karegi.",
  },
};

function t(key, language) {
  return TEMPLATES[key][langKey(language)];
}

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

function courseFeeReply(c, language) {
  const extra = c.includes && c.includes.length ? ` (${c.includes.join(', ')})` : '';
  switch (langKey(language)) {
    case 'english':
      return `*${c.name}* (${c.duration}) — fee is ${formatINR(c.original_fee)}, but right now it's available at a discounted ${formatINR(c.discounted_fee)}${extra}. Installments are also available.\n\nCould you share your name and number so our team can lock the discount for you?`;
    case 'punjabi':
      return `*${c.name}* (${c.duration}) di fee ${formatINR(c.original_fee)} hai, par hun discount naal sirf ${formatINR(c.discounted_fee)}${extra}. Installments di facility vi hai.\n\nApna naam te number dasso, team tuhade layi discount lock kar degi?`;
    default:
      return `*${c.name}* (${c.duration}) ki fee ${formatINR(c.original_fee)} hai, lekin abhi discount ke saath sirf ${formatINR(c.discounted_fee)}${extra}. Installments ka option bhi hai.\n\nAapka naam aur number mil sakta hai taaki team aapke liye discount lock kar de?`;
  }
}

function courseDurationReply(c, language) {
  switch (langKey(language)) {
    case 'english':
      return `*${c.name}* is a ${c.duration} program with 100% practical training. Would you like to know the fee or syllabus?`;
    case 'punjabi':
      return `*${c.name}* ${c.duration} da course hai, poori practical training naal. Fee ja syllabus dassan?`;
    default:
      return `*${c.name}* ${c.duration} ka course hai, 100% practical training ke saath. Fee ya syllabus bhi bataun?`;
  }
}

function courseSyllabusReply(c, language) {
  const list = c.syllabus.map(s => `• ${s}`).join('\n');
  switch (langKey(language)) {
    case 'english':
      return `*${c.name}* (${c.duration}) covers:\n${list}\n\nWould you like to know the fee?`;
    case 'punjabi':
      return `*${c.name}* (${c.duration}) vich eh sikhaya janda hai:\n${list}\n\nFee vi dassan?`;
    default:
      return `*${c.name}* (${c.duration}) mein yeh sikhaya jaata hai:\n${list}\n\nFee bhi bataun?`;
  }
}

function courseListReply(courses, language) {
  const list = courses.map((c, i) => `${i + 1}. ${c.name} (${c.duration})`).join('\n');
  switch (langKey(language)) {
    case 'english':
      return `Here are our courses:\n${list}\n\nWhich one interests you? I'll share the fee and details.`;
    case 'punjabi':
      return `Saade courses eh ne:\n${list}\n\nTuhanu kehda pasand hai? Asi fee te details dass dinde haan.`;
    default:
      return `Hamare courses yeh hain:\n${list}\n\nAapko kaunsa interest karta hai? Hum fee aur details bata dete hain.`;
  }
}

// ---------- Course detection ----------

// Extra short-forms people type
const COURSE_ALIASES = {
  'Basic Digital Marketing': ['basic dm', 'basic digital marketing', 'basic marketing'],
  'Advanced Digital Marketing': ['advance dm', 'advanced dm', 'advance digital marketing', 'advanced digital marketing', 'adm'],
  'Digital Marketing with AI': ['dm with ai', 'dm ai', 'ai marketing', 'digital marketing ai', 'digital marketing with ai', 'ai digital marketing'],
  'Graphic Designing': ['graphic', 'graphic design', 'graphic designing', 'photoshop', 'designing course'],
  'Video Editing': ['video', 'video edit', 'video editing', 'editing course'],
  'Full Stack Web Development': ['full stack', 'fullstack', 'web development', 'web dev', 'website development course', 'mern', 'coding'],
};

/**
 * Returns the single course the message refers to, or null if none / ambiguous.
 */
function detectCourse(normalized, courses) {
  const msgTokens = new Set(normalized.split(' ').map(canonical));
  const scored = courses.map(c => {
    const aliases = (COURSE_ALIASES[c.name] || []).map(normalizeText);
    const aliasHit = containsPhrase(normalized, aliases);
    const nameTokens = normalizeText(c.name).split(' ').map(canonical).filter(w => w !== 'with');
    const hit = nameTokens.filter(w => msgTokens.has(w)).length;
    const score = aliasHit ? 1.5 : hit / nameTokens.length;
    return { course: c, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 1) return null;               // must fully match name or an alias
  if (second && second.score >= best.score) return null;  // ambiguous ("digital marketing" alone)
  return best.course;
}

// ---------- Knowledge Base matching ----------

// Words too common to decide a match on their own
const GENERIC_WORDS = new Set(['course', 'class', 'baad', 'kaise', 'kab', 'kitna', 'hain', 'digital', 'orra']);

function matchKnowledgeBase(text, kbItems) {
  const normalized = normalizeText(text);
  const msgTokens = tokenize(text);
  if (msgTokens.length === 0) return null;

  const candidates = [];
  for (const kb of kbItems) {
    const qTokens = [...new Set(tokenize(kb.question))];
    const keywords = (kb.keywords || []).map(normalizeText).filter(Boolean);

    // Keyword phrase written by admin appears in the message => strong match
    const keywordHit = keywords.length > 0 && containsPhrase(normalized, keywords);

    const qSet = new Set([...qTokens, ...keywords.flatMap(k => k.split(' ').map(canonical))]);
    const shared = [...new Set(msgTokens)].filter(w => qSet.has(w));
    const overlap = shared.length;
    // At least one shared word must be specific (not just "course"/"class")
    const specificOverlap = shared.filter(w => !GENERIC_WORDS.has(w)).length;
    const qCoverage = qTokens.length ? overlap / qTokens.length : 0;
    const msgCoverage = overlap / new Set(msgTokens).size;

    let score = 0;
    if (keywordHit) score = 1 + msgCoverage;
    else if (specificOverlap === 0) score = 0;
    else if (overlap >= 2 && (qCoverage >= 0.6 || msgCoverage >= 0.75)) score = (qCoverage + msgCoverage) / 2;
    else if (overlap >= 1 && msgTokens.length <= 2 && msgCoverage === 1) score = 0.6 + qCoverage * 0.2;

    if (score > 0) candidates.push({ kb, score });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  // Two answers almost equally likely -> let AI decide
  if (candidates[1] && candidates[0].score - candidates[1].score < 0.1) return null;
  return candidates[0].kb;
}

// ---------- Main router ----------

const GREETINGS = ['hi', 'hii', 'hiii', 'hello', 'hlo', 'helo', 'hey', 'heyy', 'namaste', 'namaskar', 'sat sri akal',
  'sat shri akal', 'ssa', 'good morning', 'good afternoon', 'good evening', 'gm', 'hello ji', 'hi ji', 'hlo ji', 'hy'];
const THANKS = ['thanks', 'thank you', 'thanku', 'thankyou', 'thnx', 'thx', 'ty', 'dhanyavad', 'dhanyawad',
  'shukriya', 'thank u', 'ok thanks', 'okay thanks', 'ok thank you', 'thanks ji', 'thank you ji'];
// Short answers whose meaning depends on the previous question -> AI must handle
const CONTEXT_REPLIES = ['yes', 'no', 'haan', 'han', 'ha', 'nahi', 'nhi', 'na', 'ok', 'okay', 'k', 'hmm', 'hm',
  'theek', 'thik', 'ji', 'haanji', 'hanji', 'sure', 'acha', 'achha', 'accha'];

function isOnlyGreeting(normalized) {
  // "hi", "hello ji", "hlo sir", "hi good morning"
  const stripped = normalized.replace(/\b(sir|mam|madam|ji|there|team|digital orra|orra)\b/g, '').replace(/\s+/g, ' ').trim();
  if (GREETINGS.includes(stripped)) return true;
  const words = stripped.split(' ');
  return words.length <= 3 && words.every(w => GREETINGS.includes(w) || ['good', 'morning', 'evening', 'afternoon'].includes(w));
}

/**
 * @param {object} p
 * @param {string} p.text      incoming message
 * @param {object} p.session   mongoose session doc (history, language)
 * @param {Array}  p.kbItems   knowledge base docs
 * @param {Array}  p.courses   courses.json data
 */
function routeMessage({ text, session, kbItems = [], courses = [] }) {
  const language = session && session.language;
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(Boolean);
  const tokens = tokenize(text);
  const assistantMsgs = (session && session.history || []).filter(m => m.role === 'assistant').length;

  if (!normalized) return { handled: false, reason: 'empty/emoji-only message' };

  // 1) Clearly needs AI
  if (words.length > 25) return { handled: false, reason: 'long message' };
  if ((text.match(/\?/g) || []).length > 1) return { handled: false, reason: 'multiple questions' };

  // 2a) Phone number shared => lead captured
  const digits = text.replace(/[\s\-()+]/g, '');
  const phoneMatch = digits.match(/(?:91)?[6-9]\d{9}/);
  if (phoneMatch && words.length <= 8) {
    return { handled: true, reply: t('leadCaptured', language), source: 'rule', reason: 'lead: phone number shared', lead: phoneMatch[0] };
  }

  // 2b) Greeting
  if (isOnlyGreeting(normalized)) {
    return {
      handled: true,
      reply: assistantMsgs === 0 ? t('welcome', language) : t('greetingAgain', language),
      source: 'rule',
      reason: 'greeting',
    };
  }

  // 2c) Thanks
  if (THANKS.includes(normalized) || THANKS.includes(normalized.replace(/\b(sir|mam|ji|so much|a lot)\b/g, '').trim())) {
    return { handled: true, reply: t('thanks', language), source: 'rule', reason: 'thanks' };
  }

  // 2d) Context-dependent short replies -> AI knows what "haan" refers to
  if (words.length <= 2 && words.every(w => CONTEXT_REPLIES.includes(w))) {
    return { handled: false, reason: 'context reply (needs conversation memory)' };
  }

  // 2e) Contact / address
  const asksContact = hasAny(tokens, ['contact', 'address']) || containsPhrase(normalized, ['kaha hai', 'kahan hai', 'kithe hai', 'where are you', 'kaha ho', 'kahan ho', 'kithe ho']);
  if (asksContact && words.length <= 12 && !hasAny(tokens, ['fee', 'course', 'syllabus'])) {
    return { handled: true, reply: t('contact', language), source: 'rule', reason: 'contact/address' };
  }

  // 3) Course-specific questions
  const course = detectCourse(normalized, courses);
  if (course && words.length <= 15) {
    const asksDuration = hasAny(tokens, ['duration', 'month', 'long', 'lamba', 'din', 'days', 'time']) && !hasAny(tokens, ['class', 'morning', 'evening']);
    const asksFee = hasAny(tokens, ['fee', 'discount', 'installment', 'emi']) || (hasAny(tokens, ['kitna']) && !asksDuration);
    if (asksFee) {
      return { handled: true, reply: courseFeeReply(course, language), source: 'course', reason: `fee: ${course.name}` };
    }
    if (asksDuration) {
      return { handled: true, reply: courseDurationReply(course, language), source: 'course', reason: `duration: ${course.name}` };
    }
    if (hasAny(tokens, ['syllabus', 'sikhate', 'sikhaya', 'sikhoge', 'learn', 'cover', 'content', 'padhate'])) {
      return { handled: true, reply: courseSyllabusReply(course, language), source: 'course', reason: `syllabus: ${course.name}` };
    }
  }

  // 4) Knowledge Base
  if (words.length <= 15) {
    const kb = matchKnowledgeBase(text, kbItems);
    if (kb) return { handled: true, reply: kb.answer, source: 'kb', reason: `KB: "${kb.question}"` };
  }

  // 5) Course list
  const asksCourseList = hasAny(tokens, ['course']) && !course && words.length <= 10 &&
    !hasAny(tokens, ['fee', 'kitna', 'duration', 'syllabus', 'job', 'placement', 'certificate', 'online', 'offline', 'time', 'demo', 'best', 'suggest', 'recommend']);
  if (asksCourseList && courses.length) {
    return { handled: true, reply: courseListReply(courses, language), source: 'course', reason: 'course list' };
  }

  // 6) Everything else
  return { handled: false, reason: 'no confident local answer' };
}

module.exports = { routeMessage, normalizeText, tokenize, matchKnowledgeBase, detectCourse };
