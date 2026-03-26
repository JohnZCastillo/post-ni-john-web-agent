import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.get(
  '/ws/:workspaceId',
  upgradeWebSocket((c) => {
    
    const {workspaceId}  = c.req.param();

    return  {
      onOpen(event, ws){
        console.log(`Workspace id: ${workspaceId}`);
      },
      onMessage(event, ws) {
        console.log(`Received from client: ${event.data}`);
        ws.send(`Echo: ${event.data}`); 
      },
      onClose(event, ws) {
        console.log('WebSocket connection closed');
      },
      onError(event, ws) {
        console.error('WebSocket error:', event);
      }
    }
  })
)

const server = serve(app)

injectWebSocket(server)

setTimeout(()=>{
    
},5000)

console.log('Server running on http://localhost:3000');