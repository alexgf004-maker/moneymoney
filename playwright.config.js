// Pruebas de la app en un navegador con tamaño de celular (npm run test:app)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  timeout: 30000,
  use: { ...devices['Pixel 7'], baseURL: 'http://localhost:8123', trace: 'off' },
  webServer: { command: 'python3 -m http.server 8123', port: 8123, reuseExistingServer: true },
});
