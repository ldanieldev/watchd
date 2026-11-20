<script setup lang="ts">
import { personDetailFor } from '~/utils/library/details'

const route = useRoute()
const person = personDetailFor(Number(route.params.id))
if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
useHead({ title: person.name })
</script>

<template>
  <MediaDetailPersonDetail :person="person" />
</template>
