export const DebugBanner = () => (
    <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: '#22c55e',
        color: 'white',
        padding: '10px',
        textAlign: 'center',
        zIndex: 9999,
        fontWeight: 'bold'
    }}>
        ✅ REACT IS WORKING! If you see this, the app is mounting.
    </div>
)