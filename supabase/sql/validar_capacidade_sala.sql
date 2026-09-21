-- =========================================================================
-- AgendaLab — Validação de Capacidade Máxima / Lotação em Reservas de Salas
-- Garante que nenhuma reserva ultrapasse a capacidade de pessoas permitida no espaço.
-- =========================================================================

begin;

-- 1) Função de validação executada via Trigger em reservas_salas
create or replace function public.validar_lotacao_reserva_sala()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lotacao integer;
begin
  -- Validação: Quantidade de pessoas deve ser inteiro maior que zero
  if NEW.quantidade_pessoas is null or NEW.quantidade_pessoas < 1 then
    raise exception 'A quantidade de pessoas deve ser maior que zero.';
  end if;

  -- Consulta da lotação máxima cadastrada para o espaço
  select lotacao into v_lotacao
  from public.salas
  where id_sala = NEW.id_sala;

  if v_lotacao is not null and NEW.quantidade_pessoas > v_lotacao then
    raise exception 'A lotação máxima permitida para este espaço é de % pessoas.', v_lotacao;
  end if;

  return NEW;
end;
$$;

-- 2) Criação da trigger Before Insert / Update
drop trigger if exists trg_validar_lotacao_reserva_sala on public.reservas_salas;
create trigger trg_validar_lotacao_reserva_sala
  before insert or update of id_sala, quantidade_pessoas
  on public.reservas_salas
  for each row
  execute function public.validar_lotacao_reserva_sala();

-- 3) Atualização da RPC solicitar_reserva para incluir a validação no payload antes da persistência
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
  v_lotacao integer;
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

    select lotacao into v_lotacao
    from public.salas
    where id_sala = p_id_recurso;

    if v_lotacao is not null and p_quantidade_pessoas > v_lotacao then
      raise exception 'A lotação máxima permitida para este espaço é de % pessoas.', v_lotacao;
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
    if coalesce(p_quantidade_equipamento, 0) < 1 then
      raise exception 'A quantidade de equipamento deve ser maior que zero.';
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

    return jsonb_build_object(
      'sucesso', true,
      'id', v_novo_id,
      'tipo', 'equipamento'
    );
  else
    raise exception 'Tipo de recurso inválido: %', p_tipo;
  end if;
end;
$$;

commit;

