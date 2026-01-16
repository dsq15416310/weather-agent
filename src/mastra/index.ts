// import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { weatherWorkflow } from './workflows';
import { weatherAgent } from './agents';

// const proxyUrl = process.env.HTTPS_PROXY || 'http://192.168.2.244:1080';
// const dispatcher = new ProxyAgent(proxyUrl);
// setGlobalDispatcher(dispatcher);

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: {
    default: {
      enabled: true,
    },
  },
});
