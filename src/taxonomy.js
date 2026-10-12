// Fallacy catalog shared by the Claude prompt, the local pattern scanner and the UI.
// Families, definitions and counter-moves paraphrase standard references (the Internet
// Encyclopedia of Philosophy, the Purdue OWL and UNC's Writing Center). Entries marked
// `extra: true` come from misinformation research (scapegoating) or common usage.

export const FAMILIES = {
  formal: {
    label: 'Formal',
    color: '#7c3aed',
    blurb: 'The argument\'s structure is invalid, whatever its content.'
  },
  relevance: {
    label: 'Relevance',
    color: '#e11d48',
    blurb: 'The support feels relevant but does not bear on whether the claim is true.'
  },
  presumption: {
    label: 'Presumption / weak induction',
    color: '#d97706',
    blurb: 'An unjustified assumption, or a conclusion bigger than the evidence supports.'
  },
  ambiguity: {
    label: 'Ambiguity',
    color: '#0891b2',
    blurb: 'A word, phrase or claim is allowed to mean two things at once.'
  }
};

export const FALLACIES = [
  // ---- Formal
  { key: 'affirming_consequent', name: 'Affirming the consequent', family: 'formal',
    def: 'If P then Q; Q; therefore P.',
    counter: 'Name another way Q could be true.',
    question: 'Could something other than P explain Q?' },
  { key: 'denying_antecedent', name: 'Denying the antecedent', family: 'formal',
    def: 'If P then Q; not P; therefore not Q.',
    counter: 'Show that Q can hold without P.',
    question: 'Can Q still be true without P?' },
  { key: 'undistributed_middle', name: 'Undistributed middle', family: 'formal',
    def: 'All A are B; all C are B; therefore all C are A.',
    counter: 'Sharing a trait does not make two groups the same.',
    question: 'Does sharing this one trait really make them the same?' },

  // ---- Relevance
  { key: 'ad_hominem', name: 'Ad hominem', family: 'relevance',
    def: 'An irrelevant attack on the person arguing instead of the argument.',
    counter: '"Suppose that\'s true. Which step of the argument is wrong?"',
    question: 'Even if that is true of the person, which part of their argument is wrong?' },
  { key: 'tu_quoque', name: 'Tu quoque / whataboutism', family: 'relevance',
    def: 'Dismissing a point because the speaker doesn\'t practice it, or deflecting to someone else\'s misdeeds.',
    counter: 'Grant the inconsistency if fair, then return to whether the point is right.',
    question: 'Setting the inconsistency aside, is the original point right or wrong?' },
  { key: 'genetic', name: 'Genetic fallacy', family: 'relevance',
    def: 'Judging a claim by its origin rather than its evidence.',
    counter: 'Treat origin as a reason to check, not a verdict.',
    question: 'Apart from where it came from, what does the evidence show?' },
  { key: 'straw_man', name: 'Straw man', family: 'relevance',
    def: 'Attacking a caricature of someone\'s position instead of what they said.',
    counter: 'Restate the original claim and ask, "Is that what was said?"',
    question: 'Is that what the other side actually said?' },
  { key: 'red_herring', name: 'Red herring', family: 'relevance',
    def: 'Diverting attention from the issue by introducing an irrelevant topic.',
    counter: 'Name the shift and restate the open question.',
    question: 'How does this answer the original question?' },
  { key: 'missing_point', name: 'Missing the point', family: 'relevance',
    def: 'The premises support some conclusion, just not the one claimed.',
    counter: 'Separate premises from conclusion and ask whether they connect.',
    question: 'Do these reasons support this conclusion, or a different one?' },
  { key: 'appeal_emotion', name: 'Appeal to emotion', family: 'relevance',
    def: 'Fear, pity or outrage offered in place of evidence for a claim.',
    counter: 'Acknowledge the feeling, then ask what evidence links it to the conclusion.',
    question: 'Beyond how this feels, what evidence supports the claim?' },
  { key: 'appeal_authority', name: 'Appeal to (false) authority', family: 'relevance',
    def: 'Backing a claim with an authority who lacks relevant expertise, is unnamed, or doesn\'t represent expert consensus.',
    counter: 'Ask: expert in this field? Is there consensus? What is their reasoning?',
    question: 'Who exactly, expert in what, and what is their reasoning?' },
  { key: 'bandwagon', name: 'Bandwagon (ad populum)', family: 'relevance',
    def: 'Treating a claim as true because many people believe or do it, or because "true" members of a group would (appeal to group identity).',
    counter: 'Popularity measures belief, not truth.',
    question: 'What evidence is the crowd relying on?' },
  { key: 'false_equivalence', name: 'False equivalence', family: 'relevance',
    def: 'Implying two sides or things are equivalent when the evidence or stakes are not.',
    counter: 'Ask for the weight of evidence on each side, not just the number of sides.',
    question: 'Is the evidence (or harm) on each side really comparable?' },
  { key: 'moral_equivalence', name: 'Moral equivalence', family: 'relevance',
    def: 'Likening a minor misdeed to a major atrocity, as if the two were equally wrong.',
    counter: 'Put the two acts side by side and compare the actual harm.',
    question: 'Is this act really comparable in harm to what it is compared with?' },
  { key: 'appeal_nature', name: 'Appeal to nature', family: 'relevance', extra: true,
    def: 'Treating "natural" as proof that something is good or safe (or "unnatural" as bad).',
    counter: 'Natural and safe are different properties; ask for evidence on safety itself.',
    question: 'Apart from being natural, what shows it is safe or effective?' },
  { key: 'appeal_tradition', name: 'Appeal to tradition', family: 'relevance', extra: true,
    def: 'Treating long-standing practice as proof that something is right.',
    counter: 'Ask whether the original reasons still hold.',
    question: 'Do the reasons it was done this way still apply?' },

  // ---- Presumption / weak induction
  { key: 'false_dilemma', name: 'False dilemma (either/or)', family: 'presumption',
    def: 'Presenting too few choices as if they were the only ones.',
    counter: 'Name a third option.',
    question: 'Are these really the only options?' },
  { key: 'begging_question', name: 'Begging the question (circular)', family: 'presumption',
    def: 'The support restates or already assumes the conclusion (circular reasoning), including loaded wording that builds the conclusion into the claim ("begging the claim").',
    counter: 'Ask for a reason a doubter would already accept.',
    question: 'What reason would convince someone who doesn\'t already agree?' },
  { key: 'loaded_question', name: 'Loaded question', family: 'presumption',
    def: 'A question that smuggles in a controversial presupposition.',
    counter: 'Reject the premise before answering.',
    question: 'Is the assumption built into this question established?' },
  { key: 'no_true_scotsman', name: 'No true Scotsman', family: 'presumption',
    def: 'Redefining a group to exclude counterexamples and escape refutation.',
    counter: 'Ask for the definition up front and hold the speaker to it.',
    question: 'What is the definition, and was it set before the counterexample?' },
  { key: 'burden_of_proof', name: 'Misplaced burden of proof', family: 'presumption',
    def: 'Demanding others disprove a claim instead of supporting it.',
    counter: 'The person making the claim carries the burden.',
    question: 'What evidence supports the claim in the first place?' },
  { key: 'middle_ground', name: 'Middle ground', family: 'presumption', extra: true,
    def: 'Assuming the truth must lie in the middle between two positions.',
    counter: 'Ask which position the evidence supports, even if it is one extreme.',
    question: 'Why should the midpoint be right rather than either side?' },
  { key: 'hasty_generalization', name: 'Hasty generalization', family: 'presumption',
    def: 'A broad conclusion from too small or unrepresentative a sample (including anecdotes).',
    counter: 'Ask about sample size and representativeness.',
    question: 'How many cases is this based on, and are they representative?' },
  { key: 'cherry_picking', name: 'Cherry picking', family: 'presumption',
    def: 'Presenting only the evidence that supports a conclusion and leaving out what undercuts it.',
    counter: 'Ask for the full data set and the time range chosen.',
    question: 'What does the full data show, not just these examples?' },
  { key: 'false_cause', name: 'False cause / post hoc', family: 'presumption',
    def: 'Concluding one thing caused another, often just because it came first or they co-occur.',
    counter: 'Ask for the mechanism and rule out other causes.',
    question: 'What else could explain this, and what is the mechanism?' },
  { key: 'slippery_slope', name: 'Slippery slope', family: 'presumption',
    def: 'Claiming one step will lead through a chain to an extreme outcome, without support for each link.',
    counter: 'Ask for evidence for each link; the chain is only as strong as its weakest step.',
    question: 'What evidence supports each step of that chain?' },
  { key: 'appeal_ignorance', name: 'Appeal to ignorance', family: 'presumption',
    def: 'Treating lack of proof that something is false as proof that it is true (or vice versa).',
    counter: 'Absence of evidence is weak evidence unless someone looked carefully.',
    question: 'Has anyone actually looked carefully, and what did they find?' },
  { key: 'weak_analogy', name: 'Weak analogy', family: 'presumption',
    def: 'Arguing from a comparison whose items differ in ways that matter.',
    counter: 'List the relevant differences.',
    question: 'Do the two things share the properties that matter here?' },
  { key: 'gamblers_fallacy', name: 'Gambler\'s fallacy', family: 'presumption',
    def: 'Assuming past outcomes change the odds of independent future events.',
    counter: 'Point out the events are independent.',
    question: 'Are these events actually independent of each other?' },
  { key: 'scapegoating', name: 'Scapegoating', family: 'presumption', extra: true,
    def: 'Blaming a complex problem on a single group or person without adequate evidence.',
    counter: 'Ask what other causes contribute and what evidence singles out this group.',
    question: 'What evidence singles out this group, and what other causes are there?' },

  // ---- Ambiguity
  { key: 'equivocation', name: 'Equivocation', family: 'ambiguity',
    def: 'Switching the meaning of a key term mid-argument.',
    counter: 'Pin down the key term and check it means the same thing throughout.',
    question: 'Does the key word mean the same thing in each step?' },
  { key: 'amphiboly', name: 'Amphiboly', family: 'ambiguity',
    def: 'Exploiting a grammatically ambiguous phrase.',
    counter: 'Ask which reading is meant and rephrase.',
    question: 'Which reading of this sentence is meant?' },
  { key: 'accent', name: 'Accent', family: 'ambiguity',
    def: 'Shifting meaning through emphasis.',
    counter: 'Restore neutral emphasis and the surrounding context.',
    question: 'Does the claim still hold with neutral emphasis?' },
  { key: 'composition', name: 'Composition', family: 'ambiguity',
    def: 'Assuming a trait of the parts is a trait of the whole.',
    counter: 'Ask whether the whole has the property independently.',
    question: 'Does the whole really have this property, not just its parts?' },
  { key: 'division', name: 'Division', family: 'ambiguity',
    def: 'Assuming a trait of the whole belongs to each part.',
    counter: 'Ask for evidence about the individual part.',
    question: 'Is this true of each part, not just the whole?' },
  { key: 'contextomy', name: 'Quoting out of context', family: 'ambiguity',
    def: 'Excerpting words so they appear to say something the full passage does not.',
    counter: 'Find and read the full original source.',
    question: 'What does the full original passage say?' },
  { key: 'motte_bailey', name: 'Motte and bailey', family: 'ambiguity',
    def: 'Retreating from a bold claim to a modest one when challenged, then returning to the bold claim.',
    counter: 'Separate the two claims and ask which one is being defended.',
    question: 'Which claim is actually being defended: the bold one or the modest one?' }
];

