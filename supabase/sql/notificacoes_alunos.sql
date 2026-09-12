-- =========================================================================
-- AgendaLab — Sistema de Avisos/Notificações para Alunos/Pesquisadores
-- Rode este script inteiro no SQL Editor do Supabase para habilitar o fluxo.
-- =========================================================================

-- 1) Criar tabela de notificações no schema public
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  id_usuario bigint not null references public.usuarios(id_usuario) on delete cascade,
  titulo text not null,
  mensagem text not null,
  lida boolean not null default false,
  criado_em timestamp with time zone not null default now()
);

-- 2) Habilitar Row Level Security (RLS)
alter table public.notificacoes enable row level security;

-- 3) Criar políticas de acesso RLS
drop policy if exists "Usuários podem ver suas próprias notificações" on public.notificacoes;
create policy "Usuários podem ver suas próprias notificações"
  on public.notificacoes
  for select
  to authenticated
  using (
    id_usuario = (select id_usuario from public.usuarios where uuid = auth.uid())
  );

drop policy if exists "Usuários podem atualizar suas próprias notificações" on public.notificacoes;
create policy "Usuários podem atualizar suas próprias notificações"
  on public.notificacoes
  for update
  to authenticated
  using (
    id_usuario = (select id_usuario from public.usuarios where uuid = auth.uid())
  );

drop policy if exists "Permitir inserção pelo sistema" on public.notificacoes;
create policy "Permitir inserção pelo sistema"
  on public.notificacoes
  for insert
  to authenticated, service_role
  with check (true);

-- 4) Função de Trigger para processar e gerar notificações de reserva automaticamente
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

-- 5) Criar os triggers nas tabelas de reservas
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
