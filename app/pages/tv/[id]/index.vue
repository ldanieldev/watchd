<script setup lang="ts">
const { title, summary, detail } = useDetailTitle('episodic')
useHead({ title: () => title.value.name })
</script>

<template>
  <MediaDetailShowDetail
    :title="title"
    :summary="summary"
    :detail="detail"
  />
</template>
