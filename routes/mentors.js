const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('mentors')
      .select('id, name, email, dashboard_token')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('mentors')
      .select('id, name, email, dashboard_token')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const { data, error } = await supabase
      .from('mentors')
      .insert({ name, email })
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
    const { name, email } = req.body;
    const { data, error } = await supabase
      .from('mentors')
      .update({ name, email })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
