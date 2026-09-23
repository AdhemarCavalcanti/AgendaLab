-- Execute depois de acessorios_reserva_sala.sql. A RPC existente continua
-- responsável por criar cada reserva e seus acessórios na mesma transação.
begin;

create or replace function public.solicitar_reservas_semanais(
  p_tipo text,
  p_id_recurso bigint,
  p_id_usuario bigint,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_data_termino date,
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
  v_inicio_local timestamp := p_inicio at time zone 'America/Sao_Paulo';
  v_fim_local timestamp := p_fim at time zone 'America/Sao_Paulo';
  v_total integer;
  v_indice integer;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_data text;
  v_equipamento record;
  v_estoque integer;
  v_uso integer;
  v_ids jsonb := '[]'::jsonb;
  v_reserva jsonb;
begin
  if not exists (
    select 1 from public.usuarios
    where id_usuario = p_id_usuario and uuid = (select auth.uid())
  ) then
    raise exception 'Usuário da reserva não corresponde à conta autenticada.'
      using errcode = '42501';
  end if;

  if p_tipo not in ('sala', 'equipamento') or p_tipo is null then
    raise exception 'Tipo de recurso inválido.';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio
     or v_inicio_local::date <> v_fim_local::date then
    raise exception 'O período da reserva deve começar e terminar no mesmo dia.';
  end if;
  if p_data_termino is null then
    raise exception 'Informe a data de término da repetição.';
  end if;

  v_total := ((p_data_termino - v_inicio_local::date) / 7) + 1;
  if v_total < 2 or p_data_termino < v_inicio_local::date + 7 then
    raise exception 'A repetição semanal precisa incluir ao menos duas datas.';
  end if;
  if v_total > 52 then
    raise exception 'A repetição semanal permite até 52 reservas.';
  end if;

  p_acessorios := coalesce(p_acessorios, '[]'::jsonb);
  if jsonb_typeof(p_acessorios) <> 'array' then
    raise exception 'A lista de acessórios deve ser um array JSON.';
  end if;
  if p_tipo = 'equipamento' and jsonb_array_length(p_acessorios) > 0 then
    raise exception 'Acessórios adicionais só podem acompanhar uma reserva de sala.';
  end if;

  -- Os locks permanecem até a transação terminar. Eles serializam pedidos
  -- concorrentes e tornam a validação de todas as datas consistente.
  if p_tipo = 'sala' then
    perform 1 from public.salas where id_sala = p_id_recurso and status = 'livre' for update;
    if not found then
      raise exception 'A sala não está disponível.';
    end if;
  else
    select quantidade into v_estoque
    from public.equipamentos
    where id = p_id_recurso and status = 'livre'
    for update;
    if not found then
      raise exception 'O equipamento não está disponível.';
    end if;
    if coalesce(p_quantidade_equipamento, 0) < 1 then
      raise exception 'A quantidade do equipamento deve ser maior que zero.';
    end if;
  end if;

  -- Normaliza IDs repetidos e bloqueia acessórios sempre na mesma ordem.
  for v_equipamento in
    select item.id_equipamento, sum(item.quantidade)::integer as quantidade
    from jsonb_to_recordset(p_acessorios)
      as item(id_equipamento bigint, quantidade integer)
    group by item.id_equipamento
    order by item.id_equipamento
  loop
    if v_equipamento.id_equipamento is null
       or v_equipamento.quantidade is null
       or v_equipamento.quantidade < 1 then
      raise exception 'Cada acessório deve informar equipamento e quantidade maior que zero.';
    end if;

    select quantidade into v_estoque
    from public.equipamentos
    where id = v_equipamento.id_equipamento and status = 'livre'
    for update;
    if not found or v_estoque < v_equipamento.quantidade then
      raise exception 'Um acessório selecionado não está disponível.';
    end if;
  end loop;

  -- Valida a série completa antes do primeiro INSERT. As triggers da RPC
  -- individual continuam sendo a última proteção contra conflitos.
  for v_indice in 0..v_total - 1 loop
    v_inicio := (v_inicio_local + v_indice * interval '7 days') at time zone 'America/Sao_Paulo';
    v_fim := (v_fim_local + v_indice * interval '7 days') at time zone 'America/Sao_Paulo';
    v_data := to_char(v_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');

    if exists (
      select 1 from public.bloqueios_manutencao
      where ((p_tipo = 'sala' and id_sala = p_id_recurso)
          or (p_tipo = 'equipamento' and id_equipamento = p_id_recurso))
        and tstzrange(inicio, fim) && tstzrange(v_inicio, v_fim)
    ) then
      raise exception 'Série indisponível em %: recurso em manutenção.', v_data
        using errcode = '23P01';
    end if;

    if p_tipo = 'sala' then
      if exists (
        select 1 from public.reservas_salas
        where id_sala = p_id_recurso and status in ('pendente', 'aprovada')
          and tstzrange(inicio, fim) && tstzrange(v_inicio, v_fim)
      ) then
        raise exception 'Série indisponível em %: sala já reservada.', v_data
          using errcode = '23P01';
      end if;
    else
      select coalesce(sum(coalesce(quantidade, 1)), 0) into v_uso
      from public.reservas_equipamentos
      where id_equipamento = p_id_recurso and status in ('pendente', 'aprovada')
        and tstzrange(inicio, fim) && tstzrange(v_inicio, v_fim);
      if v_uso + p_quantidade_equipamento > v_estoque then
        raise exception 'Série indisponível em %: estoque insuficiente.', v_data
          using errcode = '23P01';
      end if;
    end if;

    for v_equipamento in
      select item.id_equipamento, sum(item.quantidade)::integer as quantidade
      from jsonb_to_recordset(p_acessorios)
        as item(id_equipamento bigint, quantidade integer)
      group by item.id_equipamento
      order by item.id_equipamento
    loop
      if exists (
        select 1 from public.bloqueios_manutencao
        where id_equipamento = v_equipamento.id_equipamento
          and tstzrange(inicio, fim) && tstzrange(v_inicio, v_fim)
      ) then
        raise exception 'Série indisponível em %: acessório em manutenção.', v_data
          using errcode = '23P01';
      end if;

      select e.quantidade, coalesce(sum(case when r.id is null then 0 else coalesce(r.quantidade, 1) end), 0)
        into v_estoque, v_uso
      from public.equipamentos e
      left join public.reservas_equipamentos r
        on r.id_equipamento = e.id and r.status in ('pendente', 'aprovada')
        and tstzrange(r.inicio, r.fim) && tstzrange(v_inicio, v_fim)
      where e.id = v_equipamento.id_equipamento
      group by e.quantidade;
      if v_uso + v_equipamento.quantidade > v_estoque then
        raise exception 'Série indisponível em %: estoque de acessório insuficiente.', v_data
          using errcode = '23P01';
      end if;
    end loop;
  end loop;

  for v_indice in 0..v_total - 1 loop
    v_inicio := (v_inicio_local + v_indice * interval '7 days') at time zone 'America/Sao_Paulo';
    v_fim := (v_fim_local + v_indice * interval '7 days') at time zone 'America/Sao_Paulo';
    v_reserva := public.solicitar_reserva(
      p_tipo, p_id_recurso, p_id_usuario, v_inicio, v_fim,
      p_motivo, p_quantidade_pessoas, p_quantidade_equipamento,
      p_observacao, p_acessorios
    );
    v_ids := v_ids || jsonb_build_array(v_reserva -> 'id');
  end loop;

  return jsonb_build_object('sucesso', true, 'quantidade', v_total, 'ids', v_ids);
end;
$$;

revoke all on function public.solicitar_reservas_semanais(
  text, bigint, bigint, timestamptz, timestamptz, date,
  text, integer, integer, text, jsonb
) from public, anon;
grant execute on function public.solicitar_reservas_semanais(
  text, bigint, bigint, timestamptz, timestamptz, date,
  text, integer, integer, text, jsonb
) to authenticated;

commit;
