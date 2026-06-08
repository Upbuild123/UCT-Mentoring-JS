const request = require('supertest');

jest.mock('../services/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({ data: [], error: null }),
}));

const app = require('../server');

test('POST /api/admin/auth with wrong password returns 401', async () => {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(app).post('/api/admin/auth').send({ password: 'wrong' });
  expect(res.status).toBe(401);
  expect(res.body.success).toBe(false);
});

test('POST /api/admin/auth with correct password returns token', async () => {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(app).post('/api/admin/auth').send({ password: 'secret' });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(typeof res.body.token).toBe('string');
});
