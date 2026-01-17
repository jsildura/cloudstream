/**
 * PageLoader - A lightweight loading fallback for React.lazy Suspense
 * Used when lazy-loaded page components are still loading
 */
const PageLoader = () => {
    return (
        <div className="page-loader" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            gap: '16px',
            color: '#fff'
        }}>
            <div className="loading-spinner" style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(255, 255, 255, 0.1)',
                borderTopColor: '#e50914',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
            }} />
            <p style={{
                opacity: 0.7,
                fontSize: '0.9rem',
                margin: 0
            }}>Loading...</p>
            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default PageLoader;
