// auth/auth0-interceptor.provider.ts
import { HTTP_INTERCEPTORS } from "@angular/common/http";
import { AuthHttpInterceptor } from "@auth0/auth0-angular";
import { Provider } from "@angular/core";

export function provideAuth0HttpInterceptor(): Provider {
  return {
    provide: HTTP_INTERCEPTORS,
    useClass: AuthHttpInterceptor,
    multi: true,
  };
}
