import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'trips' },
  {
    path: 'trips',
    loadComponent: () =>
      import('./trips/trip-list/trip-list').then((m) => m.TripList),
  },
  {
    path: 'trips/:id',
    loadComponent: () =>
      import('./trips/timeline/timeline').then((m) => m.Timeline),
  },
  { path: '**', redirectTo: 'trips' },
];
