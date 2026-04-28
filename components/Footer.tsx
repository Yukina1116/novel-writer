import React from 'react';
import { LegalLinkList } from './LegalLinkList';

export const Footer: React.FC = () => {
    return (
        <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2">
            <LegalLinkList
                containerClassName="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs text-gray-600 dark:text-gray-400"
                linkClassName="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
            />
        </footer>
    );
};
