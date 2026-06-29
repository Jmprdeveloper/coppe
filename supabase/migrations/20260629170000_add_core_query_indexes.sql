-- Keep the main tenant-scoped lists and timelines responsive as data grows.

create index if not exists inquiries_company_created_at_idx
on public.inquiries (company_id, created_at desc);

create index if not exists inquiries_company_status_created_at_idx
on public.inquiries (company_id, status, created_at desc);

create index if not exists inquiries_customer_created_at_idx
on public.inquiries (customer_id, created_at desc);

create index if not exists customers_company_activity_idx
on public.customers (
  company_id,
  last_interaction_at desc nulls last,
  created_at desc
);

create index if not exists follow_ups_company_due_at_idx
on public.follow_ups (
  company_id,
  due_at asc nulls last,
  created_at desc
);

create index if not exists follow_ups_customer_due_at_idx
on public.follow_ups (
  customer_id,
  due_at asc nulls last,
  created_at desc
);

create index if not exists follow_ups_inquiry_due_at_idx
on public.follow_ups (
  inquiry_id,
  due_at asc nulls last,
  created_at desc
);

create index if not exists internal_notes_inquiry_created_at_idx
on public.internal_notes (inquiry_id, created_at desc);

create index if not exists internal_notes_customer_created_at_idx
on public.internal_notes (customer_id, created_at desc)
where inquiry_id is null;

create index if not exists inbound_events_inquiry_created_at_idx
on public.inbound_events (inquiry_id, created_at desc);
