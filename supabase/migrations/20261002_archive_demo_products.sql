update public.products
set status = 'Archived',
    updated_at = now()::text
where id in (
  'ember-hi',
  'static-runner',
  'dust-low',
  'blackout-court',
  'cloud-slide',
  'after-hours-slide'
);
