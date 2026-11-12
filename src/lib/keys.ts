import { onBeforeUnmount, onMounted } from 'vue';

/** 页面级快捷键。在输入框里打字、或者按着 Ctrl/Alt/Meta 时不触发。 */
export function useHotkeys(handler: (key: string, event: KeyboardEvent) => void): void {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    handler(e.key === ' ' ? 'Space' : e.key.toLowerCase(), e);
  };
  onMounted(() => window.addEventListener('keydown', onKey));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
}

/** 鼠标点过的按钮会留着焦点，之后按空格会再次触发它，所以换题时把焦点清掉 */
export function dropFocus(): void {
  (document.activeElement as HTMLElement | null)?.blur();
}
