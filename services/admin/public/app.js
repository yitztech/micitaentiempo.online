/**
 * Mi Cita en Tiempo — Panel de Administración
 * Frontend SPA en AngularJS v1.8.3
 */
(() => {
  var app = angular.module("adminApp", []);

  // ── Interceptor HTTP para adjuntar token de autorización ──
  app.factory("authInterceptor", [
    "$q",
    "$window",
    ($q, $window) => ({
      request: (config) => {
        var token = $window.localStorage.getItem("admin_token");
        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = "Bearer " + token;
        }
        return config;
      },
      responseError: (rejection) => {
        if (rejection.status === 401 && !rejection.config.url.endsWith("/api/auth/login")) {
          $window.localStorage.removeItem("admin_token");
          $window.localStorage.removeItem("admin_user");
          $window.location.reload();
        }
        return $q.reject(rejection);
      },
    }),
  ]);

  app.config([
    "$httpProvider",
    ($httpProvider) => {
      $httpProvider.interceptors.push("authInterceptor");
    },
  ]);

  // ── Servicio de API del Panel de Administración ──
  app.factory("AdminService", [
    "$http",
    ($http) => ({
      login: (username, password) =>
        $http.post("/api/auth/login", { username: username, password: password }),
      logout: () => $http.post("/api/auth/logout", {}),
      getMe: () => $http.get("/api/auth/me"),
      getStats: () => $http.get("/api/stats"),
      getUsers: (search, filter) =>
        $http.get("/api/users", {
          params: { q: search || undefined, filter: filter !== "all" ? filter : undefined },
        }),
      blockUser: (userId, email, reason) =>
        $http.post("/api/users/" + encodeURIComponent(userId) + "/block", {
          email: email,
          reason: reason,
        }),
      unblockUser: (userId) => $http.post("/api/users/" + encodeURIComponent(userId) + "/unblock", {}),
      getSubscriptions: () => $http.get("/api/subscriptions"),
      getBlockedUsers: () => $http.get("/api/blocked-users"),
      getAuditLogs: () => $http.get("/api/audit-logs"),
    }),
  ]);

  // ── Controlador Principal del Panel ──
  app.controller("MainController", [
    "$timeout",
    "$window",
    "AdminService",
    function ($timeout, $window, AdminService) {
      var vm = this;

      // Estado de sesión
      vm.isLoggedIn = false;
      vm.adminUser = null;
      vm.loading = false;
      vm.loginError = null;
      vm.loginForm = {
        username: "yunerkis",
        password: "",
      };

      // Navegación
      vm.currentTab = "stats";

      // Datos
      vm.stats = {};
      vm.users = [];
      vm.filteredUsers = [];
      vm.userSearch = "";
      vm.userFilter = "all";

      vm.subscriptions = [];
      vm.cancellations = [];
      vm.subscriptionSummary = {
        totalSubscriptions: 0,
        totalCanceled: 0,
        churnRatePercent: 0,
      };

      vm.blockedUsers = [];
      vm.auditLogs = [];

      // Modal de Bloqueo
      vm.modalOpen = false;
      vm.selectedUser = null;
      vm.selectedReasonPreset = "Uso abusivo de reservas y spam";
      vm.blockReason = "Uso abusivo de reservas y spam";

      // Mensajes de retroalimentación
      vm.successMessage = null;
      vm.errorMessage = null;

      function notify(type, msg) {
        if (type === "success") {
          vm.successMessage = msg;
          vm.errorMessage = null;
        } else {
          vm.errorMessage = msg;
          vm.successMessage = null;
        }
        $timeout(() => {
          if (type === "success") vm.successMessage = null;
          else vm.errorMessage = null;
        }, 5000);
      }

      // Comprobar sesión al inicio
      function init() {
        var savedToken = $window.localStorage.getItem("admin_token");
        if (savedToken) {
          AdminService.getMe()
            .then((res) => {
              vm.isLoggedIn = true;
              vm.adminUser = res.data.user;
              vm.loadCurrentTabData();
            })
            .catch(() => {
              vm.isLoggedIn = false;
              $window.localStorage.removeItem("admin_token");
            });
        }
      }

      vm.login = () => {
        vm.loading = true;
        vm.loginError = null;

        AdminService.login(vm.loginForm.username, vm.loginForm.password)
          .then((res) => {
            vm.isLoggedIn = true;
            vm.adminUser = res.data.user;
            $window.localStorage.setItem("admin_token", res.data.token);
            $window.localStorage.setItem("admin_user", JSON.stringify(res.data.user));
            vm.loginForm.password = "";
            vm.loadCurrentTabData();
            notify("success", "Sesión iniciada con éxito. Bienvenido, " + vm.adminUser.username);
          })
          .catch((err) => {
            vm.loginError = err.data?.error || "Error al iniciar sesión";
          })
          .finally(() => {
            vm.loading = false;
          });
      };

      vm.logout = () => {
        AdminService.logout().finally(() => {
          vm.isLoggedIn = false;
          vm.adminUser = null;
          $window.localStorage.removeItem("admin_token");
          $window.localStorage.removeItem("admin_user");
        });
      };

      vm.setTab = (tab) => {
        vm.currentTab = tab;
        vm.loadCurrentTabData();
      };

      vm.refreshCurrentTab = () => {
        vm.loadCurrentTabData();
        notify("success", "Datos actualizados");
      };

      vm.loadCurrentTabData = () => {
        if (!vm.isLoggedIn) return;
        vm.loading = true;

        if (vm.currentTab === "stats") {
          AdminService.getStats()
            .then((res) => {
              vm.stats = res.data;
            })
            .finally(() => {
              vm.loading = false;
            });
        } else if (vm.currentTab === "users") {
          AdminService.getUsers(vm.userSearch, vm.userFilter)
            .then((res) => {
              vm.users = res.data.users || [];
              vm.filterUsers();
            })
            .finally(() => {
              vm.loading = false;
            });
        } else if (vm.currentTab === "subscriptions") {
          AdminService.getSubscriptions()
            .then((res) => {
              vm.subscriptions = res.data.subscriptions || [];
              vm.cancellations = res.data.cancellations || [];
              vm.subscriptionSummary = res.data.summary || vm.subscriptionSummary;
            })
            .finally(() => {
              vm.loading = false;
            });
        } else if (vm.currentTab === "blocked") {
          AdminService.getBlockedUsers()
            .then((res) => {
              vm.blockedUsers = res.data.blocked || [];
            })
            .finally(() => {
              vm.loading = false;
            });
        } else if (vm.currentTab === "audit") {
          AdminService.getAuditLogs()
            .then((res) => {
              vm.auditLogs = res.data.logs || [];
            })
            .finally(() => {
              vm.loading = false;
            });
        }
      };

      // ── Filtros de usuarios ──
      vm.setUserFilter = (filter) => {
        vm.userFilter = filter;
        vm.filterUsers();
      };

      vm.filterUsers = () => {
        var q = (vm.userSearch || "").toLowerCase().trim();
        vm.filteredUsers = vm.users.filter((user) => {
          // Filtro de texto
          var matchesText =
            !q ||
            (user.name && user.name.toLowerCase().indexOf(q) !== -1) ||
            (user.email && user.email.toLowerCase().indexOf(q) !== -1);

          if (!matchesText) return false;

          // Filtro de estado
          if (vm.userFilter === "verified") return user.email_verified;
          if (vm.userFilter === "blocked") return user.is_blocked;
          return true;
        });
      };

      // ── Modal y acciones de bloqueo ──
      vm.openBlockModal = (user) => {
        vm.selectedUser = user;
        vm.selectedReasonPreset = "Uso abusivo de reservas y spam";
        vm.blockReason = "Uso abusivo de reservas y spam";
        vm.modalOpen = true;
      };

      vm.closeBlockModal = () => {
        vm.modalOpen = false;
        vm.selectedUser = null;
      };

      vm.applyPresetReason = () => {
        if (vm.selectedReasonPreset !== "Otro motivo especificado manualmente") {
          vm.blockReason = vm.selectedReasonPreset;
        }
      };

      vm.confirmBlockUser = () => {
        if (!vm.selectedUser) return;
        vm.loading = true;

        AdminService.blockUser(vm.selectedUser.id, vm.selectedUser.email, vm.blockReason)
          .then(() => {
            vm.modalOpen = false;
            notify("success", "Usuario " + vm.selectedUser.email + " bloqueado y sesiones revocadas");
            // Actualiza estado local
            vm.selectedUser.is_blocked = true;
            vm.loadCurrentTabData();
          })
          .catch((err) => {
            notify("danger", err.data?.error || "Error al bloquear usuario");
          })
          .finally(() => {
            vm.loading = false;
          });
      };

      vm.unblockUser = (user) => {
        if (!confirm("¿Deseas desbloquear a " + user.email + "?")) return;
        vm.loading = true;

        AdminService.unblockUser(user.id)
          .then(() => {
            notify("success", "Usuario " + user.email + " desbloqueado");
            user.is_blocked = false;
            vm.loadCurrentTabData();
          })
          .catch((err) => {
            notify("danger", err.data?.error || "Error al desbloquear usuario");
          })
          .finally(() => {
            vm.loading = false;
          });
      };

      vm.unblockDirect = (userId) => {
        if (!confirm("¿Deseas desbloquear a este usuario?")) return;
        vm.loading = true;

        AdminService.unblockUser(userId)
          .then(() => {
            notify("success", "Usuario desbloqueado con éxito");
            vm.loadCurrentTabData();
          })
          .catch((err) => {
            notify("danger", err.data?.error || "Error al desbloquear");
          })
          .finally(() => {
            vm.loading = false;
          });
      };

      init();
    },
  ]);
})();
