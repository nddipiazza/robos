#!/usr/bin/env node
'use strict';
const {Server}=require('@modelcontextprotocol/sdk/server/index.js'),{StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js'),{ListToolsRequestSchema,CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const catalog=require('./connections'),call=require('./remote-tools').bridge(catalog.preferences(process.argv[2]||'codex'));
const server=new Server({name:'RobOS remote MCP',version:'1.0.0'},{capabilities:{tools:{listChanged:true}}});
server.setRequestHandler(ListToolsRequestSchema,()=>call('remote_tools'));
server.setRequestHandler(CallToolRequestSchema,async req=>{const result=await call('remote_call',req.params);if(req.params.name.endsWith('_connection_status')&&!result.isError)await server.sendToolListChanged();return result;});
server.connect(new StdioServerTransport()).catch(()=>{process.stderr.write('RobOS remote MCP could not start.\n');process.exitCode=1;});
