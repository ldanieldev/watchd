import type { ShallowRef } from 'vue'

/** Tracks whether a line-clamped element is cutting off text, so a "Show more" toggle only appears when it is. */
export function useClampedText(element: Readonly<ShallowRef<HTMLElement | null>>) {
  const expanded = ref(false)
  const clamped = ref(false)
  let resizeObserver: ResizeObserver | undefined

  function measure() {
    if (element.value && !expanded.value) clamped.value = element.value.scrollHeight > element.value.clientHeight
  }

  onMounted(() => {
    measure()
    if (!element.value) return
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element.value)
  })
  onBeforeUnmount(() => resizeObserver?.disconnect())

  return { expanded, clamped }
}
