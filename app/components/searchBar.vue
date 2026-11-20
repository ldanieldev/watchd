<script setup lang="ts">
const mediaCategories = [
  { value: 'movies', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
  { value: 'anime', label: 'Anime' }
]

const searchQuery = ref('')
const selectedCategory = ref('movies')

function search() {
  console.log(
    { searchQuery: searchQuery.value, selectedCategory: selectedCategory.value }
  )
}
</script>

<template>
  <div class="flex flex-row items-center ">
    <UInput
      v-model="searchQuery"
      class="w-full sm:w-lg lg:w-xl xl:w-3xl"
      icon="i-lucide-search"
      type="text"
      name="searchQuery"
      placeholder="Search..."
      aria-label="Search"
      variant="subtle"
      :ui="{ trailing: 'pe-0' }"
      @keyup.enter="search"
    >
      <template #trailing>
        <USelect
          v-model="selectedCategory"
          variant="none"
          name="selectedCategory"
          :items="mediaCategories"
          @update:model-value="search"
        />
      </template>
    </UInput>
  </div>
</template>
