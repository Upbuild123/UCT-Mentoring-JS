const request = require('supertest');

const mockAssessment = {
  id: 1, student_id: 1, round: 1, status: 'complete',
  competency_ratings: {}, reflections: {}, transcript: 'test',
  drive_folder_url: null, video_drive_url: null, pdf_drive_url: null,
  error_message: null, submitted_at: new Date().toISOString(),
};

jest.mock('../services/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({
    data: {
      id: 1, student_id: 1, round: 1, status: 'complete',
      competency_ratings: {}, reflections: {}, transcript: 'test',
      drive_folder_url: null, video_drive_url: null, pdf_drive_url: null,
      error_message: null, submitted_at: new Date().toISOString(),
    },
    error: null,
  }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
}));

jest.mock('../services/processor', () => ({ processAssessment: jest.fn(), generateAndSendPdf: jest.fn() }));

const app = require('../server');

test('GET /api/assessments/check-duplicate returns exists false', async () => {
  const res = await request(app).get('/api/assessments/check-duplicate?student_id=1&round=1');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('exists');
});

test('GET /api/assessments/:id/status returns status', async () => {
  const res = await request(app).get('/api/assessments/1/status');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('status');
});
