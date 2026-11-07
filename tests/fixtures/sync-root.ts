import { FunctionComponent } from '../../src/runtime/FunctionComponent';
import type { RootOptions } from '../../src/runtime/FunctionComponent';
import type { RenderValue } from '../../src/core/types';

// M1부터 유지한 동기 계약 회귀는 M5의 명시적 sync 비교 모드에서 실행한다.
// 기본 microtask 모드는 batching.test.ts에서 별도로 검증한다.
export class SyncRoot<P> extends FunctionComponent<P> {
  constructor(render: (props: Readonly<P>) => RenderValue, props: Readonly<P>, container: HTMLElement, options: RootOptions = {}) {
    super(render, props, container, { ...options, batching: 'sync' });
  }
}
