function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const scrolls = ['auto', 'scroll'].includes(getComputedStyle(ancestor).overflowY) && ancestor.scrollHeight > ancestor.clientHeight
    if (scrolls) return ancestor
  }
  return null
}

/**
 * Renders a long list in batches. Bind `loadMoreRef` as the ref of a "show more" button keyed by `renderedCount`:
 * it loads the next batch when clicked or when it comes within 1200px of the bottom of whatever scrolls it.
 */
export function useRenderBatches(batchSize: number, loadMoreRef: string) {
  const renderedCount = ref(batchSize)
  const loadMoreButton = useTemplateRef<{ $el: HTMLElement }>(loadMoreRef)
  let observer: IntersectionObserver | undefined

  function renderMore() {
    renderedCount.value += batchSize
  }

  function reset() {
    renderedCount.value = batchSize
  }

  // IntersectionObserver only fires on crossings, so the button is re-keyed per batch: each new instance gets an initial callback and loading continues while it stays near the bottom.
  watch(loadMoreButton, (button) => {
    observer?.disconnect()
    if (!button) return
    observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) renderMore()
    }, { root: scrollingAncestor(button.$el), rootMargin: '0px 0px 1200px 0px' })
    observer.observe(button.$el)
  }, { flush: 'post' })
  onBeforeUnmount(() => observer?.disconnect())

  return { renderedCount, renderMore, reset }
}
