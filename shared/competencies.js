const RATING_OPTIONS = [
  '1. Not Demonstrated',
  '2. Emerging',
  '3. Competent',
  '4. Exceptional',
];

const COMPETENCIES = [
  { name: 'Know Yourself', category: 'Meta-Skills' },
  { name: 'Experiment and Learn', category: 'Meta-Skills' },
  { name: 'Serve Not Fix', category: 'Meta-Skills' },
  { name: 'Call on the Creative', category: 'Meta-Skills' },
  { name: 'Co-Creating and Maintaining the Relationship', category: 'Skills' },
  { name: 'Structuring the Coaching Session', category: 'Skills' },
  { name: 'Listening', category: 'Skills' },
  { name: 'Asking Curious and Powerful Questions', category: 'Skills' },
  { name: 'Balancing Action and Learning', category: 'Skills' },
];

const REFLECTION_QUESTIONS = [
  'What did you do well in this coaching session?',
  'What opportunities were there to improve the coaching?',
  'What are you learning about your style as a coach? How would your clients describe you?',
  'What is your next developmental opportunity?',
  'Questions you have about this session or coaching in general',
  'If your session is longer than 30 minutes, which portion of the recording should your mentor listen to?',
];

const MENTOR_QUESTIONS = [
  'What did the coach do well in this coaching session?',
  'What opportunities were there to strengthen this coaching session?',
  'What are the developmental opportunities for the coach?',
  'What are 1-2 development practices for the coach?',
];

module.exports = { RATING_OPTIONS, COMPETENCIES, REFLECTION_QUESTIONS, MENTOR_QUESTIONS };
