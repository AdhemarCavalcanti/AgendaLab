import { vi } from 'vitest'

export type MockQueryResult = {
  data?: any
  error?: any
  count?: number | null
}

export function createQueryChain(defaultResult: MockQueryResult = { data: [], error: null }) {
  let currentResult: MockQueryResult = { ...defaultResult }

  const chain: any = {
    _setResult(result: MockQueryResult) {
      currentResult = result
      return chain
    },
    select: vi.fn().mockImplementation((_fields?: string, _options?: any) => chain),
    insert: vi.fn().mockImplementation((_payload?: any) => chain),
    update: vi.fn().mockImplementation((_payload?: any) => chain),
    delete: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation((_col?: string, _val?: any) => chain),
    in: vi.fn().mockImplementation((_col?: string, _vals?: any[]) => chain),
    gte: vi.fn().mockImplementation((_col?: string, _val?: any) => chain),
    lte: vi.fn().mockImplementation((_col?: string, _val?: any) => chain),
    gt: vi.fn().mockImplementation((_col?: string, _val?: any) => chain),
    lt: vi.fn().mockImplementation((_col?: string, _val?: any) => chain),
    order: vi.fn().mockImplementation((_col?: string, _opts?: any) => chain),
    or: vi.fn().mockImplementation((_cond?: string) => chain),
    maybeSingle: vi.fn().mockImplementation(() => {
      // Se data for um array, retorna o primeiro item ou null
      const item = Array.isArray(currentResult.data) ? currentResult.data[0] ?? null : currentResult.data
      return Promise.resolve({ data: item, error: currentResult.error })
    }),
    single: vi.fn().mockImplementation(() => {
      const item = Array.isArray(currentResult.data) ? currentResult.data[0] ?? null : currentResult.data
      return Promise.resolve({ data: item, error: currentResult.error })
    }),
    then(resolve: (value: any) => any, reject?: (reason: any) => any) {
      return Promise.resolve(currentResult).then(resolve, reject)
    },
  }

  return chain
}

export function createSupabaseMock() {
  const tableChains: Record<string, any> = {}
  const rpcHandlers: Record<string, any> = {}

  const authStateChangeCallbacks: Array<(event: string, session: any) => void> = []

  const mockChannel: any = {
    on: vi.fn().mockImplementation((_event: any, _config: any, _callback: any) => mockChannel),
    subscribe: vi.fn().mockImplementation(() => mockChannel),
  }

  const supabaseMock = {
    from: vi.fn().mockImplementation((table: string) => {
      if (!tableChains[table]) {
        tableChains[table] = createQueryChain()
      }
      return tableChains[table]
    }),
    rpc: vi.fn().mockImplementation((fn: string, params: any) => {
      if (rpcHandlers[fn]) {
        return typeof rpcHandlers[fn] === 'function' ? rpcHandlers[fn](params) : rpcHandlers[fn]
      }
      return Promise.resolve({ data: null, error: null })
    }),
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: vi.fn().mockReturnValue(true),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockImplementation((cb: (event: string, session: any) => void) => {
        authStateChangeCallbacks.push(cb)
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        }
      }),
    },
    // Métodos utilitários de auxílio aos testes
    _setTableResult(table: string, result: MockQueryResult) {
      if (!tableChains[table]) {
        tableChains[table] = createQueryChain(result)
      } else {
        tableChains[table]._setResult(result)
      }
      return tableChains[table]
    },
    _setRpcHandler(fn: string, handler: (params: any) => Promise<{ data: any; error: any }>) {
      rpcHandlers[fn] = handler
    },
    _triggerAuthStateChange(event: string, session: any) {
      authStateChangeCallbacks.forEach((cb) => cb(event, session))
    },
    _mockChannel: mockChannel,
  }

  return supabaseMock
}
