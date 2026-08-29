<script setup lang="ts">
function testSentry() {
  throw new Error('this is just a test')
}
</script>

<template>
  <div>
    <UPageSection>
      <UButton @click="testSentry">
        Test Sentry
      </UButton>
    </UPageSection>
  </div>
</template>
