const RATING_OPTIONS = [
  '1. Not Demonstrated',
  '2. Emerging',
  '3. Competent',
  '4. Exceptional',
];

const COMPETENCIES = [
  { name: 'Know Yourself', category: 'Meta-Skills', description: 'Uses self-knowledge and self-work to help the client discover who they are.' },
  { name: 'Experiment and Learn', category: 'Meta-Skills', description: 'Holds an experimental mindset, interacts with the client in new ways, and takes risks for the sake of the client.' },
  { name: 'Serve Not Fix', category: 'Meta-Skills', description: 'Focuses on coaching the whole person and their whole life, not the problem or issue; explores what it means to serve this client; avoids being an expert and advice-giver.' },
  { name: 'Call on the Creative', category: 'Meta-Skills', description: 'Accesses and coaches from the Creative Level of Consciousness to help the client access and live from their Creative Consciousness.' },
  { name: '10/80/10 Structure', category: 'Skills', description: 'Structures the session with an opening, extended exploration, and closing, making space for the client’s presenting, deeper, and transformational agendas.' },
  { name: 'Establishes and Maintains Agreements', category: 'Skills', description: 'Partners with the client to clarify the session topic, desired outcome, and why it matters, then keeps the conversation connected to those agreements.' },
  { name: 'Cultivates Trust and Safety', category: 'Skills', description: 'Partners with the client to create a safe, supportive environment that allows the client to share freely. Maintains a relationship of mutual respect and trust.' },
  { name: 'Maintains Presence', category: 'Skills', description: 'Stays fully present with the client, remaining open, flexible, grounded, and confident as the conversation unfolds.' },
  { name: 'Listens Actively', category: 'Skills', description: 'Listens without judgment to the client’s words, emotions, and underlying meaning to understand what the client is communicating.' },
  { name: 'Evokes Awareness', category: 'Skills', description: 'Facilitates client insight and learning by using skills such as powerful questions, silence, metaphor, values, and visioning.' },
  { name: 'Facilitates Client Growth', category: 'Skills', description: 'Partners with the client to transform learning and insight into action. Promotes client autonomy in the coaching process.' },
];

const REFLECTION_QUESTIONS = [
  'What did you do well in this coaching session?',
  'What opportunities were there to improve the coaching?',
  'What are you learning about your style as a coach? How would your clients describe you?',
  'What is your next developmental opportunity?',
  'Questions you have about this session or coaching in general',
  'If your session is longer than 30 mins, which portion should your mentor listen to?',
];

const MENTOR_QUESTIONS = [
  'Strengths: What did the coach do well in this session?',
  'Development areas: What opportunities were there to improve the coaching?',
  'Style: What do you notice about the coach’s style?',
  'Development practices: Which 1–2 development practices should the coach focus on for the next session?',
];

module.exports = { RATING_OPTIONS, COMPETENCIES, REFLECTION_QUESTIONS, MENTOR_QUESTIONS };
