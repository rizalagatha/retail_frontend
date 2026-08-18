import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// --- AWAL PERUBAHAN ---

// 1. Dapatkan base path / URL dari environment variable
const customApiBase = import.meta.env.VITE_API_BASE_URL;
const APP_BASE_PATH = import.meta.env.BASE_URL;

const cleanBase = APP_BASE_PATH.endsWith('/')
  ? APP_BASE_PATH.slice(0, -1)
  : APP_BASE_PATH;

let API_BASE_URL = `${cleanBase}/api`;
if (customApiBase) {
  const cleanCustom = customApiBase.endsWith('/') ? customApiBase.slice(0, -1) : customApiBase;
  API_BASE_URL = cleanCustom.endsWith('/api') ? cleanCustom : `${cleanCustom}/api`;
}

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
