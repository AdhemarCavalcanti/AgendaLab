-- =========================================================================
-- AgendaLab — Teto Semanal de Horas de Reserva por Aluno para Recursos Concorridos
-- Garante oportunidades iguais para todos os alunos, impedindo o monopólio
-- de horários para equipamentos e recursos concorridos.
-- =========================================================================

begin;

-- 1) Função para consultar o total de horas agendadas por um aluno na semana vigente
create or replace function public.calcular_horas_semana_usuario(
  p_id_usuario bigint,
  p_tipo text,
  p_id_recurso bigint,
  p_data timestamptz
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio_semana timestamptz;
  v_fim_semana timestamptz;
  v_total_segundos numeric := 0;
begin
  -- Semana de segunda a domingo (date_trunc 'week' inicia na segunda-feira 00:00 UTC)
  v_inicio_semana := date_trunc('week', p_data);
  v_fim_semana := v_inicio_semana + interval '7 days';

  if p_tipo = 'equipamento' then
    select coalesce(sum(extract(epoch from (fim - inicio))), 0)
    into v_total_segundos
    from public.reservas_equipamentos
    where id_usuario = p_id_usuario
      and id_equipamento = p_id_recurso
      and status in ('pendente', 'aprovada')
      and inicio >= v_inicio_semana
      and inicio < v_fim_semana;
  elsif p_tipo = 'sala' then
    select coalesce(sum(extract(epoch from (fim - inicio))), 0)
    into v_total_segundos
    from public.reservas_salas
    where id_usuario = p_id_usuario
      and id_sala = p_id_recurso
      and status in ('pendente', 'aprovada')
      and inicio >= v_inicio_semana
      and inicio < v_fim_semana;
  end if;

  return round(v_total_segundos / 3600.0, 2);
end;
$$;

-- 2) Função da Trigger para validação do teto semanal antes de salvar reserva
create or replace function public.validar_teto_semanal_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teto_horas constant numeric := 4.0;
  v_duracao_horas numeric;
  v_horas_atuais numeric;
  v_tipo text;
  v_id_recurso bigint;
begin
  -- Apenas reservas com status ativo consomem o teto de horas
  if NEW.status not in ('pendente', 'aprovada') then
    return NEW;
  end if;

  v_duracao_horas := extract(epoch from (NEW.fim - NEW.inicio)) / 3600.0;

  if TG_TABLE_NAME = 'reservas_equipamentos' then
    v_tipo := 'equipamento';
    v_id_recurso := NEW.id_equipamento;

    select coalesce(sum(extract(epoch from (fim - inicio))), 0) / 3600.0
    into v_horas_atuais
    from public.reservas_equipamentos
    where id_usuario = NEW.id_usuario
      and id_equipamento = v_id_recurso
      and status in ('pendente', 'aprovada')
      and id <> coalesce(NEW.id, 0)
      and inicio >= date_trunc('week', NEW.inicio)
      and inicio < date_trunc('week', NEW.inicio) + interval '7 days';
  else
    v_tipo := 'sala';
    v_id_recurso := NEW.id_sala;

    select coalesce(sum(extract(epoch from (fim - inicio))), 0) / 3600.0
    into v_horas_atuais
    from public.reservas_salas
    where id_usuario = NEW.id_usuario
      and id_sala = v_id_recurso
      and status in ('pendente', 'aprovada')
      and id <> coalesce(NEW.id, 0)
      and inicio >= date_trunc('week', NEW.inicio)
      and inicio < date_trunc('week', NEW.inicio) + interval '7 days';
  end if;

  if (v_horas_atuais + v_duracao_horas) > v_teto_horas then
    raise exception 'Limite semanal de horas excedido. Esta solicitação (%h) ultrapassa o teto semanal de %h (você já possui %h agendadas nesta semana).',
      round(v_duracao_horas, 1),
      v_teto_horas,
      round(v_horas_atuais, 1);
  end if;

  return NEW;
end;
$$;

-- 3) Triggers nas tabelas de reservas de equipamentos e salas
drop trigger if exists trg_validar_teto_semanal_reserva_equip on public.reservas_equipamentos;
create trigger trg_validar_teto_semanal_reserva_equip
  before insert or update of inicio, fim, status
  on public.reservas_equipamentos
  for each row
  execute function public.validar_teto_semanal_reserva();

drop trigger if exists trg_validar_teto_semanal_reserva_sala on public.reservas_salas;
create trigger trg_validar_teto_semanal_reserva_sala
  before insert or update of inicio, fim, status
  on public.reservas_salas
  for each row
  execute function public.validar_teto_semanal_reserva();

commit;

