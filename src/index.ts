import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { createNodeWebSocket } from '@hono/node-ws'
import type { WSContext } from 'hono/ws'

import * as mongoose from "mongoose";
import { Request } from './schema/schema.js';

import dotenv from 'dotenv';

import * as jsondiffpatch from 'jsondiffpatch';
import { md5 } from 'js-md5';
import { cors } from 'hono/cors'
import saveRequest from './action/saveRequest.js';
import { except } from 'hono/combine';

import { sign, verify } from 'hono/jwt'
import bcrypt from "bcrypt";

dotenv.config();

const app = new Hono()
const port = parseInt(process.env.PORT || '3000');

app.use('*', except('/agent/*', cors()))

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

const workspaceClients = new Map<string, Set<WSContext>>();

app.post('sign', async (c) => {

  const { workspace, password } = await c.req.json();

  const request = await Request.findOne({ workspaceId: workspace });

  if (request == null) {
    return c.json({ message: 'Invalid username or password' }, 401);
  }

  const ok = await bcrypt.compare(password, request.password);

  if (!ok) {
    return c.json({ message: 'Invalid username or password' }, 401);
  }

  const payload = {
    workspace,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  }

  const secret = process.env.JWT_SECRET;

  const token = await sign(payload, secret!)

  return c.json({ token });

})

app.get(
  '/ws/:workspaceId',
  upgradeWebSocket(async (c) => {

    const { workspaceId } = c.req.param();
    const token = c.req.query('token');

    // Verify JWT before upgrading
    if (!token) {
      return { onOpen(_event, ws) { ws.close(4001, 'Unauthorized'); } };
    }

    try {
      const payload = await verify(token, process.env.JWT_SECRET!, 'HS256') as { workspace: string };
      if (payload.workspace !== workspaceId) {
        return { onOpen(_event, ws) { ws.close(4003, 'Forbidden'); } };
      }
    } catch {
      return { onOpen(_event, ws) { ws.close(4001, 'Invalid token'); } };
    }

    return {
      onOpen(_event, ws) {

        if (!workspaceClients.has(workspaceId)) {
          workspaceClients.set(workspaceId, new Set());
        }
        workspaceClients.get(workspaceId)!.add(ws);

        Request.findOne({ workspaceId: workspaceId }).then(request => {
          ws.send(JSON.stringify({
            content: request?.content ?? [],
            clientId: '',
            initial: true
          }));
        })

      },
      onMessage(event, ws) {

        const { clientId, content } = JSON.parse(event.data as string);

        saveRequest({ id: workspaceId, data: content }).then(res => {

          const clients = workspaceClients.get(workspaceId);
          if (!clients) return;

          clients.forEach(client => {
            if (client.readyState !== 1 || res == null || client === ws) {
              return;
            }
            client.send(JSON.stringify({
              clientId: clientId,
              content: res
            }));
          })
        })

      },
      onClose(_event, ws) {
        const clients = workspaceClients.get(workspaceId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) workspaceClients.delete(workspaceId);
        }
      },
      onError(_event, _ws) {
        workspaceClients.delete(workspaceId);
        console.error(`WebSocket error in workspace: ${workspaceId}`);
      }
    }
  })
)

app.post('/workspace', async (c) => {

  const { workspace, password } = await c.req.json();

  console.log(password, process.env.SALT_ROUNDS);

  const hashed = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS!));

  await Request.insertOne({
    workspaceId: workspace,
    password: hashed,
    content: []
  });

  const payload = {
    workspace,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  }

  const secret = process.env.JWT_SECRET;

  const token = await sign(payload, secret!)

  return c.json({ token, workspace });
})

app.all('/agent', async (c) => {

  const targetUrl = c.req.query('targetUrl');

  const clonedReq = await cloneRawRequest(c.req)

  return fetch(targetUrl!, clonedReq)
})

app.onError((error, c) => {
  console.log(error);
  return c.text('Custom Error Message', 500)
})

mongoose.connect(process.env.MONGO_DB_CONNECTION!).then(() => {
  console.log('MongoDB connected');
  const server = serve({
    fetch: app.fetch,
    port: port
  });
  injectWebSocket(server);
  console.log(`Server running on port ${port}`);
});