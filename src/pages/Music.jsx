import React, { useState, useEffect } from 'react';
import './Music.css';

// Server configurations
const SERVERS = {
    us: {
        id: 'us',
        name: 'US Server',
        url: 'https://us.doubledouble.top/',
    },
    eu: {
        id: 'eu',
        name: 'EU Server',
        url: 'https://eu.doubledouble.top/',
    }
};

// Continents that should use US server
const US_SERVER_CONTINENTS = ['AS', 'NA', 'SA', 'OC', 'AF']; // Asia, North America, South America, Oceania (Australia), Africa

const Music = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [selectedServer, setSelectedServer] = useState('us'); // Default to US
    const [geoDetected, setGeoDetected] = useState(false);

    const currentServer = SERVERS[selectedServer];

    useEffect(() => {
        // Set page title
        document.title = 'Music Downloads | StreamFlix';

        // Detect user's geolocation and select appropriate server
        const detectLocation = async () => {
            try {
                // Try ip-api.com first (more reliable, no rate limiting for basic use)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch('http://ip-api.com/json/?fields=continentCode', {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    const continent = data.continentCode;

                    // Select server based on continent
                    if (US_SERVER_CONTINENTS.includes(continent)) {
                        setSelectedServer('us');
                    } else {
                        setSelectedServer('eu');
                    }
                    setGeoDetected(true);
                }
            } catch (err) {
                // If geolocation fails, keep default (US server)
                console.log('Geolocation detection failed, using default US server');
            }
        };

        detectLocation();

        return () => {
            document.title = 'StreamFlix';
        };
    }, []);

    const handleIframeLoad = () => {
        setIsLoading(false);
    };

    const handleIframeError = () => {
        setIsLoading(false);
        setError(true);
    };

    const handleOpenInNewTab = () => {
        window.open(currentServer.url, '_blank', 'noopener,noreferrer');
    };

    const handleTryOtherServer = () => {
        setIsLoading(true);
        setError(false);
        setSelectedServer(selectedServer === 'us' ? 'eu' : 'us');
    };

    return (
        <div className="music-page">
            {/* Iframe Container */}
            <div className="music-iframe-container">
                {isLoading && (
                    <div className="music-loading">
                        <div className="music-loading-spinner"></div>
                        <p>Loading {currentServer.name}...</p>
                    </div>
                )}

                {error && (
                    <div className="music-error">
                        <div className="error-icon">⚠️</div>
                        <h3>Unable to load {currentServer.name}</h3>
                        <p>Try switching to another server or open in a new tab.</p>
                        <div className="error-actions">
                            <button
                                className="music-retry-btn secondary"
                                onClick={handleTryOtherServer}
                            >
                                Try {selectedServer === 'us' ? 'EU' : 'US'} Server
                            </button>
                            <button
                                className="music-retry-btn"
                                onClick={handleOpenInNewTab}
                            >
                                Open in New Tab
                            </button>
                        </div>
                    </div>
                )}

                <iframe
                    key={selectedServer}
                    src={currentServer.url}
                    title="DoubleDouble Music Downloader"
                    className={`music-iframe ${isLoading ? 'loading' : ''} ${error ? 'hidden' : ''}`}
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                    allow="clipboard-read; clipboard-write"
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                />
            </div>

            {/* Footer Info */}
            <div className="music-footer">
                <p className="music-disclaimer">
                    Powered by <a href="" target="_blank" rel="noopener noreferrer">DoubleDouble</a> •
                    StreamFlix does not host any content. This service is provided as-is.
                </p>
            </div>
        </div>
    );
};

export default Music;


