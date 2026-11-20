<script setup lang="ts">
const { title, summary, detail } = useDetailTitle('movie')
useHead({ title: () => title.value.name })
</script>

<template>
  <MediaDetailMovieDetail
    :title="title"
    :summary="summary"
    :detail="detail"
  />
</template>
