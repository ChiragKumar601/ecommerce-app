import { createBrowserRouter } from 'react-router';
import { HealthPage } from './routes/HealthPage';

// Route table (plan §8.1). Data-mode router; real routes are added stage by stage.
export const router = createBrowserRouter([{ path: '/', element: <HealthPage /> }]);
