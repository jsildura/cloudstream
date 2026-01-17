import { useEffect } from 'react';
import { setPageMeta, resetToDefaultMeta } from '../utils/metaUtils';

/**
 * MetaTags Component
 * Updates document head meta tags reactively based on props
 * Resets to defaults when component unmounts
 * 
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {string} props.description - Meta description
 * @param {string} props.image - OG/Twitter image URL
 * @param {string} props.url - Canonical URL
 * @param {string} props.type - OG type (website, video.movie, video.tv_show)
 */
const MetaTags = ({ title, description, image, url, type = 'website' }) => {
    useEffect(() => {
        // Update meta tags when props change
        setPageMeta({ title, description, image, url, type });

        // Cleanup: reset to defaults when unmounting
        return () => {
            resetToDefaultMeta();
        };
    }, [title, description, image, url, type]);

    // This component renders nothing - it only manages the document head
    return null;
};

export default MetaTags;
