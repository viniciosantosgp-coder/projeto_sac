import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { AppComponent } from './app/app.component';
import { ROTAS } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideRouter(ROTAS, withHashLocation())]
}).catch(err => console.error(err));
