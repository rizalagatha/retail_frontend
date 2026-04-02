<script setup lang="ts">
const emit = defineEmits(["close", "submit"]);

const ratings = [
  { value: 1, text: "Kecewa", icon: "mdi-emoticon-sad-outline", color: "red" },
  { value: 3, text: "Biasa", icon: "mdi-emoticon-neutral-outline", color: "orange" },
  { value: 5, text: "Puas", icon: "mdi-emoticon-happy-outline", color: "green" },
];

const submitRating = (ratingValue: number) => {
  emit("submit", ratingValue);
  emit("close");
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="500px">
    <v-card class="text-center pa-4">
      <v-card-title class="text-h6">Bagaimana Pengalaman Belanja Anda?</v-card-title>
      <v-card-text>
        <div class="d-flex justify-space-around my-4">
          <div
            v-for="rating in ratings"
            :key="rating.value"
            class="rating-item"
            @click="submitRating(rating.value)"
          >
            <v-icon :icon="rating.icon" :color="rating.color" size="64"></v-icon>
            <div class="mt-2 text-caption">{{ rating.text }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.rating-item {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.rating-item:hover {
  transform: scale(1.1);
}
</style>
