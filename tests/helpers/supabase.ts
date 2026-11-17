import { expect } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
// HTTP integration fixture; SQL/RLS is exercised separately against PostgreSQL/PGlite.
// This does not contact a production Supabase project or use operational data.
export const project = 'https://testproject.supabase.co'
const users = {
  'coordinator@example.invalid': {
    id: '00000000-0000-4000-8000-000000000001',
    role: 'coordinator',
    station_id: 'T05',
  },
  'operator@example.invalid': {
    id: '00000000-0000-4000-8000-000000000002',
    role: 'operator',
    station_id: 'T02',
  },
}
type Package = {
  payload: { package_version: number; slots: Record<string, unknown>[] }
}
type RecordRow = {
  seq: number
  payload: Record<string, unknown>
  received_at: string
}
export function fixture() {
  const packages: Package[] = [],
    records: RecordRow[] = []
  let failPush = false
  let schemaReady = true
  let gate: {
    count: number
    holding: boolean
    promise: Promise<void>
    release: () => void
  } | null = null
  return {
    packages,
    records,
    holdSecondRead: () => {
      let release = () => {}
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      const selected = { count: 0, holding: false, promise, release }
      gate = selected
      return { holding: () => selected.holding, release }
    },
    setSchemaReady: (value: boolean) => {
      schemaReady = value
    },
    failNextPush: () => {
      failPush = true
    },
    install: async (context: BrowserContext) => {
      await context.route(`${project}/**`, async (route) => {
        const request = route.request(),
          url = new URL(request.url())
        const headers = {
          'access-control-allow-origin': 'http://localhost:4173',
          'access-control-allow-headers':
            'authorization,apikey,x-client-info,content-type,prefer,range,x-supabase-api-version,accept-profile,content-profile',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        }
        const respond = (data: unknown, status = 200) =>
          route.fulfill({
            status,
            headers,
            contentType: 'application/json',
            body: JSON.stringify(data),
          })
        if (request.method() === 'OPTIONS')
          return route.fulfill({ status: 204, headers })
        if (url.pathname === '/auth/v1/settings')
          return respond({ external: { email: true } })
        if (url.pathname === '/auth/v1/token') {
          const input = request.postDataJSON() as { email: keyof typeof users }
          const u = users[input.email]
          if (!u) return respond({ msg: 'Invalid login credentials' }, 400)
          const exp = Math.floor(Date.now() / 1000) + 3600
          const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: u.id, role: 'authenticated', email: input.email, exp })).toString('base64url')}.synthetic-signature`
          return respond({
            access_token: jwt,
            refresh_token: 'synthetic-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: exp,
            user: {
              id: u.id,
              aud: 'authenticated',
              role: 'authenticated',
              email: input.email,
              app_metadata: { provider: 'email' },
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          })
        }
        if (url.pathname === '/auth/v1/logout')
          return route.fulfill({ status: 204, headers })
        if (url.pathname === '/rest/v1/rpc/rsas_status') {
          if (!schemaReady)
            return respond(
              {
                code: 'PGRST202',
                message:
                  'Could not find the function public.rsas_status in the schema cache',
              },
              404,
            )
          const token =
            request.headers().authorization?.replace('Bearer ', '') || ''
          const subject = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64url').toString(),
          ).sub
          const u = Object.values(users).find((user) => user.id === subject)
          return u
            ? respond({ role: u.role, station_id: u.station_id })
            : respond({ message: 'RSAS_MEMBER_REQUIRED' }, 403)
        }
        if (url.pathname === '/rest/v1/rpc/rsas_publish_package') {
          const p = request.postDataJSON().p_package
          if (
            !packages.some(
              (x) => x.payload.package_version === p.package_version,
            )
          )
            packages.push({ payload: p })
          return respond(null)
        }
        if (url.pathname === '/rest/v1/rpc/rsas_push_records') {
          if (failPush) {
            failPush = false
            return respond({ message: 'temporary unavailable' }, 503)
          }
          const payload = request.postDataJSON()
          for (const record of payload.p_records as Record<string, unknown>[]) {
            expect(record).not.toHaveProperty('token')
            expect(record).not.toHaveProperty('tokenHash')
            if (!records.some((r) => r.payload.record_id === record.record_id))
              records.push({
                seq: records.length + 1,
                payload: record,
                received_at: new Date().toISOString(),
              })
          }
          return respond(payload.p_records.length)
        }
        if (url.pathname === '/rest/v1/rsas_packages') return respond(packages)
        if (url.pathname === '/rest/v1/rsas_records') {
          if (gate) {
            gate.count++
            if (gate.count === 2) {
              const selected = gate
              selected.holding = true
              await selected.promise
              gate = null
            }
          }
          const cursor = Number(
            (url.searchParams.get('seq') || 'gt.0').slice(3),
          )
          return respond(records.filter((r) => r.seq > cursor))
        }
        return respond({ message: 'Unexpected fixture request' }, 500)
      })
    },
  }
}
