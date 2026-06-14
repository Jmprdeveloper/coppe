update public.inquiry_messages
set direction = 'inbound'
where direction is null
   or direction not in ('inbound', 'outbound');

update public.inquiry_messages
set author_type = 'customer'
where author_type is null
   or author_type not in ('customer', 'company');

update public.inquiry_messages
set source_channel = case
  when source_channel in ('email', 'e_mail', 'mail', 'correo', 'correo_electronico') then 'Email'
  when source_channel in ('form', 'web', 'Formulario Web', 'formulario', 'formulario_web', 'web_form', 'public_intake', 'public_form', 'contacto') then 'Formulario web'
  when source_channel in ('web_chat', 'chat_web', 'chat', 'public_chat') then 'Chat web'
  when source_channel in ('whatsapp', 'whats_app') then 'WhatsApp'
  when source_channel in ('phone', 'telefono', 'tel', 'llamada') then 'Teléfono'
  when source_channel is null or btrim(source_channel) = '' then 'Otro'
  else source_channel
end;

update public.inquiry_messages
set source_channel = 'Otro'
where source_channel not in (
  'Email',
  'Teléfono',
  'WhatsApp',
  'SMS',
  'Formulario web',
  'Chat web',
  'Instagram',
  'Facebook',
  'Perfil de Empresa de Google',
  'Presencial',
  'Portal externo',
  'Otro'
);

alter table public.inquiry_messages
alter column direction set not null;

alter table public.inquiry_messages
alter column author_type set not null;

alter table public.inquiry_messages
alter column source_channel set not null;

alter table public.inquiry_messages
drop constraint if exists inquiry_messages_direction_check;

alter table public.inquiry_messages
add constraint inquiry_messages_direction_check
check (
  direction in ('inbound', 'outbound')
);

alter table public.inquiry_messages
drop constraint if exists inquiry_messages_author_type_check;

alter table public.inquiry_messages
add constraint inquiry_messages_author_type_check
check (
  author_type in ('customer', 'company')
);

alter table public.inquiry_messages
drop constraint if exists inquiry_messages_source_channel_check;

alter table public.inquiry_messages
add constraint inquiry_messages_source_channel_check
check (
  source_channel in (
    'Email',
    'Teléfono',
    'WhatsApp',
    'SMS',
    'Formulario web',
    'Chat web',
    'Instagram',
    'Facebook',
    'Perfil de Empresa de Google',
    'Presencial',
    'Portal externo',
    'Otro'
  )
);