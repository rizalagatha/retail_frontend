import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// Buat instance Axios dengan tipe yang jelas
const api: AxiosInstance = axios.create({
  baseURL: 'http://192.168.1.73:8000/api',
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

api.interceptors.response.use(
  (response) => {
    // Jika response sukses, langsung kembalikan
    return response;
  },
  (error) => {
    const authStore = useAuthStore();
    
    // Cek jika error adalah 401 (Unauthorized)
    if (error.response && error.response.status === 401) {
      // Panggil fungsi untuk menampilkan dialog sesi habis
      authStore.handleSessionExpired();
    }

    // Kembalikan error agar bisa ditangani lebih lanjut jika perlu
    return Promise.reject(error);
  }
);

export default api;