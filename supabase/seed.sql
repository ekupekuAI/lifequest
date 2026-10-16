-- LifeQuest mission template seed. Safe to run repeatedly (upsert on slug).
-- slug = the mission id used by the game client. The client's own mission
-- definitions remain the source of truth for gameplay; `definition` here is a
-- descriptive summary used for assignment metadata and future server logic.
-- Run as the project owner (SQL editor / `supabase db reset`), which bypasses RLS.

insert into public.mission_templates (slug, title, description, category, difficulty, definition, is_active)
values
  (
    'grocery-run',
    'The Grocery Run',
    'Take the family shopping list to the store, stay within budget, handle surprises, and get home before the deadline.',
    'errand',
    2,
    '{
      "budget": 150,
      "deadlineMinutes": 100,
      "location": "grocery",
      "skills": ["budget", "time", "decisions", "patience", "planning"],
      "objectives": [
        {"id": "take-list",      "label": "Take the shopping list"},
        {"id": "buy-items",      "label": "Find every item on the list"},
        {"id": "stay-in-budget", "label": "Stay within the budget"},
        {"id": "checkout",       "label": "Pay at the checkout"},
        {"id": "return-home",    "label": "Bring the groceries home"}
      ],
      "challenges": ["stock-out-milk", "queue-cutter", "elder-ahead", "bag-fee", "sudden-rain"]
    }'::jsonb,
    true
  ),
  (
    'clean-room',
    'Clean Your Room',
    'Tidy your room: put things where they belong, carrying only what your hands can hold.',
    'chore',
    1,
    '{
      "budget": null,
      "deadlineMinutes": 45,
      "location": "home",
      "skills": ["responsibility", "household", "planning"],
      "objectives": [
        {"id": "laundry-basket", "label": "Put dirty clothes in the laundry basket"},
        {"id": "books-shelf",    "label": "Return books to the shelf"},
        {"id": "make-bed",       "label": "Make the bed"},
        {"id": "trash-out",      "label": "Take out the trash"}
      ],
      "challenges": ["hands-full", "sibling-mess", "distraction"]
    }'::jsonb,
    true
  ),
  (
    'help-sibling',
    'Help Your Younger Sibling',
    'Your younger sibling is stuck and frustrated. Listen, help them work it out, and keep it kind.',
    'family',
    1,
    '{
      "budget": null,
      "deadlineMinutes": 60,
      "location": "home",
      "skills": ["empathy", "communication", "patience", "problem"],
      "objectives": [
        {"id": "find-sibling", "label": "Find your sibling"},
        {"id": "listen",       "label": "Listen to what is wrong"},
        {"id": "help",         "label": "Help them solve it themselves"},
        {"id": "encourage",    "label": "Encourage them"}
      ],
      "challenges": ["sibling-frustrated", "distraction"]
    }'::jsonb,
    true
  ),
  (
    'clinic-visit',
    'Grandparent''s Clinic Check-in',
    'Accompany your grandparent to the clinic: bring the right papers, check in, wait your turn, and get home safely.',
    'care',
    3,
    '{
      "budget": 60,
      "deadlineMinutes": 120,
      "location": "clinic",
      "skills": ["empathy", "patience", "responsibility", "communication", "time"],
      "objectives": [
        {"id": "collect-card", "label": "Bring the clinic card"},
        {"id": "escort",       "label": "Walk with your grandparent"},
        {"id": "check-in",     "label": "Check in at reception"},
        {"id": "wait-turn",    "label": "Wait for your turn"},
        {"id": "return-home",  "label": "Return home together"}
      ],
      "challenges": ["long-queue", "forgotten-card", "slow-walk"]
    }'::jsonb,
    true
  )
on conflict (slug) do update set
  title       = excluded.title,
  description = excluded.description,
  category    = excluded.category,
  difficulty  = excluded.difficulty,
  definition  = excluded.definition,
  is_active   = excluded.is_active;
