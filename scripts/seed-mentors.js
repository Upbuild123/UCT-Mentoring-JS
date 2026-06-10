require('dotenv').config();
const crypto = require('crypto');
const supabase = require('../services/supabase');

const MENTORS = [
  { name: 'Michael Sloyer', email: 'michael@upbuild.com' },
  { name: 'Gina Kellogg', email: 'gina@upbuild.com' },
  { name: 'Mary Kuentz', email: 'mary@upbuild.com' },
  { name: 'Vipin Goyal', email: 'vipin@upbuild.com' },
  { name: 'Tzipi Weiss', email: 'tzipi@upbuild.com' },
  { name: 'Melissa Arthur', email: 'melissa@upbuild.com' },
];

async function main() {
  for (const mentor of MENTORS) {
    const { data: existing } = await supabase
      .from('mentors')
      .select('id')
      .eq('email', mentor.email)
      .maybeSingle();

    if (existing) {
      console.log(`Skipping ${mentor.name} (${mentor.email}) — already exists`);
      continue;
    }

    const { error } = await supabase
      .from('mentors')
      .insert({ name: mentor.name, email: mentor.email, dashboard_token: crypto.randomUUID() });

    if (error) {
      console.error(`Failed to insert ${mentor.name}:`, error.message);
    } else {
      console.log(`Added ${mentor.name} (${mentor.email})`);
    }
  }
}

main().then(() => process.exit(0));
