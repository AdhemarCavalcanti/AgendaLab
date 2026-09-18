-- =========================================================================
-- AgendaLab — Interdição emergencial por data e turnos
-- Execute depois de:
--   1. supabase/sql/bloqueios_manutencao.sql
--   2. supabase/sql/migracao_cancelamento_reservas_manutencao.sql
-- =========================================================================

-- Mantém o enum status_reserva compatível e registra separadamente a origem e
-- a justificativa pública do cancelamento administrativo.
alter table public.reservas_salas
  add column if not exists cancelada_por_administracao boolean not null default false,
  add column if not exists justificativa_cancelamento text;

alter table public.reservas_equipamentos
  add column if not exists cancelada_por_administracao boolean not null default false,
  add column if not exists justificativa_cancelamento text;

alter table public.reservas_salas
  drop constraint if exists reservas_salas_cancelamento_administrativo_check;
alter table public.reservas_salas
  add constraint reservas_salas_cancelamento_administrativo_check
  check (
    not cancelada_por_administracao
    or (
      status = 'cancelada'
      and char_length(btrim(coalesce(justificativa_cancelamento, ''))) between 1 and 500
    )
  );

alter table public.reservas_equipamentos
  drop constraint if exists reservas_equipamentos_cancelamento_administrativo_check;
alter table public.reservas_equipamentos
  add constraint reservas_equipamentos_cancelamento_administrativo_check
  check (
    not cancelada_por_administracao
    or (
      status = 'cancelada'
      and char_length(btrim(coalesce(justificativa_cancelamento, ''))) between 1 and 500
    )
  );

comment on column public.reservas_salas.cancelada_por_administracao is
  'Indica cancelamento em massa decorrente de interdição emergencial.';
comment on column public.reservas_salas.justificativa_cancelamento is
  'Justificativa pública apresentada aos usuários afetados.';
comment on column public.reservas_equipamentos.cancelada_por_administracao is
  'Indica cancelamento em massa decorrente de interdição emergencial.';
comment on column public.reservas_equipamentos.justificativa_cancelamento is
  'Justificativa pública apresentada aos usuários afetados.';

-- A notificação passa a distinguir a interdição emergencial dos demais tipos
-- de cancelamento. A mensagem é gerada pelo banco para cada reserva afetada.
create or replace function public.processar_notificacao_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome_recurso text;
  v_tipo_recurso text;
  v_titulo text;
  v_mensagem text;
  v_motivo_manutencao text;
  v_justificativa_cancelamento text;
  v_inicio_formatado text;
  v_fim_formatado text;
begin
  if not (
    (OLD.status = 'pendente' and NEW.status = 'aprovada')
    or (OLD.status in ('pendente', 'aprovada') and NEW.status = 'cancelada')
  ) then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'reservas_salas' then
    v_tipo_recurso := 'sala';
    select nome into v_nome_recurso
    from public.salas
    where id_sala = NEW.id_sala;
  else
    v_tipo_recurso := 'equipamento';
    select nome into v_nome_recurso
    from public.equipamentos
    where id = NEW.id_equipamento;
  end if;

  v_inicio_formatado := to_char(
    NEW.inicio at time zone 'America/Sao_Paulo',
    'DD/MM/YYYY HH24:MI'
  );
  v_fim_formatado := to_char(
    NEW.fim at time zone 'America/Sao_Paulo',
    'DD/MM/YYYY HH24:MI'
  );

  if NEW.status = 'aprovada' then
    v_titulo := 'Solicitação aprovada';
    v_mensagem := 'Sua solicitação de reserva de ' || v_tipo_recurso || ' "' ||
      v_nome_recurso || '" para o período de ' || v_inicio_formatado || ' a ' ||
      v_fim_formatado || ' foi aprovada.';
  elsif coalesce(NEW.cancelada_por_administracao, false) then
    v_justificativa_cancelamento := nullif(
      btrim(NEW.justificativa_cancelamento),
      ''
    );
    v_titulo := 'Reserva cancelada pela Administração';
    v_mensagem := 'Sua reserva de ' || v_tipo_recurso || ' "' ||
      v_nome_recurso || '" para o período de ' || v_inicio_formatado || ' a ' ||
      v_fim_formatado || ' foi cancelada pela Administração. Justificativa: "' ||
      v_justificativa_cancelamento || '".';
  else
    v_motivo_manutencao := nullif(
      current_setting('agendalab.motivo_manutencao', true),
      ''
    );

    if v_motivo_manutencao is not null then
      v_titulo := 'Reserva cancelada por manutenção';
      v_mensagem := 'Sua reserva de ' || v_tipo_recurso || ' "' ||
        v_nome_recurso || '" para o período de ' || v_inicio_formatado || ' a ' ||
        v_fim_formatado || ' foi cancelada devido a uma manutenção. Justificativa: "' ||
        v_motivo_manutencao || '".';
    else
      v_titulo := case
        when OLD.status = 'pendente' then 'Solicitação rejeitada'
        else 'Reserva cancelada'
      end;
      v_mensagem := 'Sua reserva de ' || v_tipo_recurso || ' "' ||
        v_nome_recurso || '" para o período de ' || v_inicio_formatado || ' a ' ||
        v_fim_formatado || ' foi cancelada.';

      if nullif(btrim(NEW.motivo), '') is not null then
        v_mensagem := v_mensagem || ' Justificativa: "' || btrim(NEW.motivo) || '".';
      end if;
    end if;
  end if;

  insert into public.notificacoes (id_usuario, titulo, mensagem, lida)
  values (NEW.id_usuario, v_titulo, v_mensagem, false);

  return NEW;
