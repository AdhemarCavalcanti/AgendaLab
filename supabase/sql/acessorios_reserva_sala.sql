-- =========================================================================
-- AgendaLab — Acessórios opcionais vinculados à reserva de sala
-- Execute depois de:
--   1. prevencao_concorrencia.sql
--   2. bloqueios_manutencao.sql
--   3. migracao_cancelamento_reservas_manutencao.sql
--   4. interdicao_emergencial.sql
-- =========================================================================

begin;

-- A reserva de equipamento continua sendo a fonte de verdade do estoque. O
-- vínculo identifica quando ela é um acessório de uma reserva de sala.
alter table public.reservas_equipamentos
  add column if not exists id_reserva_sala bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservas_equipamentos_id_reserva_sala_fkey'
      and conrelid = 'public.reservas_equipamentos'::regclass
  ) then
    alter table public.reservas_equipamentos
      add constraint reservas_equipamentos_id_reserva_sala_fkey
      foreign key (id_reserva_sala)
      references public.reservas_salas(id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists reservas_equipamentos_id_reserva_sala_idx
  on public.reservas_equipamentos (id_reserva_sala)
  where id_reserva_sala is not null;

comment on column public.reservas_equipamentos.id_reserva_sala is
  'Reserva de sala à qual este equipamento foi adicionado como acessório; nulo para reservas avulsas.';

-- Impede que um INSERT/UPDATE direto associe a uma sala um item de outro
-- usuário ou período. A RPC abaixo já produz registros válidos, e esta trigger
-- mantém a mesma garantia para qualquer outro cliente.
create or replace function public.validar_acessorio_reserva_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva_sala public.reservas_salas%rowtype;
begin
  if NEW.id_reserva_sala is null then
    return NEW;
  end if;

  select * into v_reserva_sala
  from public.reservas_salas
  where id = NEW.id_reserva_sala;

  if not found then
    raise exception 'Reserva de sala vinculada não encontrada.';
  end if;

  if NEW.id_usuario <> v_reserva_sala.id_usuario
     or NEW.inicio <> v_reserva_sala.inicio
     or NEW.fim <> v_reserva_sala.fim then
    raise exception 'O acessório deve pertencer ao mesmo usuário e período da reserva da sala.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_acessorio_reserva_sala on public.reservas_equipamentos;
create trigger trg_validar_acessorio_reserva_sala
  before insert or update of id_reserva_sala, id_usuario, inicio, fim
  on public.reservas_equipamentos
  for each row
  execute function public.validar_acessorio_reserva_sala();

-- Aprovação ou cancelamento da sala alcança os acessórios vinculados. Isso
-- preserva uma única decisão administrativa e libera o estoque no cancelamento.
create or replace function public.sincronizar_status_acessorios_reserva_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservas_equipamentos
  set status = NEW.status,
      id_adm = NEW.id_adm,
      cancelada_por_administracao = NEW.cancelada_por_administracao,
      justificativa_cancelamento = NEW.justificativa_cancelamento,
      status_devolucao = case
        when NEW.status = 'cancelada' then 'devolvido'::public.status_devolucao
        else status_devolucao
      end
  where id_reserva_sala = NEW.id
    and (
      -- Aprovação só alcança itens ainda pendentes. Um acessório cancelado por
      -- manutenção não pode ser ressuscitado por uma aprovação posterior.
      (NEW.status = 'aprovada' and status = 'pendente')
      or (
        status = NEW.status
        and NEW.status <> 'cancelada'
        and (
          id_adm is distinct from NEW.id_adm
          or cancelada_por_administracao is distinct from NEW.cancelada_por_administracao
          or justificativa_cancelamento is distinct from NEW.justificativa_cancelamento
        )
      )
      or (
        NEW.status = 'cancelada'
        and status <> 'cancelada'
      )
    );

  return NEW;
end;
$$;

drop trigger if exists trg_sincronizar_status_acessorios_reserva_sala on public.reservas_salas;
create trigger trg_sincronizar_status_acessorios_reserva_sala
  after update of status, id_adm, cancelada_por_administracao, justificativa_cancelamento
  on public.reservas_salas
  for each row
  execute function public.sincronizar_status_acessorios_reserva_sala();

-- A aplicação não oferece reagendamento, mas esta guarda evita que um UPDATE
-- direto na sala deixe acessórios com outro usuário ou período. Uma evolução
-- futura deve reagendar o conjunto por uma RPC transacional própria.
create or replace function public.impedir_desvinculo_acessorios_reserva_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.reservas_equipamentos
    where id_reserva_sala = OLD.id
  ) then
    raise exception 'Não é possível alterar usuário ou período de uma sala com acessórios vinculados.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_impedir_desvinculo_acessorios_reserva_sala on public.reservas_salas;
