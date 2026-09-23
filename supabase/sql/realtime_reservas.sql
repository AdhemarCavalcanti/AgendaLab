-- Permite que a grade receba alterações de status das reservas em tempo real.
-- A consulta da grade continua considerando apenas reservas pendentes e aprovadas.
do $$
declare
  v_tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach v_tabela in array array['reservas_salas', 'reservas_equipamentos'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabela);
    end if;
  end loop;
end;
$$;
