require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/students', require('./routes/students'));
app.use('/api/mentors', require('./routes/mentors'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
  // Allow long-running uploads of large video files on slow connections
  server.requestTimeout = 30 * 60 * 1000;
  server.headersTimeout = 30 * 60 * 1000;

  // Supabase's free tier pauses projects after 7 days without activity, so touch the
  // database once a day to keep it awake between courses
  const keepDatabaseAwake = async () => {
    const { error } = await require('./services/supabase')
      .from('mentors').select('id', { count: 'exact', head: true });
    if (error) console.error('Daily database keep-alive failed:', error.message);
  };
  keepDatabaseAwake();
  setInterval(keepDatabaseAwake, 24 * 60 * 60 * 1000);
}

module.exports = app;
