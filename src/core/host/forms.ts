import type { CommitCounters, FormPolicy } from '../types';

export function readForm(element: HTMLElement): FormPolicy | null {
  switch (element.localName) {
    case 'input': {
      const input = element as HTMLInputElement;
      if (input.type === 'file' && input.files?.length) throw new Error('선택된 file input의 파일 목록은 캡처/복원할 수 없습니다.');
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
    if (initial && policy.mode === 'uncontrolled' && input.defaultValue !== value) { input.defaultValue = value; counts.propertyWrites++; }
    if (input.value !== value) { input.value = value; counts.propertyWrites++; }
    else counts.skippedHostCalls++;
  }
  if (checked !== undefined && element.localName === 'input') {
    const input = element as HTMLInputElement;
    if (initial && policy.mode === 'uncontrolled' && input.defaultChecked !== checked) { input.defaultChecked = checked; counts.propertyWrites++; }
    if (input.checked !== checked) { input.checked = checked; counts.propertyWrites++; }
    else counts.skippedHostCalls++;
  }
  if (policy.selectedIndices !== undefined && element.localName === 'select') {
    const select = element as HTMLSelectElement;
    // 빈 선택도 표현한다. option 삽입/삭제와 배치가 끝난 다음 실행한다.
    const selected = new Set(policy.selectedIndices);
    if (!select.multiple) {
      const index = policy.selectedIndices[0] ?? -1;
      if (select.selectedIndex !== index) { select.selectedIndex = index; counts.propertyWrites++; }
    } else {
      Array.from(select.options).forEach((option, i) => {
        if (option.selected !== selected.has(i)) { option.selected = selected.has(i); counts.propertyWrites++; }
      });
    }
    if (initial && policy.mode === 'uncontrolled') Array.from(select.options).forEach((option, i) => {
      if (option.defaultSelected !== selected.has(i)) { option.defaultSelected = selected.has(i); counts.propertyWrites++; }
    });
  }
}
