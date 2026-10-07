import { createBrowserRouter, type RouteObject } from 'react-router';
import { RootLayout } from './components/layout/RootLayout';
import { listingRoutes } from './features/listing/routes';
import { contentPageLoader, homeLoader } from './features/content';
import { guestOnly, requireAuth } from './features/session';
import { NotFound } from './routes/NotFound';
import { RouteError } from './routes/RouteError';

// Route table (plan §8.1, spec §10.1). Data-mode router; page routes are added stage by stage.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/styleguide',
        lazy: async () => ({ Component: (await import('./routes/dev/Styleguide')).Styleguide }),
        handle: { title: () => 'Styleguide' },
      },
    ]
  : [];

const authPage = (name: 'LoginPage' | 'SignupPage' | 'ForgotPasswordPage') => async () => ({ Component: (await import('./routes/auth/AuthPages'))[name] });

/** Auth pages (AUTH-001…010). Login and sign-up skip straight to the destination when already logged in. */
const authRoutes: RouteObject[] = [
  { path: 'login', loader: guestOnly, lazy: authPage('LoginPage'), handle: { title: () => 'Log in' } },
  { path: 'signup', loader: guestOnly, lazy: authPage('SignupPage'), handle: { title: () => 'Create account' } },
  { path: 'forgot-password', lazy: authPage('ForgotPasswordPage'), handle: { title: () => 'Reset password' } },
];

const accountPage = (name: 'AccountHome' | 'EditProfilePage' | 'CreditsPage' | 'GiftCardsPage' | 'SavedCardsPage' | 'ContactUsPage') => async () => ({
  Component: (await import('./routes/account/AccountPages'))[name],
});

/** Protected routes (AUTH-015): the guard loader sends guests to the login page and back. */
const accountRoutes: RouteObject[] = [
  { path: 'account', loader: requireAuth, lazy: accountPage('AccountHome'), handle: { title: () => 'My account' } },
  { path: 'account/profile', loader: requireAuth, lazy: accountPage('EditProfilePage'), handle: { title: () => 'Edit profile' } },
  { path: 'account/credits', loader: requireAuth, lazy: accountPage('CreditsPage'), handle: { title: () => 'Credits' } },
  { path: 'account/gift-cards', loader: requireAuth, lazy: accountPage('GiftCardsPage'), handle: { title: () => 'Gift cards' } },
  { path: 'account/cards', loader: requireAuth, lazy: accountPage('SavedCardsPage'), handle: { title: () => 'Saved cards' } },
  { path: 'account/support', loader: requireAuth, lazy: accountPage('ContactUsPage'), handle: { title: () => 'Contact us' } },
  { path: 'demo-help', lazy: async () => ({ Component: (await import('./routes/DemoHelp')).DemoHelpPage }), handle: { title: () => 'Demo help' } },
];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        // Page errors and 404s render inside the layout, so the header, search and scroll restoration stay (GLB-005).
        errorElement: <RouteError />,
        children: [
          { index: true, loader: homeLoader, lazy: async () => ({ Component: (await import('./routes/Home')).Home }) },
          {
            path: 'pages/:slug',
            lazy: async () => ({ Component: (await import('./routes/ContentPage')).ContentPage }),
            loader: contentPageLoader,
            handle: { title: (d: unknown) => (d as { title: string }).title },
          },
          ...authRoutes,
          { path: 'bag', lazy: async () => ({ Component: (await import('./routes/bag/BagPage')).BagPage }), handle: { title: () => 'Bag' } },
          { path: 'wishlist', lazy: async () => ({ Component: (await import('./routes/bag/WishlistPage')).WishlistPage }), handle: { title: () => 'Wishlist' } },
          ...accountRoutes,
          ...devRoutes,
          ...listingRoutes,
          { path: '*', element: <NotFound />, handle: { title: () => 'Page not found' } },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
