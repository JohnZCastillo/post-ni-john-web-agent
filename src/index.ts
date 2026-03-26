import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { createNodeWebSocket } from '@hono/node-ws'

import * as mongoose from "mongoose";
import { Request } from './schema/schema.js';

import dotenv from 'dotenv';

import * as jsondiffpatch from 'jsondiffpatch';
import { md5 } from 'js-md5';
import { cors } from 'hono/cors'
import { json } from 'stream/consumers';
import saveRequest from './action/saveRequest.js';

dotenv.config();

const app = new Hono()
const port =  parseInt(process.env.PORT || '3000');

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.use('*', cors({origin: '*'}))


const clients = new Set();

app.get('/workspace', async (c) => {

  const {workspace} = c.req.query();

  await mongoose.connect(process.env.MONGO_DB_CONNECTION!);

  const request = await Request.insertOne({
    workspaceId: workspace,
    content: []
  });

  return c.json(request);
})

app.post('/sync/:workspace', async (c) => {

  const {workspace} = c.req.param();
  const {content} = await c.req.json();

  await mongoose.connect(process.env.MONGO_DB_CONNECTION!);

  const request = await Request.findOne({workspaceId: workspace});

  if(request == null){
    throw new Error('Workspace not found');
  }

  const diffpatcher = jsondiffpatch.create({
    objectHash: function (obj: any) {
      let decorated : {id: string} = obj;
      return decorated.id;
    },
  });

  const delta = diffpatcher.diff(request.content, content);

  if(delta){
    jsondiffpatch.patch(request.content, delta);
    request.markModified("content");
    await request.save();
  }

  return c.json(request);
 
})

app.get('/sync/:workspace', async (c) => {

  const {workspace} = c.req.param();

  await mongoose.connect(process.env.MONGO_DB_CONNECTION!);

  const request = await Request.findOne({workspaceId: workspace});

  if(request == null){
    return c.json({message: 'workspace not found'}, 404);
  }

  return c.json({data: request.content, hash: md5(JSON.stringify(request.content))});
})

app.all('/agent', async (c) => {

  const targetUrl = c.req.query('targetUrl');

  const clonedReq = await cloneRawRequest(c.req)
  
  return fetch(targetUrl!, clonedReq)

})

app.get(
  '/ws/:workspaceId',
  upgradeWebSocket(async (c) => {
    
    const {workspaceId}  = c.req.param();

    await mongoose.connect(process.env.MONGO_DB_CONNECTION!);

    return  {
      onOpen(event, ws){

      clients.add(ws);

       Request.findOne({workspaceId: workspaceId}).then(request => {
          ws.send(JSON.stringify({
              content: request?.content ?? [], 
              clientId: '', 
              initial: true
          })); 
       })

      },
      onMessage(event, ws) {
        
        const {clientId, content} = JSON.parse(event.data);
        
        console.log('saving request');

        saveRequest({id: workspaceId, data: content}).then(res =>{
          
          clients.forEach(client => {

            if(!client.readyState){
                return;
            }

            client.send(JSON.stringify({
              clientId: clientId,
              content: res
            }));
          })
        })
       
      },
      onClose(event, ws) {
        clients.delete(ws);
      },
      onError(event, ws) {
        clients.clear();
        console.error('WebSocket error:', event);
      }
    }
  })
)

app.onError((error,c) => {
  console.log(error);
  return c.text('Custom Error Message', 500)
})

const server = serve({
  fetch: app.fetch,
  port: port
}, (info) => {
})

injectWebSocket(server)

console.log('test');