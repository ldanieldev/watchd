<script setup lang="ts">
import { seasonName } from '~~/shared/utils/library/detail'

const { title, season, detail } = await useDetailTitle('episodic')
useHead({ title: () => `${title.value.name}, ${seasonName(season.value!, detail.value?.seasons)}` })
</script>

<template>
  <MediaDetailSeasonDetail
    :title="title"
    :season="season!"
    :detail="detail"
  />
</template>
