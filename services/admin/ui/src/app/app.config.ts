import { provideHttpClient, withInterceptors } from "@angular/common/http";
import type { ApplicationConfig } from "@angular/core";
import { provideBrowserGlobalErrorListeners } from "@angular/core";
import { authInterceptor } from "./auth.interceptor";

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient(withInterceptors([authInterceptor]))],
};
