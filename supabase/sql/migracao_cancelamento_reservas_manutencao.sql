-- =========================================================================
-- AgendaLab — Cancelamento confirmado de reservas afetadas por manutenção
-- Pré-requisitos:
--   1. supabase/sql/notificacoes_alunos.sql
--   2. supabase/sql/bloqueios_manutencao.sql
-- Execute este arquivo inteiro no SQL Editor para atualizar um banco existente.
-- =========================================================================

-- 1) A notificação passa a cobrir também reservas já aprovadas que precisem ser
-- canceladas. A RPC abaixo informa a justificativa da manutenção por uma
-- configuração local à transação, evitando alterar o motivo original da reserva.
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

drop trigger if exists trg_notificacao_reserva_sala on public.reservas_salas;
create trigger trg_notificacao_reserva_sala
  after update on public.reservas_salas
  for each row
  execute function public.processar_notificacao_reserva();

drop trigger if exists trg_notificacao_reserva_equipamento on public.reservas_equipamentos;
create trigger trg_notificacao_reserva_equipamento
  after update on public.reservas_equipamentos
  for each row
  execute function public.processar_notificacao_reserva();

-- 2) Uma única transação bloqueia o recurso, revalida as reservas mostradas na
-- confirmação, cria a interdição e cancela as reservas afetadas.
create or replace function public.interditar_recurso_manutencao(
  p_tipo text,
  p_id_recurso bigint,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo text,
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
  v_id_bloqueio bigint;
  v_ids_afetadas bigint[] := array[]::bigint[];
  v_ids_confirmadas bigint[] := array[]::bigint[];
  v_reservas_afetadas jsonb := '[]'::jsonb;
  v_canceladas integer := 0;
  v_lista_alterada boolean := false;
begin
  select id_adm into v_id_adm
  from public.administradores
  where uuid = auth.uid();

  if v_id_adm is null then
    raise exception 'Apenas administradores podem interditar recursos.'
      using errcode = '42501';
  end if;

  if p_tipo not in ('sala', 'equipamento') then
    raise exception 'Tipo de recurso inválido.';
  end if;

  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'O fim da interdição deve ser posterior ao início.';
  end if;

  if char_length(btrim(coalesce(p_motivo, ''))) not between 1 and 500 then
    raise exception 'A justificativa da manutenção deve ter entre 1 e 500 caracteres.';
  end if;

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
        and tstzrange(reserva.inicio, reserva.fim, '[)') && tstzrange(p_inicio, p_fim, '[)')
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
        and tstzrange(reserva.inicio, reserva.fim, '[)') && tstzrange(p_inicio, p_fim, '[)')
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
  ) values (
    case when p_tipo = 'sala' then p_id_recurso else null end,
    case when p_tipo = 'equipamento' then p_id_recurso else null end,
    v_id_adm,
    p_inicio,
    p_fim,
    btrim(p_motivo)
  )
  returning id into v_id_bloqueio;

  if cardinality(v_ids_afetadas) > 0 then
    perform set_config('agendalab.motivo_manutencao', btrim(p_motivo), true);

    if p_tipo = 'sala' then
      update public.reservas_salas
      set status = 'cancelada',
          id_adm = v_id_adm
      where id = any(v_ids_afetadas)
        and status in ('pendente', 'aprovada');
    else
      update public.reservas_equipamentos
      set status = 'cancelada',
          status_devolucao = 'devolvido',
          id_adm = v_id_adm
      where id = any(v_ids_afetadas)
        and status in ('pendente', 'aprovada');
    end if;

    get diagnostics v_canceladas = row_count;
  end if;

  return jsonb_build_object(
    'sucesso', true,
    'id_bloqueio', v_id_bloqueio,
    'reservas_canceladas', v_canceladas
  );
end;
$$;

revoke all on function public.interditar_recurso_manutencao(
  text,
  bigint,
  timestamptz,
  timestamptz,
  text,
  boolean,
  bigint[]
) from public, anon;

grant execute on function public.interditar_recurso_manutencao(
  text,
  bigint,
  timestamptz,
  timestamptz,
  text,
  boolean,
  bigint[]
) to authenticated;
