-- =========================================================================
-- AgendaLab — Prevenção de Concorrência e Bloqueio de Reservas Duplicadas
-- (US09 / RF04 / RNF03)
-- Execute este script no SQL Editor do Supabase para ativar a proteção no banco.
-- =========================================================================

-- 1) Extensão btree_gist para suporte a restrições de exclusão com bigint e timestamptz
create extension if not exists btree_gist;

-- 2) Função de validação e bloqueio concorrente para RESERVAS DE SALAS
create or replace function public.checar_concorrencia_reserva_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Dispara apenas para reservas ativas (pendente ou aprovada)
  if NEW.status in ('pendente', 'aprovada') then
    -- Bloqueio pessimista da linha da sala para serializar transações simultâneas
    perform 1
    from public.salas
    where id_sala = NEW.id_sala
    for update;

    -- Verifica se já existe outra reserva ativa no mesmo intervalo
    if exists (
      select 1
      from public.reservas_salas
      where id_sala = NEW.id_sala
        and status in ('pendente', 'aprovada')
        and id <> coalesce(NEW.id, 0)
        and tstzrange(inicio, fim) && tstzrange(NEW.inicio, NEW.fim)
    ) then
      raise exception 'Este horário acabou de ser reservado por outro usuário. Por favor, escolha outro período.'
        using errcode = '23P01';
    end if;
  end if;

  return NEW;
end;
$$;

-- Trigger nas reservas de salas
drop trigger if exists trg_checar_concorrencia_reserva_sala on public.reservas_salas;
create trigger trg_checar_concorrencia_reserva_sala
  before insert or update on public.reservas_salas
  for each row
  execute function public.checar_concorrencia_reserva_sala();

-- Restrição de exclusão física em reservas_salas (garantia indexada no motor do banco)
alter table public.reservas_salas
  drop constraint if exists reservas_salas_sem_sobreposicao;

alter table public.reservas_salas
  add constraint reservas_salas_sem_sobreposicao
  exclude using gist (
    id_sala with =,
    tstzrange(inicio, fim) with &&
  ) where (status in ('pendente', 'aprovada'));


-- 3) Função de validação e bloqueio concorrente para RESERVAS DE EQUIPAMENTOS
create or replace function public.checar_concorrencia_reserva_equipamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd_estoque integer;
  v_soma_uso integer;
begin
  -- Dispara apenas para reservas ativas (pendente ou aprovada)
  if NEW.status in ('pendente', 'aprovada') then
    -- Bloqueio pessimista da linha do equipamento para serializar transações simultâneas
    select quantidade into v_qtd_estoque
    from public.equipamentos
    where id = NEW.id_equipamento
    for update;

    if v_qtd_estoque is null then
      raise exception 'Equipamento não encontrado.';
    end if;

    -- Soma das quantidades reservadas ativas com sobreposição de intervalo
    select coalesce(sum(coalesce(quantidade, 1)), 0) into v_soma_uso
    from public.reservas_equipamentos
    where id_equipamento = NEW.id_equipamento
      and status in ('pendente', 'aprovada')
      and id <> coalesce(NEW.id, 0)
      and tstzrange(inicio, fim) && tstzrange(NEW.inicio, NEW.fim);

    if (v_soma_uso + coalesce(NEW.quantidade, 1)) > v_qtd_estoque then
      raise exception 'Este horário acabou de ser reservado por outro usuário. Por favor, escolha outro período.'
        using errcode = '23P01';
    end if;
  end if;

  return NEW;
end;
$$;

-- Trigger nas reservas de equipamentos
drop trigger if exists trg_checar_concorrencia_reserva_equipamento on public.reservas_equipamentos;
create trigger trg_checar_concorrencia_reserva_equipamento
  before insert or update on public.reservas_equipamentos
  for each row
  execute function public.checar_concorrencia_reserva_equipamento();


-- 4) RPC transacional para solicitar reserva com tratamento e locking no banco
create or replace function public.solicitar_reserva(
  p_tipo text,
  p_id_recurso bigint,
  p_id_usuario bigint,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo text default null,
  p_quantidade_pessoas int default 1,
  p_quantidade_equipamento int default 1,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo_id bigint;
begin
  if p_tipo = 'sala' then
    insert into public.reservas_salas (
      id_sala,
      id_usuario,
      inicio,
      fim,
      status,
      motivo,
      quantidade_pessoas,
      observacao
    ) values (
      p_id_recurso,
      p_id_usuario,
      p_inicio,
      p_fim,
      'pendente',
      p_motivo,
      p_quantidade_pessoas,
      p_observacao
    )
    returning id into v_novo_id;

    return jsonb_build_object('sucesso', true, 'id', v_novo_id, 'tipo', 'sala');

  elsif p_tipo = 'equipamento' then
    insert into public.reservas_equipamentos (
      id_equipamento,
      id_usuario,
      inicio,
      fim,
      status,
      status_devolucao,
      quantidade,
      observacao
    ) values (
      p_id_recurso,
      p_id_usuario,
      p_inicio,
      p_fim,
      'pendente',
      'pendente',
      p_quantidade_equipamento,
      p_observacao
    )
    returning id into v_novo_id;

    return jsonb_build_object('sucesso', true, 'id', v_novo_id, 'tipo', 'equipamento');
  else
    raise exception 'Tipo de recurso inválido: %', p_tipo;
  end if;
end;
$$;

revoke all on function public.solicitar_reserva(text, bigint, bigint, timestamptz, timestamptz, text, int, int, text) from public, anon;
grant execute on function public.solicitar_reserva(text, bigint, bigint, timestamptz, timestamptz, text, int, int, text) to authenticated;
