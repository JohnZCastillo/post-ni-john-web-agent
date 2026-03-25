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

import { Server }  from "socket.io";
import { Server as HttpServer } from 'http';

dotenv.config();

const app = new Hono()

const port =  parseInt(process.env.PORT || '3000');

const server = serve({
  fetch: app.fetch,
  port: port
})

const ioServer = new Server(server as HttpServer, {
  path: '/ws',
  serveClient: false,
});

ioServer.on("connection", (socket) => {
 
  console.log("client connected");

  socket.on('test', (msg) => {
    console.log('message: ' + msg);
  });

})



app.use('*', cors({origin: '*'}))

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

app.onError((error,c) => {
  console.log(error);
  return c.text('Custom Error Message', 500)
})

app.get('/test',(c)=>{

  ioServer.emit('test', 'hello');

  return c.json({message: 'hi'});

})


