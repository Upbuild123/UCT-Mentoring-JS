const request = require('supertest');

const mockRow = {
  student_token: 'student-abc',
  round: 2,
  post_reflections: null,
  students: { name: 'Joe Test' },
};

jest.mock('../services/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  single: jest.fn(() => Promise.resolve({ data: mockRow, error: null })),
  then: undefined,
}));

jest.mock('../services/processor', () => ({
  processAssessment: jest.fn(),
  generateAndSendPdf: jest.fn(),
  savePostReflection: jest.fn().mockResolvedValue(),
}));

const supabase = require('../services/supabase');
const { savePostReflection } = require('../services/processor');
const { POST_REFLECTION_QUESTIONS } = require('../shared/competencies');
const app = require('../server');

const allAnswered = Object.fromEntries(POST_REFLECTION_QUESTIONS.map(q => [q, 'An answer']));

test('GET post-reflection rejects a missing token', async () => {
  const res = await request(app).get('/api/assessments/1/post-reflection');
  expect(res.status).toBe(401);
});

test('GET post-reflection rejects a wrong token', async () => {
  const res = await request(app).get('/api/assessments/1/post-reflection?token=wrong');
  expect(res.status).toBe(401);
});

test('GET post-reflection returns the questions with the student token', async () => {
  const res = await request(app).get('/api/assessments/1/post-reflection?token=student-abc');
  expect(res.status).toBe(200);
  expect(res.body.round).toBe(2);
  expect(res.body.questions).toEqual(POST_REFLECTION_QUESTIONS);
});

test('POST post-reflection requires every question to be answered', async () => {
  const res = await request(app)
    .post('/api/assessments/1/post-reflection?token=student-abc')
    .send({ answers: { [POST_REFLECTION_QUESTIONS[0]]: 'Only one' } });
  expect(res.status).toBe(400);
});

test('POST post-reflection saves the answers and files them', async () => {
  supabase.eq.mockImplementationOnce(() => supabase)
    .mockImplementationOnce(() => Promise.resolve({ error: null }));
  const res = await request(app)
    .post('/api/assessments/1/post-reflection?token=student-abc')
    .send({ answers: allAnswered });
  expect(res.status).toBe(200);
  expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({ post_reflections: allAnswered }));
  expect(savePostReflection).toHaveBeenCalledWith(1);
});
