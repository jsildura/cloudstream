import React, { useState, useEffect, useRef } from 'react';
import './VisitorStats.css';

// Get country flag emoji from country code
const getCountryFlag = (countryCode) => {
    const flags = {
        'US': '🇺🇸',
        'PH': '🇵🇭',
        'NL': '🇳🇱',
        'GB': '🇬🇧',
        'CA': '🇨🇦',
        'AU': '🇦🇺',
        'DE': '🇩🇪',
        'FR': '🇫🇷',
        'JP': '🇯🇵',
        'KR': '🇰🇷',
        'IN': '🇮🇳',
        'BR': '🇧🇷',
        'MX': '🇲🇽',
        'ES': '🇪🇸',
        'IT': '🇮🇹',
        'RU': '🇷🇺',
        'CN': '🇨🇳',
        'SG': '🇸🇬',
        'MY': '🇲🇾',
        'ID': '🇮🇩',
        'TH': '🇹🇭',
        'VN': '🇻🇳',
        'Unknown': '🏳️'
    };
    return flags[countryCode] || '🌐';
};

// API base URL - use relative path for production
const API_BASE = '/api/visitors';

/**
 * VisitorStats - Visual widget that displays visitor statistics
 * NOTE: This component only displays stats, it does NOT send heartbeats
 * Heartbeat tracking is handled by VisitorTracker component in App.jsx
 * This widget should only be mounted on the homepage
 */
const VisitorStats = () => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [stats, setStats] = useState({
        online: 1,
        totalVisits: 0,
        uniqueVisitors: 0,
        todayVisitors: 0,
        peak: 0,
        regions: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const containerRef = useRef(null);

    // Fetch full stats from API
    const fetchStats = async () => {
        try {
            const response = await fetch(API_BASE);
            if (response.ok) {
                const data = await response.json();
                setStats({
                    online: data.online || 1,
                    totalVisits: data.totalVisits || 0,
                    uniqueVisitors: data.uniqueVisitors || 0,
                    todayVisitors: data.todayVisitors || 0,
                    peak: data.peak || 0,
                    regions: data.regions || []
                });
                setError(null);
            } else {
                throw new Error('Failed to fetch stats');
            }
        } catch (err) {
            console.error('[VisitorStats] Fetch stats error:', err);
            setError('Unable to load stats');
        } finally {
            setLoading(false);
        }
    };

    // Initial setup - only fetch stats, NO heartbeat
    useEffect(() => {
        console.log('[VisitorStats] Widget mounted - fetching stats');

        // Fetch initial stats
        fetchStats();

        // Refresh stats every 10 seconds
        const statsInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchStats();
            }
        }, 10000);

        // Cleanup on unmount
        return () => {
            console.log('[VisitorStats] Widget unmounted');
            clearInterval(statsInterval);
        };
    }, []);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsExpanded(false);
            }
        };

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isExpanded]);

    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
        if (!isExpanded) {
            fetchStats(); // Refresh stats when expanding
        }
    };

    return (
        <div className={`visitor-stats ${isExpanded ? 'expanded' : ''}`} ref={containerRef}>
            {/* Compact View */}
            <div className="visitor-stats-compact" onClick={toggleExpanded}>
                <span className="visitor-count">{stats.online}</span>
                <span className="visitor-label">online</span>
                <span className={`visitor-expand-arrow ${isExpanded ? 'rotated' : ''}`}>▼</span>
            </div>

            {/* Expanded View */}
            {isExpanded && (
                <div className="visitor-stats-expanded">
                    {error ? (
                        <div className="visitor-stats-error">{error}</div>
                    ) : (
                        <>
                            <div className="visitor-stats-row">
                                <span className="stat-label">Visits:</span>
                                <span className="stat-value">{stats.totalVisits.toLocaleString()}</span>
                            </div>

                            <div className="visitor-stats-row">
                                <span className="stat-label">Unique Visitors</span>
                                <span className="stat-value">{stats.uniqueVisitors.toLocaleString()}</span>
                            </div>

                            <div className="visitor-stats-row">
                                <span className="stat-label">Today:</span>
                                <span className={`stat-value ${loading ? 'loading' : ''}`}>
                                    {loading ? 'Loading...' : stats.todayVisitors.toLocaleString()}
                                </span>
                            </div>

                            <div className="visitor-stats-row">
                                <span className="stat-label">Peak:</span>
                                <span className="stat-value">{stats.peak}</span>
                            </div>

                            <div className="visitor-stats-row">
                                <span className="stat-label">You:</span>
                                <span className="stat-value">Online</span>
                            </div>

                            {stats.regions.length > 0 && (
                                <>
                                    <div className="visitor-stats-divider"></div>
                                    <div className="visitor-stats-section-title">
                                        <span>Online by Region:</span>
                                    </div>

                                    <div className="visitor-regions">
                                        {stats.regions.map((item, index) => {
                                            const parts = item.region.split(', ');
                                            const country = parts[1] || 'Unknown';
                                            return (
                                                <div key={index} className="region-row">
                                                    <span className="region-flag">{getCountryFlag(country)}</span>
                                                    <span className="region-name">{item.region}:</span>
                                                    <span className="region-count">{item.count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default VisitorStats;
