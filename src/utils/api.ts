// src/utils/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000, // 15 detik
});

// ✅ Tambahkan interceptor request (misalnya token) nanti saat login sudah jadi
api.interceptors.request.use((config) => {
  // const token = localStorage.getItem('token');
  // if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ✅ Tambahkan interceptor response untuk handle error global
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Contoh sederhana: log error
    console.error('API error:', error.response || error.message);
    return Promise.reject(error);
  }
);

export default api;
