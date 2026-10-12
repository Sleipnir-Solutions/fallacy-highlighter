// Local engine: phrase-pattern cues that often accompany specific fallacies.
// It runs entirely in the browser with no API key. It is a weak detector by design:
// it only sees surface wording, so every finding is labelled as a "pattern cue"
// with modest confidence. Patterns are case-insensitive and matched per sentence.

import { FALLACY_BY_KEY } from '../taxonomy.js';

// [key, regex, confidence, why, options]
// options.also: sentence must also match this; options.unless: skip if sentence matches this.
const P = [
  // Ad hominem
  ['ad_hominem', /\b(?:so-called|self-proclaimed|self-styled)\s+(?:experts?|scientists?|journalists?|doctors?|economists?|analysts?)\b/, 0.5,
    'dismissive label aimed at the people rather than their evidence'],
  ['ad_hominem', /\bwhat (?:do|would|did|else would) you expect from (?:a|an|someone|people|him|her|them)\b/, 0.6,
    'dismisses the claim by pointing at who is making it'],
  ['ad_hominem', /\bconsider(?:ing)? the source\b/, 0.5, 'judges the claim by its speaker'],
  ['ad_hominem', /\b(?:idiots?|morons?|imbeciles?|clowns?|lunatics?|cretins?|brainless|halfwits?)\b/, 0.45,
    'an insult appears alongside a response to someone\'s argument',
    { also: /\b(?:argu|claim|plan|idea|says?|said|thinks?|believes?|opinion|point|position|polic|propos|view|theor)/ }],
  ['ad_hominem', /\b(?:shills?|paid off|in the pocket of|bought and paid for)\b/, 0.5,
    'motive attack used in place of addressing the evidence',
    { also: /\b(?:say|says|said|claim|argu|stud|report|research|data)/ }],

  // Tu quoque / whataboutism
  ['tu_quoque', /\b(?:you'?re|you are|he'?s|she'?s|they'?re|they are) (?:one|the ones?|a fine one) to talk\b/, 0.65,
    'deflects by pointing at the speaker\'s own behavior'],
  ['tu_quoque', /\blook who'?s talking\b/, 0.6, 'deflects by pointing at the speaker\'s own behavior'],
  ['tu_quoque', /\bwhat about (?:when|the time|your|his|her|their)\b/, 0.45, 'possible whataboutism: shifts to someone else\'s conduct'],

  // Bandwagon
  ['bandwagon', /\b(?:millions|thousands|billions|hundreds) of (?:people|users|customers|americans|fans|families|voters) (?:can'?t|cannot|can not) (?:all )?be wrong\b/, 0.75,
    'treats popularity as proof'],
  ['bandwagon', /\beveryone (?:knows|agrees|is (?:doing|switching|buying|using|talking about))\b/, 0.5, 'appeals to what "everyone" thinks or does'],
  ['bandwagon', /\b(?:most|all) (?:people|americans|reasonable people|sensible people) (?:agree|know|believe|realize)\b/, 0.45,
    'appeals to majority belief'],
  ['bandwagon', /\bjoin (?:the )?(?:millions|thousands|countless)\b/, 0.5, 'appeals to popularity'],

  // Appeal to (false/vague) authority
  ['appeal_authority', /\b(?:experts|scientists|doctors|studies|research|science) (?:say|says|agree|agrees|show|shows|prove|proves|have shown|has shown|confirm|confirms)\b/, 0.45,
    'cites unnamed experts or studies without saying which',
    { unless: /\b(?:according to|published|journal|university|institute|et al|https?:|\(\d{4}\)|in \d{4})\b/ }],
  ['appeal_authority', /\b(?:\d+ out of \d+ (?:doctors|dentists|experts)|doctor[- ]recommended|as seen on tv)\b/, 0.45,
    'leans on a generic authority endorsement'],
  ['appeal_authority', /\btrust me,? i'?m (?:a|an)\b/, 0.5, 'asks for trust based on a credential rather than reasons'],

  // Appeal to emotion
  ['appeal_emotion', /\bthink (?:of|about) the children\b/, 0.6, 'emotional appeal that may stand in for evidence'],
  ['appeal_emotion', /\b(?:you should be|be very|we should all be|everyone should be) (?:terrified|afraid|scared|outraged|furious|horrified)\b/, 0.5,
    'tells the reader how to feel rather than showing evidence'],
  ['appeal_emotion', /\bif you (?:truly |really )?(?:care|cared|love|loved) (?:about )?(?:your|our|this|the)\b/, 0.5,
    'ties agreement to caring about someone'],
  ['appeal_emotion', /\bhow (?:can|could) anyone (?:with a heart|in their right mind|with a conscience)\b/, 0.5, 'moral pressure in place of an argument'],

  // Appeal to nature / tradition
  ['appeal_nature', /\b(?:all[- ]natural|100% natural|chemical[- ]free|natural)\b[^.?!]{0,50}\b(?:so|therefore|means|which means|that'?s why|thus)\b[^.?!]{0,40}\b(?:safe|healthy|better|good for|harmless)\b/, 0.6,
    'treats "natural" as evidence of safety or benefit'],
  ['appeal_nature', /\b(?:it'?s|it is) (?:only |just )?natural,? so\b/, 0.55, 'treats "natural" as a reason'],
  ['appeal_tradition', /\b(?:we'?ve|we have|it'?s|it has|it'?s been|they'?ve) always (?:been )?(?:done it|done things|been done) (?:this|that) way\b/, 0.6,
    'treats past practice as justification'],
  ['appeal_tradition', /\b(?:for|over) (?:centuries|generations|thousands of years|millennia)\b[^.?!]{0,70}\b(?:so|therefore|must|proves?|clearly|which shows)\b/, 0.5,
    'treats age of a practice as proof it works or is right'],

  // False dilemma
  ['false_dilemma', /\b(?:either you'?re|you'?re either|you are either) with (?:us|me),? or (?:you'?re |you are )?against (?:us|me)\b/, 0.8, 'only two options are offered'],
  ['false_dilemma', /\b(?:there (?:are|is) )?only two (?:options|choices|ways|possibilities|kinds of people|outcomes)\b/, 0.55, 'asserts only two options exist'],
  ['false_dilemma', /\bif you'?re not (?:with us|part of the solution)\b/, 0.6, 'only two options are offered'],
  ['false_dilemma', /\beither\b[^.?!]{3,90}\bor\b[^.?!]{3,90}/, 0.4, 'an either/or framing; check whether other options exist',
    { also: /\b(?:only|must|no other|have to|nothing else|or else|no alternative|no middle)\b/ }],

  // Slippery slope
  ['slippery_slope', /\b(?:next thing you know|before you know it|where (?:does|will) it (?:end|stop))\b/, 0.5, 'implies an unstoppable chain of consequences'],
  ['slippery_slope', /\b(?:will|would) (?:inevitably|eventually|ultimately|surely) lead to\b/, 0.5, 'predicts an extreme end point from a first step'],
  ['slippery_slope', /\bopen(?:s|ing)? the floodgates\b/, 0.5, 'predicts a flood of consequences from one step'],
  ['slippery_slope', /\bif we (?:allow|let|accept|ban|legalize|permit|tolerate)\b[^.?!]{3,100}\b(?:soon|next|then|eventually|before long)\b[^.?!]{3,100}\b(?:will|would|'ll)\b/, 0.55,
    'chains one step to further consequences'],

  // Hasty generalization / anecdote
  ['hasty_generalization', /\b(?:my|a) (?:friend|uncle|aunt|cousin|neighbou?r|grandfather|grandmother|grandma|grandpa|coworker|co-worker|brother|sister|dad|mom|father|mother)\b[^.?!]{0,120}\b(?:so|therefore|which proves|that proves|proof that|which shows)\b/, 0.55,
    'draws a general conclusion from a personal anecdote'],
  ['hasty_generalization', /\bi know (?:a guy|someone|people|a woman|a man) who\b/, 0.4, 'anecdote offered as evidence'],
  ['hasty_generalization', /\b(?:they|those people|these people) (?:are all|all are|always|never)\b/, 0.4, 'sweeping claim about a whole group'],

  // False cause
  ['false_cause', /\bever since\b[^.?!]{3,100}\b(?:has|have|had|went|started|began|got|became)\b/, 0.4, 'sequence in time offered as cause'],
  ['false_cause', /\b(?:right|shortly|immediately|just) after\b[^.?!]{3,100}\b(?:so|therefore|which (?:means|proves|shows)|clearly|obviously)\b/, 0.5,
    'treats "came after" as "caused by"'],
  ['false_cause', /\bcoincidence\?\s*i (?:think|don'?t think) (?:not|so)\b/, 0.6, 'insinuates causation from coincidence'],

  // Appeal to ignorance / burden of proof
  ['appeal_ignorance', /\b(?:no one|nobody|science|scientists) (?:has|have|can|could) (?:ever )?(?:proven|proved|disproven|disproved|shown)\b/, 0.5,
    'lack of proof treated as proof of the opposite'],
  ['appeal_ignorance', /\bthere'?s no (?:evidence|proof) (?:that )?(?:it|this|they|he|she) (?:isn'?t|doesn'?t|is not|does not|aren'?t|wasn'?t|didn'?t)\b/, 0.6,
    'lack of disproof treated as proof'],
  ['appeal_ignorance', /\b(?:can'?t|cannot|can not) (?:prove|disprove|show) (?:that )?(?:it|this|they|he|she)\b[^.?!]{0,40}\b(?:isn'?t|doesn'?t|wasn'?t|didn'?t|aren'?t|is not|does not)\b/, 0.6,
    'lack of disproof treated as proof'],
  ['burden_of_proof', /\bprove (?:me|us|it) wrong\b/, 0.6, 'shifts the burden of proof to the other side'],
  ['burden_of_proof', /\b(?:prove|show me) (?:that )?(?:it|this|they|he|she|i) (?:isn'?t|doesn'?t|didn'?t|wasn'?t|is not|does not|am not|'?m not)\b/, 0.6,
    'asks others to disprove the claim'],
  ['burden_of_proof', /\b(?:until|unless) (?:you|someone|they|anyone) (?:can )?prove (?:otherwise|it wrong|me wrong)\b/, 0.55, 'shifts the burden of proof'],
  ['burden_of_proof', /\bdo your (?:own )?research\b/, 0.4, 'shifts the work of supporting the claim to the reader'],

  // No true Scotsman / begging the question / loaded question
  ['no_true_scotsman', /\bno (?:true|real|genuine|self-respecting) [a-z]+(?: [a-z]+)? (?:would|could|should|ever|will)\b/, 0.65,
    'defines the group to exclude counterexamples'],
  ['begging_question', /\b(?:because|since) (?:it|the (?:bible|book|article|report|website|source|text|law)) says so\b/, 0.6, 'the source is used to vouch for itself'],
  ['loaded_question', /\bhave you stopped\b[^?]{0,60}\?/, 0.6, 'the question presupposes a disputed claim'],
  ['loaded_question', /\b(?:why|when) (?:do|does|did|will|won'?t|haven'?t|hasn'?t|don'?t|doesn'?t) (?:you|they|he|she|the [a-z]+|this [a-z]+) (?:keep|continue to|still|stop|always) [a-z]+\b[^?]{0,80}\?/, 0.45,
    'the question presupposes a disputed claim'],

  // Straw man
  ['straw_man', /\bso (?:what )?(?:you'?re|you are|they'?re|they are|he'?s|she'?s) (?:really |basically |actually |just )?saying\b/, 0.5, 'restates the other side, possibly in a distorted form'],
  ['straw_man', /\b(?:they|liberals|conservatives|the left|the right|democrats|republicans|environmentalists|activists|critics|vegans) (?:just |only |really )?want (?:to|us to|you to) (?:destroy|ban|take away|eliminate|abolish|control|ruin)\b/, 0.5,
    'attributes an extreme aim to the other side'],

  // Middle ground / gambler's / scapegoating / genetic
  ['middle_ground', /\bthe (?:truth|answer|right answer) (?:\w+ ){0,2}(?:is|lies|lie|be) (?:\w+ )?(?:in the middle|in between|between (?:the|both|them))\b/, 0.55, 'assumes the midpoint must be right'],
  ['gamblers_fallacy', /\b(?:is|are|'s|'re) (?:due|overdue) (?:for|to)\b/, 0.5, 'past outcomes treated as changing future odds',
    { also: /\b(?:win|lose|luck|lucky|streak|jackpot|hit|crash|rally|bounce|correction|turn)\b/ }],
  ['gamblers_fallacy', /\b(?:law of averages|bound to (?:win|hit|come up|change))\b/, 0.5, 'past outcomes treated as changing future odds'],
  ['scapegoating', /\b(?:it'?s all|all) (?:because of|(?:the )?fault of) (?:the )?(?:immigrants|foreigners|elites|bankers|millennials|boomers|liberals|conservatives|media|globalists|government)\b/, 0.6,
    'blames a complex problem on one group'],
  ['scapegoating', /\b(?:to blame for|responsible for) (?:everything|all (?:of )?(?:our|this|these|the))\b/, 0.5, 'blames a complex problem on one cause'],
  ['genetic', /\b(?:came|comes) from (?:a|an|the)\b[^.?!]{0,60}\b(?:so|therefore)\b[^.?!]{0,40}\b(?:false|wrong|a lie|lies|can'?t be trusted|nonsense|propaganda)\b/, 0.55,
    'judges the claim by where it came from']
];


const PATTERNS = P.map(([key, re, conf, why, opts = {}]) => ({
  key, conf, why,
  re: new RegExp(re.source, 'gi'),
  also: opts.also ? new RegExp(opts.also.source, 'i') : null,
  unless: opts.unless ? new RegExp(opts.unless.source, 'i') : null
}));

const ABBR = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'inc', 'ltd', 'co',
  'corp', 'u.s', 'u.k', 'gen', 'gov', 'sen', 'rep', 'rev', 'no', 'fig', 'approx', 'mt', 'ft', 'jan', 'feb', 'mar', 'apr',
  'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);

function sentenceSpans(text) {
  const spans = [];
  const push = (s, e) => {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) spans.push({ start: s, end: e });
  };
  const re = /[.!?]+["'”’)\]]*(?=\s|$)/g;
  let start = 0, m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    if (m[0][0] === '.' && m[0].length === 1) {
      const prev = text.slice(start, m.index).match(/(\S+)$/);
      const word = prev ? prev[1].toLowerCase().replace(/^[("'“‘]+/, '') : '';
      if (ABBR.has(word) || /^[a-z]$/.test(word) || /^(?:[a-z]\.)+[a-z]$/.test(word)) continue; // abbreviation / initial
      const next = text.slice(end).match(/^\s+(\S)/);
      if (next && /[a-z]/.test(next[1])) continue; // next word lower-case: not a sentence end
    }
    push(start, end);
    start = end;
  }
  push(start, text.length);
  return spans;
}

function quoteFor(text, span, matchStart, matchEnd) {
  let { start, end } = span;
  if (end - start > 300) {
    start = Math.max(span.start, matchStart - 120);
    end = Math.min(span.end, matchEnd + 120);
    // snap to word boundaries
    while (start > span.start && /\S/.test(text[start - 1])) start--;
    while (end < span.end && /\S/.test(text[end])) end++;
  }
  return text.slice(start, end).trim();
}

export function analyzeLocally(blocks, { maxChars = 50000 } = {}) {
  const findings = [];
  let used = 0, n = 0, truncated = false;
  for (const b of blocks) {
    if (used >= maxChars) { truncated = true; break; }
    const text = b.text.slice(0, maxChars - used);
    used += text.length;
    // Same-length copy with curly apostrophes straightened, so indices still line up.
    const scan = text.replace(/[‘’ʼ]/g, "'");
    const sents = sentenceSpans(text);
    const bySentence = new Map();
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(scan))) {
        const s = sents.find(sp => m.index >= sp.start && m.index < sp.end) || { start: m.index, end: m.index + m[0].length };
        const sentence = scan.slice(s.start, s.end);
        if (p.also && !p.also.test(sentence)) continue;
        if (p.unless && p.unless.test(sentence)) continue;
        const k = `${s.start}:${s.end}`;
        let f = bySentence.get(k);
        if (!f) {
          f = { quote: quoteFor(text, s, m.index, m.index + m[0].length), hits: [] };
          bySentence.set(k, f);
        }
        if (!f.hits.some(h => h.key === p.key)) f.hits.push({ key: p.key, conf: p.conf, why: p.why, cue: m[0] });
      }
    }
    for (const f of bySentence.values()) {
      f.hits.sort((a, b) => b.conf - a.conf);
      const top = f.hits[0];
      const def = FALLACY_BY_KEY[top.key];
      findings.push({
        id: `l${n++}`,
        blockId: b.id,
        quote: f.quote,
        family: def.family,
        labels: f.hits.slice(0, 2).map(h => ({ key: h.key, name: FALLACY_BY_KEY[h.key].name })),
        confidence: Math.min(0.7, top.conf + (f.hits.length > 1 ? 0.05 : 0)),
        explanation: `Pattern cue "${top.cue.trim()}": ${top.why}. Wording alone can't confirm a fallacy; read the surrounding argument.`,
        question: def.question,
        counter: def.counter,
        def: def.def,
        attribution: '',
        source: 'local'
      });
    }
  }
  return { findings, truncated, totalChars: used };
}
