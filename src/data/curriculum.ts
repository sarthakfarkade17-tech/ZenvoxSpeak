import type { CefrLevel } from '../utils/learningLogic';

export interface ConversationScenario {
  id: string;
  title: string;
  subtitle: string;
  level: CefrLevel;
  starterPrompt: string;
  keyPhrases: string[];
  communicationGoal?: string;
}

export type PersonaAppearance =
  | 'maya'
  | 'marcus'
  | 'chloe'
  | 'liam'
  | 'noah'
  | 'sofia'
  | 'ethan'
  | 'aria';

export type PartnerField =
  | 'All Fields'
  | 'Everyday & Social'
  | 'Career & Business'
  | 'Travel & Culture'
  | 'Tech & Science'
  | 'Health & Wellness'
  | 'Arts & Creative';

export const PARTNER_FIELDS: PartnerField[] = [
  'All Fields',
  'Everyday & Social',
  'Career & Business',
  'Travel & Culture',
  'Tech & Science',
  'Health & Wellness',
  'Arts & Creative',
];

export interface PersonaProfile {
  id: PersonaAppearance;
  name: string;
  role: string;
  field: Exclude<PartnerField, 'All Fields'>;
  specialty: string;
  voiceName: 'Zephyr' | 'Charon' | 'Kore' | 'Puck' | 'Fenrir';
  voiceToneLabel: string;
  voiceStyle: string;
  vibe: string;
  defaultStarter: string;
  defaultTopicTitle: string;
  keyPhrases: string[];
  accentHex: string;
  bgTintClass: string;
  borderTintClass: string;
  badgeTextClass: string;
}

