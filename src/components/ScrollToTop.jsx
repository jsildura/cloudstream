import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
    const location = useLocation();

    useEffect(() => {
        // If navigation requests scrolling to a specific section, don't reset to top
        if (location.state?.scrollToSection) {
            return;
        }
        window.scrollTo(0, 0);
    }, [location.pathname, location.state]);

    return null;
};

export default ScrollToTop;
