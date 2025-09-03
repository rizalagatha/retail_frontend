import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

interface User {
  kode: string;
  nama: string;
  cabang: string;
}

interface Permission {
  id: number;
  name: string;
  path: string;
  view: boolean;
  insert: boolean;
  edit: boolean;
  delete: boolean;
}

// 'useAuthStore' adalah nama hook yang akan kita gunakan di komponen
export const useAuthStore = defineStore('auth', () => {
  const router = useRouter();

  // --- STATE ---
  // State utama yang akan kita simpan
  const token = ref<string | null>(localStorage.getItem('authToken'));
  const user = ref<User | null>(JSON.parse(localStorage.getItem('userData') || 'null'));
  const permissions = ref<Permission[]>(JSON.parse(localStorage.getItem('userPermissions') || '[]'));

  // --- GETTERS ---
  // Cara mudah untuk mendapatkan data turunan dari state
  const isAuthenticated = computed(() => !!token.value);
  const userName = computed(() => user.value?.nama || 'User');
  const userInitial = computed(() => userName.value.charAt(0).toUpperCase());
  const allowedMenus = computed(() => {
    return permissions.value
      .filter(p => p.view)
      .map(p => p.id.toString()); // convert number ke string untuk match dengan menuId di router
  });

  // --- ACTIONS ---
  // Fungsi untuk mengubah state

  // Aksi yang dipanggil setelah login berhasil
  function setLoginData(loginResponse: any) {
    token.value = loginResponse.token;
    user.value = loginResponse.user;
    permissions.value = loginResponse.permissions;

    localStorage.setItem('authToken', loginResponse.token);
    localStorage.setItem('userData', JSON.stringify(loginResponse.user));
    localStorage.setItem('userPermissions', JSON.stringify(loginResponse.permissions));

    router.push('/');
  }

  // Aksi untuk logout
  function logout() {
    token.value = null;
    user.value = null;
    permissions.value = [];
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('userPermissions');
    router.push('/login');
  }

  // Aksi untuk memeriksa status login saat aplikasi dimuat
  function checkAuthStatus() {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('userData');
    const storedPermissions = localStorage.getItem('userPermissions');
    if (storedToken && storedUser) {
      token.value = storedToken;
      user.value = JSON.parse(storedUser);
    }
    if (storedPermissions) {
      permissions.value = JSON.parse(storedPermissions);
    }
  }

  function can(menuId: string, action: 'view' | 'insert' | 'edit' | 'delete'): boolean {
    // Konversi menuId (string) ke number sebelum membandingkan
    const idAsNumber = parseInt(menuId, 10);
    
    // Cari permission berdasarkan id (number)
    const permission = permissions.value.find(p => p.id === idAsNumber);

    // Jika permission ditemukan, kembalikan nilai boolean dari action yang diminta
    // Jika tidak, kembalikan false
    return permission ? permission[action] : false;
}

  return {
    token,
    user,
    permissions,
    isAuthenticated,
    userName,
    userInitial,
    setLoginData,
    logout,
    checkAuthStatus,
    can,
    allowedMenus,
  };
});
