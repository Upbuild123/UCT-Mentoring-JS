const request = require('supertest');
const app = require('../server');

jest.mock('../services/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({
    data: [{ id: 1, name: 'Alice', mentor_id: 1, email: 'alice@example.com' }],
    error: null,
  }),
}));

test('GET /api/students returns student list', async () => {
  const res = await request(app).get('/api/students');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0].name).toBe('Alice');
});
