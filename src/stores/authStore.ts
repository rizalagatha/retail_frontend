import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { jwtDecode } from "jwt-decode";
import axios from "axios";

interface User {
  kode: string;
  nama: string;
  cabang: string;
  cabangNama: string;
  canApproveCorrection?: boolean;
  canApprovePrice?: boolean;
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

interface LoginResponse {
  token: string;
  user: User;
  permissions: Permission[];
}

// 'useAuthStore' adalah nama hook yang akan kita gunakan di komponen
export const useAuthStore = defineStore("auth", () => {
  const router = useRouter();

  // --- STATE ---
  // State utama yang akan kita simpan
  const token = ref<string | null>(localStorage.getItem("authToken"));
  const user = ref<User | null>(JSON.parse(localStorage.getItem("userData") || "null"));
  const permissions = ref<Permission[]>(
    JSON.parse(localStorage.getItem("userPermissions") || "[]")
  );
  const isSessionExpired = ref(false);

  // --- GETTERS ---
  // Cara mudah untuk mendapatkan data turunan dari state
  const isAuthenticated = computed(() => {
    // Pengguna dianggap login HANYA JIKA ada token DAN token tersebut BELUM kedaluwarsa.
    return !!token.value && !isTokenExpired.value;
  });
  const userName = computed(() => user.value?.nama || "User");
  const userInitial = computed(() => userName.value.charAt(0).toUpperCase());
  const userCabang = computed(() => user.value?.cabang || "-");
  const userCabangNama = computed(() => user.value?.cabangNama || "");
  const allowedMenus = computed(() => {
    return permissions.value.filter((p) => p.view).map((p) => p.id.toString()); // convert number ke string untuk match dengan menuId di router
  });
  const isTokenExpired = computed(() => {
    if (!token.value) return true; // Jika tidak ada token, anggap saja expired
    try {
      const decoded = jwtDecode(token.value);
      // 'exp' adalah timestamp dalam DETIK, sedangkan Date.now() dalam MILIDETIK
      const expirationTime = (decoded.exp ?? 0) * 1000;
      return Date.now() > expirationTime;
    } catch {
      // Jika token tidak valid, anggap expired
      return true;
    }
  });

  const isOnline = ref(navigator.onLine);
  let heartbeatInterval: number;

  const checkServerStatus = async () => {
    try {
      // Gunakan instance axios yang bersih, tanpa interceptor
      await axios.head("/api/health");
      isOnline.value = true;
    } catch {
      isOnline.value = false;
    }
  };

  const initConnectivityCheck = () => {
    // Dengarkan event online/offline dari browser
    window.addEventListener("online", () => (isOnline.value = true));
    window.addEventListener("offline", () => (isOnline.value = false));

    // Mulai "heartbeat" ke server setiap 30 detik
    heartbeatInterval = window.setInterval(checkServerStatus, 30000);
  };

  const clearConnectivityCheck = () => {
    clearInterval(heartbeatInterval);
  };

  // --- ACTIONS ---
  // Fungsi untuk mengubah state

  // Aksi yang dipanggil setelah login berhasil
  function setLoginData(loginResponse: LoginResponse) {
    token.value = loginResponse.token;
    user.value = loginResponse.user;
    permissions.value = loginResponse.permissions;

    localStorage.setItem("authToken", loginResponse.token);
    localStorage.setItem("userData", JSON.stringify(loginResponse.user));
    localStorage.setItem("userPermissions", JSON.stringify(loginResponse.permissions));

    router.push("/");
  }

  // Aksi untuk logout
  function logout() {
    isSessionExpired.value = false;
    token.value = null;
    user.value = null;
    permissions.value = [];
    localStorage.removeItem("authToken");
    localStorage.removeItem("userData");
    localStorage.removeItem("userPermissions");
    router.push("/login");
  }

  // Aksi untuk memeriksa status login saat aplikasi dimuat
  function checkAuthStatus() {
    const storedToken = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("userData");
    const storedPermissions = localStorage.getItem("userPermissions");
    if (storedToken && storedUser) {
      token.value = storedToken;
      user.value = JSON.parse(storedUser);
    }
    if (storedPermissions) {
      permissions.value = JSON.parse(storedPermissions);
    }
  }

  function can(menuId: string, action: "view" | "insert" | "edit" | "delete"): boolean {
    // Konversi menuId (string) ke number sebelum membandingkan
    const idAsNumber = parseInt(menuId, 10);

    // Cari permission berdasarkan id (number)
    const permission = permissions.value.find((p) => p.id === idAsNumber);

    // Jika permission ditemukan, kembalikan nilai boolean dari action yang diminta
    // Jika tidak, kembalikan false
    return permission ? permission[action] : false;
  }

  function handleSessionExpired() {
    // Hanya tampilkan dialog jika belum tampil
    if (isSessionExpired.value) return;

    // Bersihkan data lama karena token sudah tidak valid
    token.value = null;
    user.value = null;
    permissions.value = [];
    localStorage.removeItem("authToken");
    localStorage.removeItem("userData");
    localStorage.removeItem("userPermissions");

    // Tampilkan dialog
    isSessionExpired.value = true;
  }

  return {
    token,
    user,
    permissions,
    isAuthenticated,
    userName,
    userInitial,
    userCabang,
    userCabangNama,
    isTokenExpired,
    setLoginData,
    logout,
    checkAuthStatus,
    can,
    allowedMenus,
    isSessionExpired,
    handleSessionExpired,
    isOnline,
    initConnectivityCheck,
    clearConnectivityCheck,
  };
});
