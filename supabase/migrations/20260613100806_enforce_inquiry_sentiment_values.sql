update public.inquiries
set sentiment = 'neutral'
where sentiment is not null
  and sentiment not in ('positive', 'neutral', 'negative');

alter table public.inquiries
drop constraint if exists inquiries_sentiment_check;

alter table public.inquiries
add constraint inquiries_sentiment_check
check (
  sentiment is null
  or sentiment in ('positive', 'neutral', 'negative')
);
