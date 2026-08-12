import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">ePTW</h1>

      <p className="mt-4">
        Supabase connection test
      </p>

      <pre className="mt-4">
        {JSON.stringify({ data, error }, null, 2)}
      </pre>
    </main>
  )
}