export const FALLACY_BY_KEY = Object.fromEntries(FALLACIES.map(f => [f.key, f]));

export function familyOf(key, fallback) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (has(FALLACY_BY_KEY, key)) return FALLACY_BY_KEY[key].family;
  return has(FAMILIES, fallback) ? fallback : 'presumption';
}

/** Compact catalog text for the model prompt. */
export function catalogForPrompt() {
  const lines = [];
  for (const [fk, fam] of Object.entries(FAMILIES)) {
    lines.push(`Family "${fk}" (${fam.label}): ${fam.blurb}`);
    for (const f of FALLACIES.filter(x => x.family === fk)) {
      lines.push(`  - ${f.key}: ${f.name}. ${f.def}`);
    }
  }
  lines.push('  - other: none of the above fits; give the conventional name in other_name.');
  return lines.join('\n');
}

export const SENSITIVITY = {
  fewer: { label: 'Fewer flags', min: 0.7 },
  balanced: { label: 'Balanced', min: 0.5 },
  more: { label: 'More flags', min: 0.3 }
};

// USD per million tokens, for the rough cost estimate only (checked 2026-10-03).
export const PRICES = {
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 }
};

export const KNOWN_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recommended)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cheapest, fastest)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' }
];

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-sonnet-5-5',
  engine: 'auto',          // auto | claude | local
  sensitivity: 'balanced', // fewer | balanced | more
  maxChars: 50000,
  preferMain: false,
  apiBase: 'https://api.anthropic.com'
};
