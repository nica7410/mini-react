import type { CommitCounters, FormPolicy } from '../types';

export function readForm(element: HTMLElement): FormPolicy | null {
  switch (element.localName) {
    case 'input': {
      const input = element as HTMLInputElement;
      return { mode: 'snapshot', value: input.value, checked: input.checked };
    }
    case 'textarea': return { mode: 'snapshot', value: (element as HTMLTextAreaElement).value };
    case 'select': return {
      mode: 'snapshot',
      selectedIndices: Array.from((element as HTMLSelectElement).options).flatMap((o, i) => o.selected ? [i] : []),
    };
    default: return null;
  }
}

export function syncForm(element: HTMLElement, policy: FormPolicy, initial: boolean, counts: CommitCounters): void {
  if (policy.mode === 'uncontrolled' && !initial) return;
  const value = policy.mode === 'uncontrolled' ? policy.defaultValue : policy.value;
  const checked = policy.mode === 'uncontrolled' ? policy.defaultChecked : policy.checked;
  if (value !== undefined && ['input', 'textarea'].includes(element.localName)) {
    const input = element as HTMLInputElement;
    if (input.value !== value) { input.value = value; counts.propertyWrites++; }
    else counts.skippedHostCalls++;
  }
  if (checked !== undefined && element.localName === 'input') {
    const input = element as HTMLInputElement;
    if (input.checked !== checked) { input.checked = checked; counts.propertyWrites++; }
    else counts.skippedHostCalls++;
  }
  if (policy.selectedIndices !== undefined && element.localName === 'select') {
    const select = element as HTMLSelectElement;
    // 빈 선택도 표현한다. option 삽입/삭제와 배치가 끝난 다음 실행한다.
    const selected = new Set(policy.selectedIndices);
    Array.from(select.options).forEach((option, i) => {
      if (option.selected !== selected.has(i)) { option.selected = selected.has(i); counts.propertyWrites++; }
    });
    if (!selected.size && select.selectedIndex !== -1) { select.selectedIndex = -1; counts.propertyWrites++; }
  }
}
