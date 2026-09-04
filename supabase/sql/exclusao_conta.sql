-- =========================================================================
-- AgendaLab — Exclusão de Conta, Anonimização de Dados e Cancelamento de Reservas
-- Execute este script no SQL Editor do Supabase para habilitar a RPC de exclusão.
-- =========================================================================

create or replace function public.excluir_minha_conta()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_id_usuario bigint;
  v_id_adm bigint;
  v_qtd_salas int := 0;
  v_qtd_equip int := 0;
  v_qtd_reservas_canceladas int := 0;
begin
  -- 1) Identificar usuário logado via JWT do Supabase
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Acesso negado: usuário não autenticado.';
  end if;

  -- 2) Verificar se é aluno/pesquisador na tabela public.usuarios
  select id_usuario into v_id_usuario
  from public.usuarios
  where uuid = v_uid;

  if v_id_usuario is not null then
    -- a) Cancelar reservas futuras ativas de salas (pendentes ou aprovadas)
    update public.reservas_salas
    set status = 'cancelada',
        motivo = coalesce(motivo || ' | ', '') || 'Cancelada automaticamente devido à exclusão da conta do usuário'
    where id_usuario = v_id_usuario
      and status in ('pendente', 'aprovada')
      and fim >= now();
    get diagnostics v_qtd_salas = row_count;

    -- b) Cancelar reservas futuras ativas de equipamentos (pendentes ou aprovadas)
    update public.reservas_equipamentos
    set status = 'cancelada',
        motivo = coalesce(motivo || ' | ', '') || 'Cancelada automaticamente devido à exclusão da conta do usuário'
    where id_usuario = v_id_usuario
      and status in ('pendente', 'aprovada')
      and fim >= now();
    get diagnostics v_qtd_equip = row_count;

    v_qtd_reservas_canceladas := v_qtd_salas + v_qtd_equip;

    -- c) Limpar notificações da conta
    delete from public.notificacoes
    where id_usuario = v_id_usuario;

    -- d) Anonimizar dados cadastrais e desativar perfil do usuário (desvincula uuid)
    update public.usuarios
    set nome = 'Usuário Removido',
        email = 'anonimizado_' || v_id_usuario || '_' || floor(extract(epoch from now())) || '@removido.agendalab.local',
        matricula = null,
        uuid = null
    where id_usuario = v_id_usuario;

  else
    -- 3) Verificar se é administrador na tabela public.administradores
    select id_adm into v_id_adm
    from public.administradores
    where uuid = v_uid;

    if v_id_adm is not null then
      -- Anonimizar dados do administrador e desativar perfil
      update public.administradores
      set nome = 'Administrador Removido',
          email = 'anonimizado_adm_' || v_id_adm || '_' || floor(extract(epoch from now())) || '@removido.agendalab.local',
          codigo = null,
          uuid = null
      where id_adm = v_id_adm;
    else
      raise exception 'Perfil de usuário não localizado no sistema.';
    end if;
  end if;

  -- 4) Excluir conta em auth.users para revogar a autenticação permanentemente
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'sucesso', true,
    'reservas_canceladas', v_qtd_reservas_canceladas
  );
end;
$$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