end;
$$;

-- Turnos oficiais da agenda:
--   manhã: 07:00–12:00
--   tarde: 12:00–18:00
--   noite: 18:00–22:00
-- A RPC bloqueia o recurso para serializar reservas simultâneas, mostra uma
-- prévia para confirmação e grava bloqueios, cancelamentos e alertas na mesma
-- transação.
create or replace function public.interditar_recurso_emergencial(
  p_tipo text,
  p_id_recurso bigint,
  p_data date,
  p_turnos text[],
  p_justificativa text,
  p_confirmar_cancelamento boolean default false,
  p_ids_reservas_confirmadas bigint[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_adm bigint;
  v_turnos text[] := array[]::text[];
  v_periodos tstzrange[] := array[]::tstzrange[];
  v_ids_afetadas bigint[] := array[]::bigint[];
  v_ids_confirmadas bigint[] := array[]::bigint[];
  v_reservas_afetadas jsonb := '[]'::jsonb;
  v_lista_alterada boolean := false;
  v_bloqueios_criados integer := 0;
  v_canceladas integer := 0;
begin
  select id_adm into v_id_adm
  from public.administradores
  where uuid = auth.uid();

  if v_id_adm is null then
    raise exception 'Apenas administradores podem realizar uma interdição emergencial.'
      using errcode = '42501';
  end if;

  if p_tipo not in ('sala', 'equipamento') then
    raise exception 'Tipo de recurso inválido.';
  end if;

  if p_data is null then
    raise exception 'Informe a data da interdição emergencial.';
  end if;

  if char_length(btrim(coalesce(p_justificativa, ''))) not between 1 and 500 then
    raise exception 'A justificativa pública deve ter entre 1 e 500 caracteres.';
  end if;

  select coalesce(
    array_agg(turno order by array_position(array['manha', 'tarde', 'noite'], turno)),
    array[]::text[]
  )
  into v_turnos
  from (
    select distinct lower(btrim(turno_informado)) as turno
    from unnest(coalesce(p_turnos, array[]::text[])) as turnos(turno_informado)
    where nullif(btrim(turno_informado), '') is not null
  ) turnos_normalizados;

  if cardinality(v_turnos) = 0 then
    raise exception 'Selecione ao menos um turno afetado.';
  end if;

  if exists (
    select 1
    from unnest(v_turnos) as turno
    where turno not in ('manha', 'tarde', 'noite')
  ) then
    raise exception 'Turno inválido. Use manha, tarde ou noite.';
  end if;

  select array_agg(
    tstzrange(
      (p_data + case turno
        when 'manha' then time '07:00'
        when 'tarde' then time '12:00'
        else time '18:00'
      end) at time zone 'America/Sao_Paulo',
      (p_data + case turno
        when 'manha' then time '12:00'
        when 'tarde' then time '18:00'
        else time '22:00'
      end) at time zone 'America/Sao_Paulo',
      '[)'
    )
    order by array_position(array['manha', 'tarde', 'noite'], turno)
  )
  into v_periodos
  from unnest(v_turnos) as turno;

  if p_tipo = 'sala' then
    perform 1
    from public.salas
    where id_sala = p_id_recurso
    for update;

    if not found then
      raise exception 'Sala não encontrada.';
    end if;

    select
      coalesce(array_agg(afetada.reserva_id order by afetada.reserva_id), array[]::bigint[]),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', afetada.reserva_id,
            'status', afetada.status,
            'inicio', afetada.inicio,
            'fim', afetada.fim,
            'usuario_nome', afetada.usuario_nome,
            'usuario_email', afetada.usuario_email,
            'usuario_matricula', afetada.usuario_matricula,
            'quantidade', null
          ) order by afetada.inicio
        ),
        '[]'::jsonb
      )
    into v_ids_afetadas, v_reservas_afetadas
    from (
      select
        reserva.id as reserva_id,
        reserva.status::text as status,
        reserva.inicio,
        reserva.fim,
        usuario.nome as usuario_nome,
        usuario.email as usuario_email,
        usuario.matricula as usuario_matricula
      from public.reservas_salas reserva
      join public.usuarios usuario on usuario.id_usuario = reserva.id_usuario
      where reserva.id_sala = p_id_recurso
        and reserva.status in ('pendente', 'aprovada')
        and exists (
          select 1
          from unnest(v_periodos) as periodo
          where tstzrange(reserva.inicio, reserva.fim, '[)') && periodo
        )
    ) afetada;
  else
    perform 1
    from public.equipamentos
    where id = p_id_recurso
    for update;

    if not found then
      raise exception 'Equipamento não encontrado.';
    end if;

    select
      coalesce(array_agg(afetada.reserva_id order by afetada.reserva_id), array[]::bigint[]),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', afetada.reserva_id,
            'status', afetada.status,
            'inicio', afetada.inicio,
            'fim', afetada.fim,
            'usuario_nome', afetada.usuario_nome,
            'usuario_email', afetada.usuario_email,
            'usuario_matricula', afetada.usuario_matricula,
            'quantidade', afetada.quantidade
          ) order by afetada.inicio
        ),
        '[]'::jsonb
      )
    into v_ids_afetadas, v_reservas_afetadas
    from (
      select
        reserva.id as reserva_id,
        reserva.status::text as status,
        reserva.inicio,
        reserva.fim,
        usuario.nome as usuario_nome,
        usuario.email as usuario_email,
        usuario.matricula as usuario_matricula,
        coalesce(reserva.quantidade, 1) as quantidade
      from public.reservas_equipamentos reserva
      join public.usuarios usuario on usuario.id_usuario = reserva.id_usuario
      where reserva.id_equipamento = p_id_recurso
        and reserva.status in ('pendente', 'aprovada')
        and exists (
          select 1
          from unnest(v_periodos) as periodo
          where tstzrange(reserva.inicio, reserva.fim, '[)') && periodo
        )
    ) afetada;
  end if;

  if p_ids_reservas_confirmadas is not null then
    select coalesce(array_agg(id order by id), array[]::bigint[])
    into v_ids_confirmadas
    from (
      select distinct unnest(p_ids_reservas_confirmadas) as id
    ) confirmada;
  end if;

  v_lista_alterada := p_confirmar_cancelamento
    and cardinality(v_ids_afetadas) > 0
    and v_ids_confirmadas is distinct from v_ids_afetadas;

  if cardinality(v_ids_afetadas) > 0
    and (not p_confirmar_cancelamento or v_lista_alterada) then
    return jsonb_build_object(
      'sucesso', false,
      'requer_confirmacao', true,
      'lista_alterada', v_lista_alterada,
      'reservas_afetadas', v_reservas_afetadas
    );
  end if;

  insert into public.bloqueios_manutencao (
    id_sala,
    id_equipamento,
    id_adm,
    inicio,
    fim,
    motivo
  )
  select
    case when p_tipo = 'sala' then p_id_recurso else null end,
    case when p_tipo = 'equipamento' then p_id_recurso else null end,
    v_id_adm,
    lower(periodo),
    upper(periodo),
    btrim(p_justificativa)
  from unnest(v_periodos) as periodo
  where not exists (
    select 1
    from public.bloqueios_manutencao bloqueio
    where (
      (p_tipo = 'sala' and bloqueio.id_sala = p_id_recurso)
      or (p_tipo = 'equipamento' and bloqueio.id_equipamento = p_id_recurso)
    )
      and bloqueio.inicio = lower(periodo)
      and bloqueio.fim = upper(periodo)
  );

  get diagnostics v_bloqueios_criados = row_count;

  if cardinality(v_ids_afetadas) > 0 then
    if p_tipo = 'sala' then
      update public.reservas_salas
      set status = 'cancelada',
          id_adm = v_id_adm,
          cancelada_por_administracao = true,
          justificativa_cancelamento = btrim(p_justificativa)
      where id = any(v_ids_afetadas)
        and status in ('pendente', 'aprovada');
    else
      update public.reservas_equipamentos
      set status = 'cancelada',
          status_devolucao = 'devolvido',
          id_adm = v_id_adm,
          cancelada_por_administracao = true,
          justificativa_cancelamento = btrim(p_justificativa)
      where id = any(v_ids_afetadas)
        and status in ('pendente', 'aprovada');
    end if;

    get diagnostics v_canceladas = row_count;
  end if;

  return jsonb_build_object(
    'sucesso', true,
    'bloqueios_criados', v_bloqueios_criados,
    'reservas_canceladas', v_canceladas,
    'turnos', v_turnos
  );
end;
$$;

revoke all on function public.interditar_recurso_emergencial(
  text,
  bigint,
  date,
  text[],
  text,
  boolean,
  bigint[]
) from public, anon;

grant execute on function public.interditar_recurso_emergencial(
  text,
  bigint,
  date,
  text[],
  text,
  boolean,
  bigint[]
) to authenticated;