create trigger trg_impedir_desvinculo_acessorios_reserva_sala
  before update of id_usuario, inicio, fim
  on public.reservas_salas
  for each row
  when (
    OLD.id_usuario is distinct from NEW.id_usuario
    or OLD.inicio is distinct from NEW.inicio
    or OLD.fim is distinct from NEW.fim
  )
  execute function public.impedir_desvinculo_acessorios_reserva_sala();

-- Remove a assinatura anterior para o PostgREST não encontrar overloads
-- ambíguos. A nova assinatura mantém todos os parâmetros existentes e apenas
-- acrescenta o JSON opcional de acessórios.
drop function if exists public.solicitar_reserva(
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer,
  text
);

create or replace function public.solicitar_reserva(
  p_tipo text,
  p_id_recurso bigint,
  p_id_usuario bigint,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo text default null,
  p_quantidade_pessoas integer default 1,
  p_quantidade_equipamento integer default 1,
  p_observacao text default null,
  p_acessorios jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo_id bigint;
  v_acessorio record;
  v_acessorios_normalizados jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.usuarios
    where id_usuario = p_id_usuario
      and uuid = (select auth.uid())
  ) then
    raise exception 'Usuário da reserva não corresponde à conta autenticada.'
      using errcode = '42501';
  end if;

  if p_fim <= p_inicio then
    raise exception 'O fim da reserva deve ser posterior ao início.';
  end if;

  p_acessorios := coalesce(p_acessorios, '[]'::jsonb);
  if jsonb_typeof(p_acessorios) <> 'array' then
    raise exception 'A lista de acessórios deve ser um array JSON.';
  end if;

  if p_tipo = 'sala' then
    if coalesce(p_quantidade_pessoas, 0) < 1 then
      raise exception 'A quantidade de pessoas deve ser maior que zero.';
    end if;

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

    -- Agrupar IDs repetidos evita duas linhas para o mesmo acessório. A ordem
    -- fixa dos locks reduz o risco de deadlock quando pedidos concorrentes têm
    -- vários acessórios em comum.
    for v_acessorio in
      select item.id_equipamento, sum(item.quantidade)::integer as quantidade
      from jsonb_to_recordset(p_acessorios)
        as item(id_equipamento bigint, quantidade integer)
      group by item.id_equipamento
      order by item.id_equipamento
    loop
      if v_acessorio.id_equipamento is null
         or v_acessorio.quantidade is null
         or v_acessorio.quantidade < 1 then
        raise exception 'Cada acessório deve informar equipamento e quantidade maior que zero.';
      end if;

      insert into public.reservas_equipamentos (
        id_equipamento,
        id_reserva_sala,
        id_usuario,
        inicio,
        fim,
        status,
        status_devolucao,
        quantidade,
        observacao
      ) values (
        v_acessorio.id_equipamento,
        v_novo_id,
        p_id_usuario,
        p_inicio,
        p_fim,
        'pendente',
        'pendente',
        v_acessorio.quantidade,
        null
      );

      v_acessorios_normalizados := v_acessorios_normalizados || jsonb_build_array(
        jsonb_build_object(
          'id_equipamento', v_acessorio.id_equipamento,
          'quantidade', v_acessorio.quantidade
        )
      );
    end loop;

    return jsonb_build_object(
      'sucesso', true,
      'id', v_novo_id,
      'tipo', 'sala',
      'acessorios', v_acessorios_normalizados
    );

  elsif p_tipo = 'equipamento' then
    if jsonb_array_length(p_acessorios) > 0 then
      raise exception 'Acessórios adicionais só podem acompanhar uma reserva de sala.';
    end if;

    if coalesce(p_quantidade_equipamento, 0) < 1 then
      raise exception 'A quantidade do equipamento deve ser maior que zero.';
    end if;

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

revoke all on function public.solicitar_reserva(
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer,
  text,
  jsonb
) from public, anon;

grant execute on function public.solicitar_reserva(
  text,
  bigint,
  bigint,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer,
  text,
  jsonb
) to authenticated;

commit;
