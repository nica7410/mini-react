import type { FullConfig, FullResult, Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { mkdirSync, writeFileSync } from 'node:fs';

export default class TimingReporter implements Reporter {
  private start = Date.now();
  private configuration: unknown;
  private tests: Record<string, unknown>[] = [];
  private steps = new Map<TestResult, unknown[]>();
  onBegin(config: FullConfig) { this.configuration = { workers: config.workers, projects: config.projects.map(p => ({ name: p.name, retries: p.retries, timeout: p.timeout })) }; }
  onTestBegin(test: TestCase, result: TestResult) {
    this.steps.set(result, []);
    this.tests.push({ id: test.id, title: test.title, project: test.parent.project()?.name, worker: result.workerIndex, startMs: Date.now() - this.start, result });
  }
  onStepEnd(_test: TestCase, result: TestResult, step: TestStep) {
    this.steps.get(result)?.push({ title: step.title, category: step.category, durationMs: step.duration, parent: step.parent?.title, error: step.error?.message });
  }
  onEnd(result: FullResult) {
    mkdirSync('.validation', { recursive: true });
    writeFileSync('.validation/browser-timings.json', JSON.stringify({ configuration: this.configuration, status: result.status, durationMs: result.duration,
      tests: this.tests.map(test => { const r = test.result as TestResult; return { ...test, result: undefined, status: r.status, retry: r.retry, durationMs: r.duration, steps: this.steps.get(r) }; }),
    }, null, 2));
  }
}
