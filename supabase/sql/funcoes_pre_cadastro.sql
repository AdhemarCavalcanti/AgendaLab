-- =========================================================================
-- AgendaLab — funções necessárias para o fluxo de pré-cadastro pelo admin
-- Rode este script inteiro no SQL Editor do Supabase (schema já existente
-- de administradores/usuarios/pre_administradores/pre_usuarios/is_admin()).
-- =========================================================================

-- 1) Admin pré-cadastra um ALUNO (nome + email + matrícula)
create or replace function public.admin_criar_pre_cadastro_usuario(
  p_nome text,
  p_email text,
  p_matricula text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not is_admin() then
    raise exception 'Apenas administradores podem pré-cadastrar alunos.';
  end if;

  if exists (select 1 from public.usuarios where lower(email) = lower(p_email)) then
    raise exception 'Já existe uma conta ativa com este e-mail.';
  end if;

  if exists (select 1 from private.pre_usuarios where lower(email) = lower(p_email)) then
    raise exception 'Este e-mail já possui um pré-cadastro pendente.';
  end if;

  insert into private.pre_usuarios (nome, email, matricula)
  values (p_nome, lower(p_email), p_matricula);
end;
$$;

revoke all on function public.admin_criar_pre_cadastro_usuario(text, text, text) from public, anon;
grant execute on function public.admin_criar_pre_cadastro_usuario(text, text, text) to authenticated;


-- 2) Admin pré-cadastra outro ADMINISTRADOR (nome + email) — código gerado no servidor
create or replace function public.admin_criar_pre_cadastro_admin(
  p_nome text,
  p_email text
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_codigo text;
begin
  if not is_admin() then
    raise exception 'Apenas administradores podem pré-cadastrar outros administradores.';
  end if;

  if exists (select 1 from public.administradores where lower(email) = lower(p_email)) then
    raise exception 'Já existe uma conta de administrador ativa com este e-mail.';
  end if;

  if exists (select 1 from private.pre_administradores where lower(email) = lower(p_email)) then
    raise exception 'Este e-mail já possui um pré-cadastro de administrador pendente.';
  end if;

  v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into private.pre_administradores (nome, email, codigo)
  values (p_nome, lower(p_email), v_codigo);

  return v_codigo;
end;
$$;

revoke all on function public.admin_criar_pre_cadastro_admin(text, text) from public, anon;
grant execute on function public.admin_criar_pre_cadastro_admin(text, text) to authenticated;


-- 3) Admin lista todos os pré-cadastros pendentes (usuários + administradores)
create or replace function public.admin_listar_pre_cadastros()
returns table (
  tipo text,
  nome text,
  email text,
  identificador text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not is_admin() then
    raise exception 'Apenas administradores podem listar pré-cadastros.';
  end if;

  return query
    select 'usuario'::text, pu.nome, pu.email, pu.matricula, pu.criado_em
    from private.pre_usuarios pu
    union all
    select 'administrador'::text, pa.nome, pa.email, pa.codigo, pa.criado_em
    from private.pre_administradores pa
    order by 5 desc;
end;
$$;

revoke all on function public.admin_listar_pre_cadastros() from public, anon;
grant execute on function public.admin_listar_pre_cadastros() to authenticated;


-- 4) Admin cancela um pré-cadastro pendente (antes da ativação)
create or replace function public.admin_cancelar_pre_cadastro(
  p_tipo text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not is_admin() then
    raise exception 'Apenas administradores podem cancelar pré-cadastros.';
  end if;

  if p_tipo = 'usuario' then
    delete from private.pre_usuarios where lower(email) = lower(p_email);
  elsif p_tipo = 'administrador' then
    delete from private.pre_administradores where lower(email) = lower(p_email);
  else
    raise exception 'Tipo inválido: %', p_tipo;
  end if;
end;
$$;

revoke all on function public.admin_cancelar_pre_cadastro(text, text) from public, anon;
grant execute on function public.admin_cancelar_pre_cadastro(text, text) to authenticated;


-- 5) Corrige a trigger de migração para REALMENTE apagar o registro
--    temporário do schema private após criar a conta definitiva
--    (a versão enviada fazia o INSERT mas nunca o DELETE, então um
--    mesmo e-mail/matrícula podia ser "ativado" mais de uma vez).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_nome text;
  v_codigo text;
  v_matricula text;
begin
  v_nome      := new.raw_user_meta_data->>'nome';
  v_codigo    := new.raw_user_meta_data->>'codigo';
  v_matricula := new.raw_user_meta_data->>'matricula';

  if v_codigo is not null then
    if not exists (
      select 1 from private.pre_administradores
      where lower(email) = lower(new.email) and codigo = v_codigo
    ) then
      raise exception 'Acesso negado: e-mail ou código de administrador não autorizados.';
    end if;

    insert into public.administradores (uuid, nome, email, codigo)
    values (new.id, v_nome, new.email, v_codigo);

    delete from private.pre_administradores
    where lower(email) = lower(new.email) and codigo = v_codigo;

  elsif v_matricula is not null then
    if not exists (
      select 1 from private.pre_usuarios
      where lower(email) = lower(new.email) and matricula = v_matricula
    ) then
      raise exception 'Acesso negado: e-mail ou matrícula não autorizados.';
    end if;

    insert into public.usuarios (uuid, nome, email, matricula)
    values (new.id, v_nome, new.email, v_matricula);

    delete from private.pre_usuarios
    where lower(email) = lower(new.email) and matricula = v_matricula;

  else
    raise exception 'Cadastro inválido: matrícula ou código de administrador obrigatório.';
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
grant execute on function private.handle_new_user() to postgres, service_role;


-- 6) (Opcional, mas recomendado) Bloqueio real de conflito de horário no
--    banco — RF04/RNF03. Sem isso, a checagem de conflito hoje só existe
--    no front (best-effort). Requer a extensão btree_gist.
create extension if not exists btree_gist;

alter table public.reservas_salas
  drop constraint if exists reservas_salas_sem_sobreposicao;
alter table public.reservas_salas
  add constraint reservas_salas_sem_sobreposicao
  exclude using gist (
    id_sala with =,
    tsrange(inicio, fim) with &&
  ) where (status in ('pendente', 'confirmada'));

alter table public.reservas_equipamentos
  drop constraint if exists reservas_equipamentos_sem_sobreposicao;
alter table public.reservas_equipamentos
  add constraint reservas_equipamentos_sem_sobreposicao
  exclude using gist (
    id_equipamento with =,
    tsrange(inicio, fim) with &&
  ) where (status in ('pendente', 'confirmada'));
