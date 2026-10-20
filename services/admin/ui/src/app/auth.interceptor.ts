import { HttpErrorResponse, type HttpInterceptorFn } from "@angular/common/http";
import { catchError, throwError } from "rxjs";

const TOKEN_KEY = "admin_token";
const USER_KEY = "admin_user";

// Adjunta el token guardado a cada petición y, si el servidor rechaza la sesión, la limpia y recarga.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.endsWith("/api/auth/login")) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.reload();
      }
      return throwError(() => err);
    }),
  );
};
