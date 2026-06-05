const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  email: process.env.TRACKY_TEST_EMAIL,
  password: process.env.TRACKY_TEST_PASSWORD,
  dateKey: process.env.TRACKY_TEST_DATE ?? new Date().toISOString().slice(0, 10),
}

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function assertEnv(value, name) {
  if (!value) fail(`Missing ${name}`)
  return value
}

async function request(url, init = {}) {
  const response = await fetch(url, init)
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`)
  }

  return body
}

function isoRange(dateKey) {
  const start = `${dateKey}T00:00:00.000Z`
  const nextDay = new Date(`${dateKey}T00:00:00.000Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const end = nextDay.toISOString()
  return { start, end }
}

function uniqueTitle(prefix) {
  return `${prefix} ${new Date().toISOString()}`
}

async function main() {
  const supabaseUrl = assertEnv(env.supabaseUrl, 'SUPABASE_URL or VITE_SUPABASE_URL')
  const anonKey = assertEnv(env.anonKey, 'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY')
  const email = assertEnv(env.email, 'TRACKY_TEST_EMAIL')
  const password = assertEnv(env.password, 'TRACKY_TEST_PASSWORD')
  const { start, end } = isoRange(env.dateKey)

  console.log(`Running Tracky backend test against ${supabaseUrl}`)
  console.log(`Date window: ${start} -> ${end}`)

  const authResponse = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const accessToken = authResponse.access_token
  const userId = authResponse.user?.id

  if (!accessToken || !userId) {
    fail('Auth response did not include access_token and user.id')
  }

  const restHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }

  const baseRestUrl = `${supabaseUrl}/rest/v1/events`

  const initialList = await request(
    `${baseRestUrl}?select=*&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&order=created_at.asc`,
    { headers: restHeaders }
  )

  if (!Array.isArray(initialList)) {
    fail('GET /events did not return an array')
  }

  const createTitle = uniqueTitle('Tracky backend test create')
  const createCreatedAt = `${env.dateKey}T14:00:00.000Z`
  const created = await request(baseRestUrl, {
    method: 'POST',
    headers: {
      ...restHeaders,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      title: createTitle,
      start_date: createCreatedAt,
      end_date: createCreatedAt,
      created_at: createCreatedAt,
    }),
  })

  const createdRow = Array.isArray(created) ? created[0] : created
  if (!createdRow?.id) {
    fail('POST /events did not return a created row with id')
  }

  const updatedTitle = `${createTitle} updated`
  const updatedCreatedAt = `${env.dateKey}T15:00:00.000Z`
  const patched = await request(`${baseRestUrl}?id=eq.${createdRow.id}`, {
    method: 'PATCH',
    headers: {
      ...restHeaders,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      title: updatedTitle,
      start_date: updatedCreatedAt,
      end_date: updatedCreatedAt,
      created_at: updatedCreatedAt,
    }),
  })

  const patchedRow = Array.isArray(patched) ? patched[0] : patched
  if (!patchedRow?.id || patchedRow.title !== updatedTitle) {
    fail('PATCH /events did not update the row as expected')
  }

  await request(`${baseRestUrl}?id=eq.${createdRow.id}`, {
    method: 'DELETE',
    headers: {
      ...restHeaders,
      Prefer: 'return=minimal',
    },
  })

  const finalList = await request(
    `${baseRestUrl}?select=*&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&order=created_at.asc`,
    { headers: restHeaders }
  )

  if (!Array.isArray(finalList)) {
    fail('Final GET /events did not return an array')
  }

  const stillPresent = finalList.some((event) => event.id === createdRow.id)
  if (stillPresent) {
    fail('Deleted event is still present after DELETE /events')
  }

  console.log('OK: auth, GET, POST, PATCH and DELETE all succeeded.')
  console.log(`Auth user: ${userId}`)
  console.log(`Initial events found: ${initialList.length}`)
  console.log(`Final events found: ${finalList.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})