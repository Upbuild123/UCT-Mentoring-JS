const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../services/supabase');
const { isAdmin, requireAdmin } = require('./admin');

async function requireDashboardAccess(req, res, next) {
  if (isAdmin(req)) return next();
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabase.from('mentors').select('dashboard_token').eq('id', req.params.id).single();
  if (!data || data.dashboard_token !== token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.get('/', requireAdmin, async (req, res, next) => {
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

router.get('/:id', requireDashboardAccess, async (req, res, next) => {
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

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const dashboard_token = crypto.randomUUID();
    const { data, error } = await supabase
      .from('mentors')
      .insert({ name, email, dashboard_token })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
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

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('mentors').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