export const PERSONA_PROFILES: PersonaProfile[] = [
  {
    id: 'maya',
    name: 'Maya',
    role: 'Warm Everyday Coach',
    field: 'Everyday & Social',
    specialty: 'Natural greetings, friendships, daily stories & warm small talk',
    voiceName: 'Zephyr',
    voiceToneLabel: 'Zephyr · Warm & Friendly',
    voiceStyle: 'Warm, relaxed, upbeat everyday standard English speaker',
    vibe: 'Friendly, empathetic & clear',
    defaultTopicTitle: 'Everyday Life & Warm Catch-Up',
    defaultStarter:
      "Hi there! It's so good to hear from you today. How has your week been treating you so far?",
    keyPhrases: ['So far, so good', 'Catch up with', 'To be honest'],
    accentHex: '#059669',
    bgTintClass: 'bg-emerald-50',
    borderTintClass: 'border-emerald-200',
    badgeTextClass: 'text-emerald-800',
  },
  {
    id: 'marcus',
    name: 'Marcus',
    role: 'Executive & Career Mentor',
    field: 'Career & Business',
    specialty: 'Job interviews, leadership updates, negotiations & team meetings',
    voiceName: 'Charon',
    voiceToneLabel: 'Charon · Deep & Composed',
    voiceStyle: 'Composed, resonant, articulate executive mentor speaking clearly',
    vibe: 'Composed, thoughtful & articulate',
    defaultTopicTitle: 'Career Growth & Team Alignment',
    defaultStarter:
      'Great to connect with you today. Walk me through a project or goal you have been excited to drive forward lately.',
    keyPhrases: ['Take ownership of', 'On the same page', 'From start to finish'],
    accentHex: '#0F172A',
    bgTintClass: 'bg-slate-100',
    borderTintClass: 'border-slate-300',
    badgeTextClass: 'text-slate-800',
  },
  {
    id: 'chloe',
    name: 'Chloe',
    role: 'Travel & Culture Host',
    field: 'Travel & Culture',
    specialty: 'Cities, food, local customs, cafes & cross-cultural storytelling',
    voiceName: 'Kore',
    voiceToneLabel: 'Kore · Bright & Expressive',
    voiceStyle: 'Bright, curious, expressive storyteller with warm enthusiasm',
    vibe: 'Bright, curious & expressive',
    defaultTopicTitle: 'Memorable Places & Local Culture',
    defaultStarter:
      "Hey! I love discovering hidden gems when traveling. If you could hop on a flight anywhere tomorrow, where would you go first?",
    keyPhrases: ['Off the beaten path', 'Local favorite', 'What stood out to me'],
    accentHex: '#0284C7',
    bgTintClass: 'bg-sky-50',
    borderTintClass: 'border-sky-200',
    badgeTextClass: 'text-sky-800',
  },
  {
    id: 'liam',
    name: 'Liam',
    role: 'Tech & Product Builder',
    field: 'Tech & Science',
    specialty: 'Software, startups, future tech, AI tools & creative problem solving',
    voiceName: 'Puck',
    voiceToneLabel: 'Puck · Upbeat & Crisp',
    voiceStyle: 'Energetic, crisp, witty technology partner with natural pacing',
    vibe: 'Upbeat, witty & open-minded',
    defaultTopicTitle: 'Future Tech & Everyday Tools',
    defaultStarter:
      "Hey! Always great to brainstorm with you. What's one piece of technology that genuinely makes your day easier right now?",
    keyPhrases: ['Game changer', 'Under the hood', 'Big picture'],
    accentHex: '#D97706',
    bgTintClass: 'bg-amber-50',
    borderTintClass: 'border-amber-200',
    badgeTextClass: 'text-amber-800',
  },
  {
    id: 'noah',
    name: 'Dr. Noah',
    role: 'Health & Mindset Guide',
    field: 'Health & Wellness',
    specialty: 'Calm routines, stress balance, habits, fitness & mindful reflection',
    voiceName: 'Fenrir',
    voiceToneLabel: 'Fenrir · Calm & Grounded',
    voiceStyle: 'Calm, steady, reassuring wellness guide speaking unhurriedly',
    vibe: 'Calm, patient & grounding',
    defaultTopicTitle: 'Healthy Habits & Daily Balance',
    defaultStarter:
      "Welcome, take a comfortable breath. What small routine has helped you feel most focused and energized lately?",
    keyPhrases: ['Take a step back', 'Peace of mind', 'Build momentum'],
    accentHex: '#475569',
    bgTintClass: 'bg-slate-50',
    borderTintClass: 'border-slate-200',
    badgeTextClass: 'text-slate-700',
  },
  {
    id: 'sofia',
    name: 'Sofia',
    role: 'Film, Music & Arts Critic',
    field: 'Arts & Creative',
    specialty: 'Movies, books, design, photography & expressing creative taste',
    voiceName: 'Kore',
    voiceToneLabel: 'Kore · Warm & Poetic',
    voiceStyle: 'Warm, expressive, thoughtful arts host with lively inflection',
    vibe: 'Imaginative, warm & observant',
    defaultTopicTitle: 'Stories, Cinema & Creative Spark',
    defaultStarter:
      "I'm so glad we're chatting! What movie, book, or song stayed on your mind long after you finished it?",
    keyPhrases: ['What resonated with me', 'Rich atmosphere', 'Left a lasting impression'],
    accentHex: '#E11D48',
    bgTintClass: 'bg-rose-50',
    borderTintClass: 'border-rose-200',
    badgeTextClass: 'text-rose-800',
  },
  {
    id: 'ethan',
    name: 'Prof. Ethan',
    role: 'Science & Ideas Professor',
    field: 'Tech & Science',
    specialty: 'Astronomy, psychology, big questions & respectful thoughtful debate',
    voiceName: 'Charon',
    voiceToneLabel: 'Charon · Measured & Curious',
    voiceStyle: 'Measured, warm academic voice with crystal-clear pronunciation',
    vibe: 'Curious, balanced & encouraging',
    defaultTopicTitle: 'Big Questions & Discovery',
    defaultStarter:
      'Good to see you! I always enjoy exploring big questions together. What scientific discovery or mystery fascinates you most?',
    keyPhrases: ['From my perspective', 'Raises an interesting point', 'On the other hand'],
    accentHex: '#0D9488',
    bgTintClass: 'bg-teal-50',
    borderTintClass: 'border-teal-200',
    badgeTextClass: 'text-teal-800',
  },
  {
    id: 'aria',
    name: 'Aria',
    role: 'Hospitality & Everyday Helper',
    field: 'Everyday & Social',
    specialty: 'Cafes, appointments, polite requests, shopping & smooth service chats',
    voiceName: 'Zephyr',
    voiceToneLabel: 'Zephyr · Clear & Welcoming',
    voiceStyle: 'Polite, crystal-clear, patient conversational voice at steady pace',
    vibe: 'Polite, attentive & reassuring',
    defaultTopicTitle: 'Polite Requests & Everyday Errands',
    defaultStarter:
      "Hello and welcome! How can I help you today—would you like to practice ordering, asking directions, or planning an outing?",
    keyPhrases: ['Could I possibly get', 'By all means', 'Take your time'],
    accentHex: '#7C3AED',
    bgTintClass: 'bg-violet-50',
    borderTintClass: 'border-violet-200',
    badgeTextClass: 'text-violet-800',
  },
];

