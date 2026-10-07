import { createBrowserRouter, type RouteObject } from 'react-router';
import { RootLayout } from './components/layout/RootLayout';
import { ContentPage, contentPageLoader } from './routes/ContentPage';
import { Home } from './routes/Home';
import { NotFound } from './routes/NotFound';
import { RouteError } from './routes/RouteError';

// Route table (plan §8.1, spec §10.1). Data-mode router; page routes are added stage by stage.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: 'dev/styleguide', lazy: async () => ({ Component: (await import('./routes/dev/Styleguide')).Styleguide }), handle: { title: () => 'Styleguide' } }]
  : [];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: 'pages/:slug', element: <ContentPage />, loader: contentPageLoader, handle: { title: (d: unknown) => (d as { title: string }).title } },
      ...devRoutes,
      { path: '*', element: <NotFound />, handle: { title: () => 'Page not found' } },
    ],
  },
];

export const router = createBrowserRouter(routes);
