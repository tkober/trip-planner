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
      import('./trips/trip-page/trip-page').then((m) => m.TripPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'timeline' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./trips/views/overview-view').then((m) => m.OverviewView),
      },
      {
        path: 'timeline',
        loadComponent: () =>
          import('./trips/timeline/timeline').then((m) => m.TimelineView),
      },
      {
        path: 'accommodations',
        loadComponent: () =>
          import('./trips/views/accommodations-view').then(
            (m) => m.AccommodationsView,
          ),
      },
      {
        path: 'transport',
        loadComponent: () =>
          import('./trips/views/transport-view').then((m) => m.TransportView),
      },
    ],
  },
  { path: '**', redirectTo: 'trips' },
];
