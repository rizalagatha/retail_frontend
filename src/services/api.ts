import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// --- AWAL PERUBAHAN ---

// 1. Dapatkan 'base' path dari environment variable.
//    Vite secara otomatis menyediakan ini dari 'base' di vite.config.ts
//    Misal: '/' (untuk release) atau '/trial/' (untuk trial)
const APP_BASE_PATH = import.meta.env.BASE_URL;

// 2. Bersihkan trailing slash (/) jika ada
const cleanBase = APP_BASE_PATH.endsWith('/')
  ? APP_BASE_PATH.slice(0, -1)
  : APP_BASE_PATH;

// 3. Buat baseURL API yang dinamis
//    - Jika build:trial, hasilnya: '/trial/api'
//    - Jika build, hasilnya: '/api'
const API_BASE_URL = `${cleanBase}/api`;

// --- AKHIR PERUBAHAN ---

// Buat instance Axios dengan tipe yang jelas
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

// Buat Interceptor dengan parameter yang sudah diberi tipe
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Ambil store. Pinia akan menangani inisialisasi jika diperlukan.
    const authStore = useAuthStore();
    const token = authStore.token;

    // Jika token ada, tambahkan ke header
    if (token) {
      // Pastikan headers tidak undefined sebelum diakses
      if (config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => {
    // Lakukan sesuatu jika ada error pada request
    return Promise.reject(error);
  }
);

// Versi baru yang lebih "pintar"
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const authStore = useAuthStore();
    if (error.response && error.response.status === 401) {

      // --- PERBAIKAN DI SINI ---
      // Cek apakah URL yang error BUKAN URL validasi PIN
      if (!error.config.url.includes('/auth-pin/validate')) {
        // Jika BUKAN dari validasi PIN, baru anggap sesi habis
        authStore.isSessionExpired = true;
      }
      // Jika INI ADALAH URL validasi PIN, kita tidak melakukan apa-apa di sini,
      // kita biarkan komponen (SoCreateView) yang menanganinya di blok `catch`.
    }
    return Promise.reject(error);
  }
);

export default api;
