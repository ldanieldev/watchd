<script setup lang="ts">
const { title, summary, detail } = await useDetailTitle('episodic')
useHead({ title: () => title.value.name })
</script>

<template>
  <MediaDetailShowDetail
    :title="title"
    :summary="summary"
    :detail="detail"
  />
</template>
