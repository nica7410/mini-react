import { runBenchmark } from './harness';
import type { BenchmarkInput } from './harness';

const output = document.getElementById('benchmark-output')!;
Object.assign(window, { miniReactBenchmark: { run: (input: BenchmarkInput) => runBenchmark(input, output) } });
