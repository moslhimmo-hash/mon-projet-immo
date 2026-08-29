-- Cozimo — table "projects" pour la sauvegarde cloud optionnelle.
-- À exécuter dans l'éditeur SQL de votre projet Supabase (Dashboard → SQL Editor).

create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table projects enable row level security;

create policy "Users can only access their own projects"
on projects for all
using (auth.uid() = user_id);

-- Optionnel mais recommandé : index pour accélérer le chargement des projets d'un utilisateur.
create index projects_user_id_idx on projects(user_id);

-- Optionnel : maintient updated_at à jour automatiquement à chaque UPDATE
-- (l'app envoie déjà updated_at explicitement à chaque sauvegarde, ce trigger
-- est une sécurité supplémentaire si des mises à jour sont faites hors de l'app).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at
before update on projects
for each row
execute function set_updated_at();
