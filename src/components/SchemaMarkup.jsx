import { memo } from 'react';

/**
 * SchemaMarkup Component
 * Renders JSON-LD structured data as a script tag
 * Used for SEO and AI discoverability (Google AI Overviews, ChatGPT, etc.)
 */
const SchemaMarkup = memo(({ schema }) => {
    // Don't render anything if no schema provided
    if (!schema) return null;

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(schema)
            }}
        />
    );
});

SchemaMarkup.displayName = 'SchemaMarkup';

export default SchemaMarkup;
