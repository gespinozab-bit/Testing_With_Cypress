import { defineConfig } from 'cypress';

export default defineConfig({
  video: true,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl: 'http://localhost:5173',
  },
});
