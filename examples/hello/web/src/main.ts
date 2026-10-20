import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHeimvioExtension } from '@heimvio/ext-sdk-angular';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), ...provideHeimvioExtension({ slug: 'hello' })]
}).catch((err: unknown) => console.error(err));
