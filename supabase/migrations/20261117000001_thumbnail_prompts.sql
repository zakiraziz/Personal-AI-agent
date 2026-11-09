create table public.thumbnail_prompts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  prompt_text text not null check (char_length(btrim(prompt_text)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.thumbnail_prompts enable row level security;

create policy "Authorized users can read their own thumbnail prompts"
on public.thumbnail_prompts for select to authenticated
using (owner_id = (select auth.uid()));

create policy "Authorized users can insert their own thumbnail prompts"
on public.thumbnail_prompts for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "Authorized users can delete their own thumbnail prompts"
on public.thumbnail_prompts for delete to authenticated
using (owner_id = (select auth.uid()));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger thumbnail_prompts_set_updated_at
before update on public.thumbnail_prompts
for each row execute function public.set_updated_at();