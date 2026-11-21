<script setup lang="ts">
import type { PersonDetail } from '~~/shared/types/library'

const route = useRoute()
const { data: person } = await useFetch<PersonDetail>(() => `/api/people/${route.params.id}`, { key: `person-${route.params.id}` })
if (!person.value) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
useHead({ title: () => person.value?.name ?? 'Person' })
</script>

<template>
  <MediaDetailPersonDetail
    v-if="person"
    :person="person"
  />
</template>
