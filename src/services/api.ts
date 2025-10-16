import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// Buat instance Axios dengan tipe yang jelas
const api: AxiosInstance = axios.create({
<<<<<<< HEAD
  baseURL: 'http://localhost:8000/api',
=======
  baseURL: '/api',
  withCredentials: true
>>>>>>> origin/main
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