import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create Supabase client with service role for database access
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  
  // Expected paths:
  // POST /webhook-update - receive updates from n8n with runID, pipelineID, answer
  // GET /webhook-update/status/:runID - poll for status
  
  try {
    if (req.method === 'POST') {
      // Handle webhook update from n8n
      // Expected payload: { runID, pipelineID, status, answer }
      const body = await req.json()
      const { runID, runId, pipelineID, pipelineId, status, answer } = body

      // Support both camelCase and lowercase variations
      const normalizedRunID = runID || runId
      const normalizedPipelineID = pipelineID || pipelineId

      if (!normalizedRunID) {
        return new Response(
          JSON.stringify({ error: 'runID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!status) {
        return new Response(
          JSON.stringify({ error: 'status is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`📥 Webhook update received: runID=${normalizedRunID}, pipelineID=${normalizedPipelineID}, status=${status}`)

      // Upsert the update to the database
      const { error: dbError } = await supabase
        .from('webhook_job_updates')
        .upsert({
          run_id: normalizedRunID,
          pipeline_id: normalizedPipelineID || null,
          status,
          answer: answer || null,
        }, { onConflict: 'run_id' })

      if (dbError) {
        console.error('Database error:', dbError)
        return new Response(
          JSON.stringify({ error: 'Failed to store update', details: dbError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`✅ Update stored for runID ${normalizedRunID}`)

      return new Response(
        JSON.stringify({ success: true, message: `Update received for runID ${normalizedRunID}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method === 'GET') {
      // Handle status polling: /webhook-update/status/:runID
      const statusMatch = url.pathname.match(/\/status\/([^\/]+)/)
      
      if (statusMatch) {
        const runID = statusMatch[1]
        
        // Query the database for the job status
        const { data, error: dbError } = await supabase
          .from('webhook_job_updates')
          .select('*')
          .eq('run_id', runID)
          .single()

        if (dbError && dbError.code !== 'PGRST116') { // PGRST116 = not found
          console.error('Database error:', dbError)
          return new Response(
            JSON.stringify({ error: 'Database query failed', details: dbError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (!data) {
          return new Response(
            JSON.stringify({ status: 'pending' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({
            status: data.status,
            answer: data.answer,
            runID: data.run_id,
            pipelineID: data.pipeline_id,
            meta: data.meta,
            error: data.error,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // List all jobs (for debugging)
      const { data: allJobs, error: listError } = await supabase
        .from('webhook_job_updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      return new Response(
        JSON.stringify({ jobs: allJobs || [], count: allJobs?.length || 0, error: listError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Webhook error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