export const INFINITE_TOPIC_DOMAINS: string[] = [
  'Daily Life & Hobbies',
  'Career & Teamwork',
  'Travel & Culture',
  'Health & Mindset',
  'Science & Future Tech',
  'Movies, Books & Music',
  'Healthy Relationships & Boundaries',
  'Creative Storytelling',
];

export const CONVERSATION_SCENARIOS: ConversationScenario[] = [
  {
    id: 'small-talk',
    title: 'Everyday Small Talk',
    subtitle: 'Natural greetings, weekend plans, and casual warmth',
    level: 'A2',
    starterPrompt: "Hi there! It's great to catch up with you today. How has your week been treating you so far?",
    keyPhrases: ['So far, so good', 'Catch up with', 'To be honest'],
    communicationGoal: 'Practice warm openings and natural follow-up questions.',
  },
  {
    id: 'cafe-travel',
    title: 'Cafe & Travel',
    subtitle: 'Polite requests, ordering smoothly, and asking for tips',
    level: 'B1',
    starterPrompt: "Welcome in! What can I get started for you today, or would you like a local recommendation?",
    keyPhrases: ['Could I possibly get', 'On the side', 'What would you recommend?'],
    communicationGoal: 'Use polite, clear phrasing in real-world hospitality.',
  },
  {
    id: 'workplace-sync',
    title: 'Workplace Meeting',
    subtitle: 'Sharing progress clearly and aligning with teammates',
    level: 'B2',
    starterPrompt: "Thanks for hopping on! Before we dive into the timeline, how are things looking on your end?",
    keyPhrases: ['On the same page', 'Walk you through', 'Wrap up'],
    communicationGoal: 'Share updates constructively and keep teammates aligned.',
  },
  {
    id: 'job-interview',
    title: 'Job Interview',
    subtitle: 'Confident storytelling and clear professional phrasing',
    level: 'B2',
    starterPrompt: "Thanks for joining me today. To kick things off, could you tell me about a project you are proud of?",
    keyPhrases: ['Take ownership of', 'From start to finish', 'Looking back'],
    communicationGoal: 'Articulate achievements clearly and calmly.',
  },
  {
    id: 'friendly-debate',
    title: 'Healthy Perspectives',
    subtitle: 'Agreeing, disagreeing politely, and sharing thoughtful reasons',
    level: 'C1',
    starterPrompt: "I was reading that many teams are experimenting with four-day workweeks. Where do you stand on that?",
    keyPhrases: ['That raises a good point', 'From my perspective', 'On the other hand'],
    communicationGoal: 'Practice respectful, balanced discussion across viewpoints.',
  },
];

export type ThemeIconKey =
  | 'briefcase'
  | 'plane'
  | 'coffee'
  | 'graduation'
  | 'cpu'
  | 'heart'
  | 'film'
  | 'utensils';

export interface ConversationTheme {
  id: string;
  title: string;
  category: Exclude<PartnerField, 'All Fields'>;
  recommendedPartnerId: PersonaAppearance;
  suggestedLevel: CefrLevel;
  tagline: string;
  starterSeedContext: string;
  fallbackStarter: string;
  keyPhrases: string[];
  icon: ThemeIconKey;
}

