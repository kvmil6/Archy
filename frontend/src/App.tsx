import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CanvasPage from './pages/CanvasPage';
import { ToastProvider } from './components/Toast';
import HealthBanner from './components/HealthBanner';

const NotFound = () => (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <div className="text-center">
            <div className="text-4xl font-bold mb-2">404</div>
            <div className="text-sm opacity-60">Page not found</div>
        </div>
    </div>
);

function App() {
    return (
        <ToastProvider>
            <BrowserRouter>
                <div className="min-h-screen" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
                    <HealthBanner />
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/canvas" element={<CanvasPage />} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </div>
            </BrowserRouter>
        </ToastProvider>
    );
}

export default App;