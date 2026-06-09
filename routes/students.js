const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, mentor_id, email')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, mentor_id } = req.body;
    const { data, error } = await supabase
      .from('students')
      .insert({ name, email, mentor_id })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, mentor_id } = req.body;
    const { data, error } = await supabase
      .from('students')
      .update({ name, email, mentor_id })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('students').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-import', async (req, res, next) => {
  try {
    const { rows } = req.body; // [{ name, email, mentor_name }]
    const { data: mentors, error: mErr } = await supabase.from('mentors').select('id, name');
    if (mErr) throw mErr;

    const mentorMap = {};
    for (const m of mentors) mentorMap[m.name.toLowerCase()] = m.id;

    const toInsert = [];
    const skipped = [];
    for (const row of rows) {
      const mentorId = mentorMap[row.mentor_name?.toLowerCase()];
      if (!mentorId) { skipped.push(row.name); continue; }
      toInsert.push({ name: row.name, email: row.email || null, mentor_id: mentorId });
    }

    if (toInsert.length) {
      const { error } = await supabase.from('students').insert(toInsert);
      if (error) throw error;
    }

    res.json({ imported: toInsert.length, skipped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
