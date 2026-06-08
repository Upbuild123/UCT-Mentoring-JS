const request = require('supertest');
const app = require('../server');

jest.mock('../services/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({
    data: [{ id: 1, name: 'Bob', email: 'bob@example.com', dashboard_token: 'abc' }],
    error: null,
  }),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({
    data: { id: 1, name: 'Bob', email: 'bob@example.com', dashboard_token: 'abc' },
    error: null,
  }),
}));

test('GET /api/mentors returns mentor list', async () => {
  const res = await request(app).get('/api/mentors');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('GET /api/mentors/:id returns one mentor', async () => {
  const res = await request(app).get('/api/mentors/1');
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Bob');
});
