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

async function adminToken() {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(app).post('/api/admin/auth').send({ password: 'secret' });
  return res.body.token;
}

test('GET /api/mentors requires admin login', async () => {
  const res = await request(app).get('/api/mentors');
  expect(res.status).toBe(401);
});

test('GET /api/mentors returns mentor list to admins', async () => {
  const res = await request(app).get('/api/mentors').set('Authorization', `Bearer ${await adminToken()}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('GET /api/mentors/:id returns one mentor with a valid dashboard token', async () => {
  const res = await request(app).get('/api/mentors/1?token=abc');
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Bob');
});

test('GET /api/mentors/:id rejects a wrong dashboard token', async () => {
  const res = await request(app).get('/api/mentors/1?token=wrong');
  expect(res.status).toBe(401);
});
