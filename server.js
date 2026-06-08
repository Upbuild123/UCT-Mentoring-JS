require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/students', require('./routes/students'));
app.use('/api/mentors', require('./routes/mentors'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/admin', require('./routes/admin'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
}

module.exports = app;