export const CONVERSATION_THEMES: ConversationTheme[] = [
  {
    id: 'job-interview',
    title: 'Job Interview',
    category: 'Career & Business',
    recommendedPartnerId: 'marcus',
    suggestedLevel: 'B2',
    tagline: 'Practice behavioral questions, highlight impact & speak with poise.',
    starterSeedContext: 'A realistic, encouraging job interview simulation covering past projects, teamwork, and strengths.',
    fallbackStarter:
      "Thanks for making time to speak with me today. To get started, tell me about a recent challenge you solved and what you learned from it.",
    keyPhrases: ['Take ownership of', 'Measurable impact', 'Walk you through'],
    icon: 'briefcase',
  },
  {
    id: 'travel',
    title: 'Travel',
    category: 'Travel & Culture',
    recommendedPartnerId: 'chloe',
    suggestedLevel: 'B1',
    tagline: 'Navigate hotels, local dining, directions & spontaneous city stories.',
    starterSeedContext: 'Practical and inspiring travel conversation around itineraries, local culture, and smooth check-ins.',
    fallbackStarter:
      "Welcome! Exploring a new city is always exciting. Where are you heading next, or what kind of local experience do you enjoy most when traveling?",
    keyPhrases: ['Off the beaten path', 'Could you recommend', 'What stood out to me'],
    icon: 'plane',
  },
  {
    id: 'casual-small-talk',
    title: 'Casual Small Talk',
    category: 'Everyday & Social',
    recommendedPartnerId: 'maya',
    suggestedLevel: 'A2',
    tagline: 'Natural greetings, weekend catch-ups, hobbies & relaxed social flow.',
    starterSeedContext: 'Warm, relaxed everyday small talk with easy follow-up questions and friendly tone.',
    fallbackStarter:
      "Hey, it's great to catch up! How has your week been going so far, and have you had time for anything fun lately?",
    keyPhrases: ['So far, so good', 'To be honest', 'How have you been'],
    icon: 'coffee',
  },
  {
    id: 'academic-discussion',
    title: 'Academic Discussion',
    category: 'Tech & Science',
    recommendedPartnerId: 'ethan',
    suggestedLevel: 'C1',
    tagline: 'Explore research ideas, weigh evidence & share thoughtful arguments.',
    starterSeedContext: 'Structured, respectful academic seminar dialogue exploring evidence, nuance, and curiosity.',
    fallbackStarter:
      "Glad you joined today's seminar chat. What recent study, idea, or societal shift do you think deserves closer examination right now?",
    keyPhrases: ['From my perspective', 'Raises an interesting point', 'On the other hand'],
    icon: 'graduation',
  },
  {
    id: 'tech-brainstorm',
    title: 'Product & Tech Brainstorm',
    category: 'Tech & Science',
    recommendedPartnerId: 'liam',
    suggestedLevel: 'B2',
    tagline: 'Explain technical concepts simply, pitch ideas & collaborate smoothly.',
    starterSeedContext: 'Upbeat product and technology brainstorm about useful tools, design trade-offs, and innovation.',
    fallbackStarter:
      "Awesome to collaborate with you today! If we could build one simple tool to solve a daily annoyance, what problem would you tackle first?",
    keyPhrases: ['Game changer', 'Under the hood', 'Big picture'],
    icon: 'cpu',
  },
  {
    id: 'health-mindset',
    title: 'Wellness & Daily Habits',
    category: 'Health & Wellness',
    recommendedPartnerId: 'noah',
    suggestedLevel: 'B1',
    tagline: 'Talk calmly about routines, focus, stress balance & personal energy.',
    starterSeedContext: 'Supportive conversation on sustainable habits, restful focus, and healthy daily routines.',
    fallbackStarter:
      "Good to take a quiet moment together. What daily habit has made the biggest difference in how rested or focused you feel?",
    keyPhrases: ['Take a step back', 'Peace of mind', 'Build momentum'],
    icon: 'heart',
  },
  {
    id: 'arts-storytelling',
    title: 'Film, Music & Arts',
    category: 'Arts & Creative',
    recommendedPartnerId: 'sofia',
    suggestedLevel: 'B2',
    tagline: 'Describe mood, storytelling & why creative works move you.',
    starterSeedContext: 'Expressive cultural dialogue discussing films, books, music, and personal creative reactions.',
    fallbackStarter:
      "I always love hearing what inspires people creatively. What film, album, or book left a lasting impression on you recently?",
    keyPhrases: ['What resonated with me', 'Rich atmosphere', 'Left a lasting impression'],
    icon: 'film',
  },
  {
    id: 'everyday-errands',
    title: 'Dining & Polite Requests',
    category: 'Everyday & Social',
    recommendedPartnerId: 'aria',
    suggestedLevel: 'A2',
    tagline: 'Order smoothly at cafes, book appointments & ask politely in public.',
    starterSeedContext: 'Clear, polite hospitality and service interactions for ordering, scheduling, and asking questions.',
    fallbackStarter:
      "Hello and welcome in! Take your time looking over everything—what can I help you arrange or order today?",
    keyPhrases: ['Could I possibly get', 'By all means', 'Take your time'],
    icon: 'utensils',
  },
];

