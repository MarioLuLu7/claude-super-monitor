import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { WebSocketServer } from './server/ws-server';
import { injectSettings, restoreSettings } from './server/settings-manager';
import type { Plugin } from 'vite';

let wsServer: WebSocketServer | null = null;

function wsServerPlugin(): Plugin {
  return {
    name: 'ws-server',
    configureServer(server) {
      if (!wsServer) {
        // 注入白名单 + Hook
        injectSettings();

        wsServer = new WebSocketServer(3001);
        wsServer.start();

        // Vite dev server 关闭时还原
        server.httpServer?.on('close', () => {
          wsServer?.stop();
          restoreSettings();
        });

        // 进程退出时还原（Ctrl+C 等）
        for (const sig of ['SIGINT', 'SIGTERM', 'exit'] as const) {
          process.once(sig, () => {
            wsServer?.stop();
            restoreSettings();
          });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), wsServerPlugin()],
});
