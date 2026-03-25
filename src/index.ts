import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cloneRawRequest } from 'hono/request'

const app = new Hono()

const port =  process.env.PORT || 3000;

app.all('/agent', async (c) => {

  const targetUrl = c.req.query('targetUrl');

  const clonedReq = await cloneRawRequest(c.req)
  
  return fetch(targetUrl!, clonedReq)

})

app.onError((error,c) => {
  console.error(`${error.message}`)
  return c.text('Custom Error Message', 500)
})

serve({
  fetch: app.fetch,
  port: port
}, (info) => {
})
