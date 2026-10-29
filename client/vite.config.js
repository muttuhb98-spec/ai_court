import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: '/ai_court/', plugins: [react()], server: { port: 5173 }, test: { environment: 'jsdom', setupFiles: './src/testSetup.js' } });
