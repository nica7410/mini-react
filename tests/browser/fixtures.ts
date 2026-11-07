import { test as base, expect } from '@playwright/test';

// Diagnostics are independent from assertions and never retry an action.
export const test = base.extend<{ diagnostics: void }>({
  diagnostics: [async ({ page }, use, info) => {
    const requests: unknown[] = [];
    page.on('requestfinished', request => requests.push({ url: request.url(), timing: request.timing() }));
    page.on('requestfailed', request => requests.push({ url: request.url(), failure: request.failure(), timing: request.timing() }));
    await page.addInitScript(() => {
      const marks: Record<string, number> = {};
      Object.assign(window, { browserDiagnosticMarks: marks });
      addEventListener('DOMContentLoaded', () => { marks.domContentLoaded = performance.now(); }, { once: true });
      addEventListener('load', () => { marks.load = performance.now(); }, { once: true });
      const observer = new MutationObserver(() => {
        if (document.querySelector('#task-app [data-testid="task-summary"]') && document.querySelector('#history-status')?.textContent) {
          marks.appReady = performance.now(); observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true, characterData: true });
    });
    try { await use(); }
    finally {
      let browser: unknown;
      try { browser = await page.evaluate(() => ({ navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
        marks: (window as unknown as { browserDiagnosticMarks: unknown }).browserDiagnosticMarks })); } catch { /* a closed/crashed page is recorded by Playwright */ }
      await info.attach('browser-diagnostics', { body: JSON.stringify({ project: info.project.name, worker: info.workerIndex, requests, browser }), contentType: 'application/json' });
    }
  }, { auto: true }],
});
export { expect };
