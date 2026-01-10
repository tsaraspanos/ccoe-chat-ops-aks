const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// In-memory store for job updates (note: this resets on function cold start)
// For production, consider using a database table instead
const jobUpdates = new Map<string, { 
  status: string; 
  answer?: string; 
  runID?: string;
  pipelineID?: string;
  meta?: Record<string, unknown>; 
  error?: string 
}>()

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
      const body = await req.json()
      const { runID, runId, pipelineID, pipelineId, status, answer, meta, error } = body

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

      // Store the update
      const update = { 
        status, 
        answer, 
        runID: normalizedRunID,
        pipelineID: normalizedPipelineID,
        meta, 
        error 
      }
      jobUpdates.set(normalizedRunID, update)

      // Clean up completed jobs after 5 minutes
      if (status === 'completed' || status === 'error') {
        setTimeout(() => jobUpdates.delete(normalizedRunID), 300000)
      }

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
        const update = jobUpdates.get(runID)

        if (!update) {
          return new Response(
            JSON.stringify({ status: 'pending' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify(update),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // List all jobs (for debugging)
      const allJobs = Object.fromEntries(jobUpdates)
      return new Response(
        JSON.stringify({ jobs: allJobs, count: jobUpdates.size }),
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
