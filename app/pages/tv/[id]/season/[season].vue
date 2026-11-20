<script setup lang="ts">
import { seasonName } from '~/utils/library/detail'
import { titleDetailFor } from '~/utils/library/details'

const { title, season } = useDetailTitle('episodic')
useHead({ title: () => `${title.value.name}, ${seasonName(season.value!, titleDetailFor(title.value.id)?.seasons)}` })
</script>

<template>
  <MediaDetailSeasonDetail
    :title="title"
    :season="season!"
  />
</template>
