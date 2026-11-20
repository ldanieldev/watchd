<script setup lang="ts">
export interface Fact {
  label: string
  value?: string
}

const props = defineProps<{ facts: Fact[] }>()

const presentFacts = computed(() => props.facts.filter(fact => fact.value))
</script>

<template>
  <dl
    v-if="presentFacts.length"
    class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm"
  >
    <template
      v-for="fact in presentFacts"
      :key="fact.label"
    >
      <dt class="text-muted">
        {{ fact.label }}
      </dt>
      <dd class="text-default">
        {{ fact.value }}
      </dd>
    </template>
  </dl>
</template>
